import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: conversation, error: convErr } = await sb
    .from("whatsapp_conversations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (convErr) return NextResponse.json(fail(convErr.message), { status: 500 });
  if (!conversation) return NextResponse.json(fail("Conversation not found"), { status: 404 });

  // Mark unread inbound messages as read (best-effort)
  await sb
    .from("whatsapp_messages")
    .update({ isRead: true })
    .eq("conversationId", id)
    .eq("direction", "inbound")
    .eq("isRead", false);

  // Reset unread count on conversation
  await sb
    .from("whatsapp_conversations")
    .update({ unreadCount: 0 })
    .eq("id", id);

  const { data: messages, error: msgErr } = await sb
    .from("whatsapp_messages")
    .select("*")
    .eq("conversationId", id)
    .order("timestamp", { ascending: true });

  if (msgErr) return NextResponse.json(fail(msgErr.message), { status: 500 });

  type MsgRow = {
    id: string;
    body: string;
    sender: string;
    senderName: string;
    mediaType: string | null;
    replyToMessageId: string | null;
  } & Record<string, unknown>;
  const rows = (messages ?? []) as MsgRow[];

  // Enrich each reply with a snippet of the message it replied to, so the UI can
  // render a WhatsApp-style quoted bubble without a second round-trip per message.
  const refIds = [...new Set(rows.map((m) => m.replyToMessageId).filter(Boolean))] as string[];
  if (refIds.length > 0) {
    const { data: refs } = await sb
      .from("whatsapp_messages")
      .select("id, body, sender, senderName, mediaType")
      .in("id", refIds);
    const refMap = new Map<string, { body: string; sender: string; senderName: string; mediaType: string | null }>();
    for (const r of (refs ?? []) as { id: string; body: string; sender: string; senderName: string; mediaType: string | null }[]) {
      refMap.set(r.id, { body: r.body, sender: r.sender, senderName: r.senderName, mediaType: r.mediaType });
    }
    const enriched = rows.map((m) => ({
      ...m,
      replyTo: m.replyToMessageId ? refMap.get(m.replyToMessageId) ?? null : null,
    }));
    return NextResponse.json(ok(enriched));
  }

  return NextResponse.json(ok(rows));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: conversation, error: convErr } = await sb
    .from("whatsapp_conversations")
    .select("id, contactPhone")
    .eq("id", id)
    .maybeSingle();
  if (convErr) return NextResponse.json(fail(convErr.message), { status: 500 });
  if (!conversation) return NextResponse.json(fail("Conversation not found"), { status: 404 });

  const conv = conversation as { id: string; contactPhone: string };

  const body = (await request.json()) as { body?: string };
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!messageBody) {
    return NextResponse.json(fail("Message body is required"), { status: 400 });
  }

  // Send via WhatsApp Business API
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  let waMsgId: string | null = null;

  if (phoneNumberId && token) {
    try {
      const waRes = await fetch(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: conv.contactPhone,
            type: "text",
            text: { body: messageBody },
          }),
        },
      );

      if (!waRes.ok) {
        const errData = await waRes.text();
        console.error("[WhatsApp API] Send failed:", errData);
      } else {
        // Capture the WAMID so delivery/read webhooks and customer tap-to-reply
        // (context.id) can resolve back to this message.
        const data = (await waRes.json()) as { messages?: { id: string }[] };
        waMsgId = data.messages?.[0]?.id ?? null;
      }
    } catch (err) {
      console.error("[WhatsApp API] Network error:", err);
    }
  }

  // Look up sender display name
  const { data: user } = await sb
    .from("users")
    .select("name, email")
    .eq("id", session.user.id)
    .maybeSingle();
  const senderName =
    (user as { name?: string | null; email?: string } | null)?.name ??
    (user as { email?: string } | null)?.email ??
    "Agent";

  // Save sent message
  const { data: message, error: insErr } = await sb
    .from("whatsapp_messages")
    .insert({
      conversationId: id,
      whatsappMsgId: waMsgId,
      direction: "outbound",
      sender: "agent",
      senderName,
      body: messageBody,
      isAI: false,
      status: "sent",
      isRead: true,
    })
    .select("*")
    .single();

  if (insErr) return NextResponse.json(fail(insErr.message), { status: 500 });

  // Update conversation last message (best-effort)
  await sb
    .from("whatsapp_conversations")
    .update({
      lastMessage: messageBody.length > 200 ? messageBody.slice(0, 200) + "..." : messageBody,
      lastMessageAt: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json(ok(message), { status: 201 });
}
