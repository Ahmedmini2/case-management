import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Send a broadcast — processes all pending recipients using the WhatsApp template
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Allow either an authenticated user OR a cron call with the matching secret
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && request.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: broadcastRow, error: bErr } = await sb
    .from("broadcasts")
    .select("id, status, templateId, templateVars, sentCount, failedCount, message")
    .eq("id", id)
    .maybeSingle();

  if (bErr) return NextResponse.json(fail(bErr.message), { status: 500 });
  if (!broadcastRow) return NextResponse.json(fail("Broadcast not found"), { status: 404 });

  const broadcast = broadcastRow as {
    id: string;
    status: string;
    templateId: string | null;
    templateVars: Record<string, string> | null;
    sentCount: number;
    failedCount: number;
    message: string;
  };

  if (broadcast.status === "SENDING") return NextResponse.json(fail("Broadcast is already sending"), { status: 400 });
  if (broadcast.status === "COMPLETED") return NextResponse.json(fail("Broadcast already completed"), { status: 400 });

  // Load the template (incl. media header info for runtime header parameter)
  type Tpl = {
    id: string;
    name: string;
    language: string;
    status: string;
    variableCount: number;
    headerType: string | null;
    headerMediaUrl: string | null;
  };
  let template: Tpl | null = null;
  if (broadcast.templateId) {
    const { data: tplRow } = await sb
      .from("whatsapp_templates")
      .select("id, name, language, status, variableCount, headerType, headerMediaUrl")
      .eq("id", broadcast.templateId)
      .maybeSingle();
    template = (tplRow as Tpl | null) ?? null;
  }

  if (!template) {
    return NextResponse.json(fail("No template linked to this broadcast"), { status: 400 });
  }

  if (template.status !== "APPROVED") {
    return NextResponse.json(
      fail(
        `Template "${template.name}" is not approved (status: ${template.status}). Sync templates to check the latest status.`,
      ),
      { status: 400 },
    );
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    return NextResponse.json(fail("WhatsApp API credentials not configured"), { status: 500 });
  }

  // Load pending recipients
  const { data: recipientsRaw } = await sb
    .from("broadcast_recipients")
    .select("id, phone, contactName")
    .eq("broadcastId", id)
    .eq("status", "PENDING");

  const recipients = (recipientsRaw ?? []) as {
    id: string;
    phone: string;
    contactName: string | null;
  }[];

  // Mark as sending
  await sb
    .from("broadcasts")
    .update({ status: "SENDING", startedAt: new Date().toISOString() })
    .eq("id", id);

  const broadcastId = id;
  const templateName = template.name;
  const templateLang = template.language;
  const templateVars = (broadcast.templateVars ?? {}) as Record<string, string>;
  const variableCount = template.variableCount;
  const broadcastMessage = broadcast.message;

  const components: Record<string, unknown>[] = [];

  // Header media component (matches what was registered with Meta at template approval time)
  if (template.headerType && template.headerType !== "TEXT" && template.headerMediaUrl) {
    const fmt = template.headerType.toLowerCase(); // "image" | "video" | "document"
    const param: Record<string, unknown> = { type: fmt };
    if (fmt === "image") param.image = { link: template.headerMediaUrl };
    else if (fmt === "video") param.video = { link: template.headerMediaUrl };
    else if (fmt === "document") param.document = { link: template.headerMediaUrl, filename: "document.pdf" };
    components.push({ type: "header", parameters: [param] });
  }

  if (variableCount > 0) {
    const parameters = Array.from({ length: variableCount }, (_, i) => ({
      type: "text",
      text: templateVars[String(i + 1)] ?? `{{${i + 1}}}`,
    }));
    components.push({ type: "body", parameters });
  }

  // Fire-and-forget background processing
  (async () => {
    const sbBg = supabaseAdmin();
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
          await sbBg
            .from("broadcast_recipients")
            .update({
              status: "SENT",
              whatsappMsgId: waMsgId,
              sentAt: new Date().toISOString(),
            })
            .eq("id", recipient.id);
          sentCount++;

          // Save to WhatsApp chat so it appears in the conversation UI
          try {
            const lastMessage =
              broadcastMessage.length > 200
                ? broadcastMessage.slice(0, 200) + "..."
                : broadcastMessage;
            const nowIso = new Date().toISOString();

            // Upsert conversation by contactPhone
            const { data: existingConv } = await sbBg
              .from("whatsapp_conversations")
              .select("id")
              .eq("contactPhone", recipient.phone)
              .maybeSingle();

            let conversationId: string | null = null;
            if (existingConv) {
              conversationId = (existingConv as { id: string }).id;
              await sbBg
                .from("whatsapp_conversations")
                .update({ lastMessage, lastMessageAt: nowIso })
                .eq("id", conversationId);
            } else {
              const { data: newConv } = await sbBg
                .from("whatsapp_conversations")
                .insert({
                  contactName: recipient.contactName ?? recipient.phone,
                  contactPhone: recipient.phone,
                  lastMessage,
                  lastMessageAt: nowIso,
                })
                .select("id")
                .single();
              conversationId = newConv ? (newConv as { id: string }).id : null;
            }

            if (conversationId) {
              await sbBg.from("whatsapp_messages").insert({
                conversationId,
                whatsappMsgId: waMsgId,
                direction: "outbound",
                sender: "ai",
                senderName: "Broadcast",
                body: broadcastMessage,
                isAI: true,
                status: "sent",
                isRead: true,
              });
            }
          } catch (chatErr) {
            console.error("[Broadcast] Failed to save to chat:", chatErr);
          }
        } else {
          const errText = await waRes.text();
          await sbBg
            .from("broadcast_recipients")
            .update({ status: "FAILED", error: errText.slice(0, 500) })
            .eq("id", recipient.id);
          failedCount++;
        }
      } catch (err) {
        await sbBg
          .from("broadcast_recipients")
          .update({ status: "FAILED", error: String(err).slice(0, 500) })
          .eq("id", recipient.id);
        failedCount++;
      }

      // Update counts every 5 messages
      if ((sentCount + failedCount) % 5 === 0) {
        await sbBg.from("broadcasts").update({ sentCount, failedCount }).eq("id", broadcastId);
      }

      // Rate limit: ~20 msgs/sec for WhatsApp Business API
      await new Promise((r) => setTimeout(r, 60));
    }

    // Final update
    await sbBg
      .from("broadcasts")
      .update({
        status: failedCount === recipients.length ? "FAILED" : "COMPLETED",
        sentCount,
        failedCount,
        completedAt: new Date().toISOString(),
      })
      .eq("id", broadcastId);
  })().catch((err) => {
    console.error("[Broadcast Send] Unexpected error:", err);
    supabaseAdmin()
      .from("broadcasts")
      .update({ status: "FAILED" })
      .eq("id", broadcastId)
      .then(() => {});
  });

  return NextResponse.json(ok({ id: broadcastId, status: "SENDING", recipientCount: recipients.length }));
}
