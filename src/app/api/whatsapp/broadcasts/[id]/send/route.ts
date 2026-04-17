import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

// Send a broadcast — processes all pending recipients using the WhatsApp template
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const { id } = await params;

  const broadcast = await db.broadcast.findUnique({
    where: { id },
    include: {
      template: true,
      recipients: { where: { status: "PENDING" } },
    },
  });

  if (!broadcast) return NextResponse.json(fail("Broadcast not found"), { status: 404 });
  if (broadcast.status === "SENDING") return NextResponse.json(fail("Broadcast is already sending"), { status: 400 });
  if (broadcast.status === "COMPLETED") return NextResponse.json(fail("Broadcast already completed"), { status: 400 });

  if (!broadcast.template) {
    return NextResponse.json(fail("No template linked to this broadcast"), { status: 400 });
  }

  if (broadcast.template.status !== "APPROVED") {
    return NextResponse.json(
      fail(`Template "${broadcast.template.name}" is not approved (status: ${broadcast.template.status}). Sync templates to check the latest status.`),
      { status: 400 },
    );
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    return NextResponse.json(fail("WhatsApp API credentials not configured"), { status: 500 });
  }

  // Mark as sending
  await db.broadcast.update({
    where: { id },
    data: { status: "SENDING", startedAt: new Date() },
  });

  const broadcastId = id;
  const templateName = broadcast.template.name;
  const templateLang = broadcast.template.language;
  const templateVars = (broadcast.templateVars ?? {}) as Record<string, string>;
  const variableCount = broadcast.template.variableCount;
  const recipients = broadcast.recipients;
  const broadcastMessage = broadcast.message; // The resolved template text for saving to chat

  // Build template components for the API
  const components: Record<string, unknown>[] = [];
  if (variableCount > 0) {
    const parameters = Array.from({ length: variableCount }, (_, i) => ({
      type: "text",
      text: templateVars[String(i + 1)] ?? `{{${i + 1}}}`,
    }));
    components.push({ type: "body", parameters });
  }

  // Fire-and-forget background processing
  (async () => {
    let sentCount = broadcast.sentCount;
    let failedCount = broadcast.failedCount;

    for (const recipient of recipients) {
      try {
        const payload: Record<string, unknown> = {
          messaging_product: "whatsapp",
          to: recipient.phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLang },
            ...(components.length > 0 ? { components } : {}),
          },
        };

        const waRes = await fetch(
          `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        if (waRes.ok) {
          const data = (await waRes.json()) as { messages?: { id: string }[] };
          const waMsgId = data.messages?.[0]?.id ?? null;
          await db.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: "SENT", whatsappMsgId: waMsgId, sentAt: new Date() },
          });
          sentCount++;

          // Save to WhatsApp chat so it appears in the conversation UI
          try {
            const conversation = await db.whatsAppConversation.upsert({
              where: { contactPhone: recipient.phone },
              update: {
                lastMessage: broadcastMessage.length > 200 ? broadcastMessage.slice(0, 200) + "..." : broadcastMessage,
                lastMessageAt: new Date(),
              },
              create: {
                contactName: recipient.contactName ?? recipient.phone,
                contactPhone: recipient.phone,
                lastMessage: broadcastMessage.length > 200 ? broadcastMessage.slice(0, 200) + "..." : broadcastMessage,
                lastMessageAt: new Date(),
              },
            });

            await db.whatsAppMessage.create({
              data: {
                conversationId: conversation.id,
                whatsappMsgId: waMsgId,
                direction: "outbound",
                sender: "ai",
                senderName: "Broadcast",
                body: broadcastMessage,
                isAI: true,
                status: "sent",
                isRead: true,
              },
            });
          } catch (chatErr) {
            console.error("[Broadcast] Failed to save to chat:", chatErr);
          }
        } else {
          const errText = await waRes.text();
          await db.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: "FAILED", error: errText.slice(0, 500) },
          });
          failedCount++;
        }
      } catch (err) {
        await db.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED", error: String(err).slice(0, 500) },
        });
        failedCount++;
      }

      // Update counts every 5 messages
      if ((sentCount + failedCount) % 5 === 0) {
        await db.broadcast.update({
          where: { id: broadcastId },
          data: { sentCount, failedCount },
        });
      }

      // Rate limit: ~20 msgs/sec for WhatsApp Business API
      await new Promise((r) => setTimeout(r, 60));
    }

    // Final update
    await db.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: failedCount === recipients.length ? "FAILED" : "COMPLETED",
        sentCount,
        failedCount,
        completedAt: new Date(),
      },
    });
  })().catch((err) => {
    console.error("[Broadcast Send] Unexpected error:", err);
    db.broadcast.update({ where: { id: broadcastId }, data: { status: "FAILED" } }).catch(() => {});
  });

  return NextResponse.json(ok({ id: broadcastId, status: "SENDING", recipientCount: recipients.length }));
}
