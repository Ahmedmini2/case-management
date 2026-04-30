import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { triggerPusherEvent } from "@/lib/pusher";
import { StorageBuckets, uploadToBucket } from "@/lib/supabase/storage";

// Resolve a WhatsApp media ID into a public Supabase Storage URL.
// Two-step Meta flow: GET /<id> returns a short-lived signed URL that requires
// the bearer token to download. We download with the token then re-host on Supabase.
async function downloadAndStoreWhatsAppMedia(
  mediaId: string,
  conversationId: string,
): Promise<{ url: string; contentType: string } | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    console.error("[whatsapp-media] WHATSAPP_TOKEN not configured");
    return null;
  }

  try {
    // Step 1: get the temporary URL + mime
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.error("[whatsapp-media] meta lookup failed:", metaRes.status, await metaRes.text().catch(() => ""));
      return null;
    }
    const metaJson = (await metaRes.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    if (!metaJson.url) {
      console.error("[whatsapp-media] meta returned no url");
      return null;
    }

    // Step 2: download the file (also needs the token)
    const fileRes = await fetch(metaJson.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) {
      console.error("[whatsapp-media] file download failed:", fileRes.status);
      return null;
    }
    const buffer = await fileRes.arrayBuffer();

    // Pick an extension from the mime type
    const mime = metaJson.mime_type ?? "application/octet-stream";
    const ext =
      mime.includes("jpeg") ? "jpg" :
      mime.includes("png") ? "png" :
      mime.includes("webp") ? "webp" :
      mime.includes("gif") ? "gif" :
      mime.includes("mp4") ? "mp4" :
      mime.includes("3gpp") ? "3gp" :
      mime.includes("webm") ? "webm" :
      mime.includes("ogg") ? "ogg" :
      mime.includes("mpeg") ? "mp3" :
      mime.includes("aac") ? "aac" :
      mime.includes("amr") ? "amr" :
      mime.includes("pdf") ? "pdf" :
      "bin";

    const key = `${conversationId}/inbound/${randomUUID()}.${ext}`;
    const uploaded = await uploadToBucket(StorageBuckets.WhatsAppMedia, key, buffer, mime);
    return { url: uploaded.url, contentType: mime };
  } catch (err) {
    console.error("[whatsapp-media] error:", err);
    return null;
  }
}

// WhatsApp webhook verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// Receive incoming WhatsApp messages
export async function POST(request: Request) {
  try {
    const sb = supabaseAdmin();
    const payload = (await request.json()) as Record<string, unknown>;

    // WhatsApp sends nested: entry[0].changes[0].value
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray((entry as Record<string, unknown>).changes)
        ? ((entry as Record<string, unknown>).changes as Record<string, unknown>[])
        : [];

      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;

        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        // ---- Process delivery/read status updates ----
        for (const status of statuses as Record<string, unknown>[]) {
          const waMsgId = typeof status.id === "string" ? status.id : null;
          const statusValue = typeof status.status === "string" ? status.status : "";

          if (!waMsgId || !statusValue) continue;

          // Map WhatsApp status to our status values
          let mappedStatus: string | null = null;
          if (statusValue === "delivered") mappedStatus = "delivered";
          else if (statusValue === "read") mappedStatus = "read";
          else if (statusValue === "failed") mappedStatus = "failed";
          else continue; // skip "sent" as we already track that

          // Update WhatsAppMessage in conversation
          try {
            await sb
              .from("whatsapp_messages")
              .update({ status: mappedStatus })
              .eq("whatsappMsgId", waMsgId);
          } catch { /* message might not exist locally */ }

          // Update BroadcastRecipient for broadcast tracking
          try {
            const { data: recipient } = await sb
              .from("broadcast_recipients")
              .select("id, broadcastId, status")
              .eq("whatsappMsgId", waMsgId)
              .maybeSingle();

            if (recipient) {
              const r = recipient as { id: string; broadcastId: string; status: string | null };
              const now = new Date().toISOString();
              const updateData: Record<string, unknown> = {};

              if (mappedStatus === "delivered" && r.status !== "READ") {
                updateData.status = "DELIVERED";
                updateData.deliveredAt = now;
              } else if (mappedStatus === "read") {
                updateData.status = "READ";
                updateData.readAt = now;
                if (!r.status || r.status === "SENT" || r.status === "PENDING") {
                  updateData.deliveredAt = now;
                }
              } else if (mappedStatus === "failed") {
                const errors = (status.errors ?? []) as Record<string, unknown>[];
                const errMsg = errors[0] ? String((errors[0] as Record<string, unknown>).title ?? "Unknown error") : "Delivery failed";
                updateData.status = "FAILED";
                updateData.error = errMsg;
              }

              if (Object.keys(updateData).length > 0) {
                await sb.from("broadcast_recipients").update(updateData).eq("id", r.id);

                // Recalculate broadcast aggregate counts
                const { data: allRecipients } = await sb
                  .from("broadcast_recipients")
                  .select("status")
                  .eq("broadcastId", r.broadcastId);

                const counts = new Map<string, number>();
                for (const item of (allRecipients ?? []) as { status: string | null }[]) {
                  const k = item.status ?? "";
                  counts.set(k, (counts.get(k) ?? 0) + 1);
                }

                await sb
                  .from("broadcasts")
                  .update({
                    deliveredCount: (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0),
                    readCount: counts.get("READ") ?? 0,
                    failedCount: counts.get("FAILED") ?? 0,
                  })
                  .eq("id", r.broadcastId);
              }
            }
          } catch (err) {
            console.error("[WhatsApp Webhook] Status update error:", err);
          }
        }

        // ---- Process incoming messages ----
        for (const msg of messages as Record<string, unknown>[]) {
          const from = typeof msg.from === "string" ? msg.from : "";
          const msgId = typeof msg.id === "string" ? msg.id : null;
          const msgType = typeof msg.type === "string" ? msg.type : "text";
          const timestamp = typeof msg.timestamp === "string"
            ? new Date(parseInt(msg.timestamp, 10) * 1000)
            : new Date();

          let body = "";
          let mediaType: string | null = null;
          let mediaWaId: string | null = null; // WhatsApp media ID (NOT a URL)
          let documentFilename: string | null = null;

          if (msgType === "text") {
            const text = msg.text as Record<string, unknown> | undefined;
            body = typeof text?.body === "string" ? text.body : "";
          } else if (["image", "video", "audio", "document", "sticker"].includes(msgType)) {
            mediaType = msgType === "sticker" ? "image" : msgType;
            const mediaObj = msg[msgType] as Record<string, unknown> | undefined;
            body = typeof mediaObj?.caption === "string" ? mediaObj.caption : `[${msgType}]`;
            mediaWaId = typeof mediaObj?.id === "string" ? mediaObj.id : null;
            documentFilename = typeof mediaObj?.filename === "string" ? mediaObj.filename : null;
          }

          if (!from) continue;

          // Get contact name from webhook payload
          const contactEntry = (contacts as Record<string, unknown>[]).find(
            (c) => (c.wa_id as string) === from,
          );
          const profile = contactEntry?.profile as Record<string, unknown> | undefined;
          const contactName = typeof profile?.name === "string" ? profile.name : from;

          // Find or create conversation. Try to fetch existing first to handle increment properly.
          const lastMsg = body.length > 200 ? body.slice(0, 200) + "..." : body;
          const tsIso = timestamp.toISOString();

          const { data: existingConv } = await sb
            .from("whatsapp_conversations")
            .select("id, unreadCount, handledBy")
            .eq("contactPhone", from)
            .maybeSingle();

          let conversationId: string;
          let handledBy: string | null = null;

          if (existingConv) {
            const ec = existingConv as { id: string; unreadCount: number | null; handledBy: string | null };
            conversationId = ec.id;
            handledBy = ec.handledBy;
            const { error: updErr } = await sb
              .from("whatsapp_conversations")
              .update({
                contactName,
                lastMessage: lastMsg,
                lastMessageAt: tsIso,
                unreadCount: (ec.unreadCount ?? 0) + 1,
              })
              .eq("id", ec.id);
            if (updErr) console.error("[WhatsApp Webhook] Conv update failed:", updErr.message);
          } else {
            const { data: newConv, error: insErr } = await sb
              .from("whatsapp_conversations")
              .insert({
                contactName,
                contactPhone: from,
                lastMessage: lastMsg,
                lastMessageAt: tsIso,
                unreadCount: 1,
              })
              .select("id, handledBy")
              .single();
            if (insErr || !newConv) {
              console.error("[WhatsApp Webhook] Conv create failed:", insErr?.message);
              continue;
            }
            const nc = newConv as { id: string; handledBy: string | null };
            conversationId = nc.id;
            handledBy = nc.handledBy;
          }

          // Save inbound message FIRST (without mediaUrl), so the chat shows it immediately.
          // The actual media URL is resolved+stored asynchronously below.
          const { data: insertedRow, error: msgErr } = await sb
            .from("whatsapp_messages")
            .insert({
              conversationId,
              whatsappMsgId: msgId,
              direction: "inbound",
              sender: "customer",
              senderName: contactName,
              body: documentFilename ? `${body} (${documentFilename})` : body,
              mediaUrl: null,
              mediaType,
              isAI: false,
              status: "delivered",
              timestamp: tsIso,
            })
            .select("id")
            .single();
          if (msgErr) console.error("[WhatsApp Webhook] Save message failed:", msgErr.message);
          const insertedMessageId = insertedRow ? (insertedRow as { id: string }).id : null;

          // Resolve media after the response. This downloads from Meta, uploads to Supabase
          // Storage, and patches the message row with the public URL when done.
          if (mediaWaId && mediaType && insertedMessageId) {
            after(async () => {
              const result = await downloadAndStoreWhatsAppMedia(mediaWaId!, conversationId);
              if (!result) return;
              const sbAfter = supabaseAdmin();
              await sbAfter
                .from("whatsapp_messages")
                .update({ mediaUrl: result.url })
                .eq("id", insertedMessageId);

              // Push the updated message so the open chat refreshes
              await triggerPusherEvent(`conversation-${conversationId}`, "whatsapp:media_ready", {
                conversationId,
                messageId: insertedMessageId,
                mediaUrl: result.url,
              }).catch(() => {});
            });
          }

          // If AI is handling, forward to AI agent webhook
          if (handledBy === "AI" && process.env.AI_AGENT_WEBHOOK_URL) {
            fetch(process.env.AI_AGENT_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversationId,
                contactPhone: from,
                contactName,
                messageId: msgId,
                body,
                mediaWaId,
                mediaType,
                handledBy,
                timestamp: tsIso,
              }),
            }).catch((err) =>
              console.error("[WhatsApp Webhook] AI forward error:", err),
            );
          }

          // If human-handled, push real-time update
          if (handledBy === "HUMAN") {
            await triggerPusherEvent(
              `conversation-${conversationId}`,
              "whatsapp:new_message",
              {
                conversationId,
                messageId: msgId,
                from,
                body,
                timestamp: tsIso,
              },
            );
          }

          // Create notification for all active agents
          const { data: agents } = await sb
            .from("users")
            .select("id")
            .in("role", ["ADMIN", "SUPER_ADMIN", "MANAGER", "AGENT"])
            .eq("isActive", true);

          const agentList = (agents ?? []) as { id: string }[];
          if (agentList.length > 0) {
            const { error: notifErr } = await sb.from("notifications").insert(
              agentList.map((a) => ({
                userId: a.id,
                type: "WHATSAPP",
                title: `WhatsApp: ${contactName}`,
                body: body.length > 100 ? body.slice(0, 100) + "..." : body,
                link: "/whatsapp",
              })),
            );
            if (notifErr) console.error("[WhatsApp Webhook] Notif create failed:", notifErr.message);
          }

          // Also update conversation list for all agents
          await triggerPusherEvent("whatsapp", "whatsapp:conversation_updated", {
            conversationId,
          });
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
