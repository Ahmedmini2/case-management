import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Use the full Pro/Enterprise window. Each invocation drains one chunk; the
// cron re-fires us every minute until the broadcast is complete, so even
// 100k+ broadcasts get processed across many invocations without ever
// relying on the IIFE-after-response trick (which Vercel kills).
export const maxDuration = 60;

// How many recipients we attempt to send in a single invocation. With Meta's
// API at ~250-400 ms per call plus a small Supabase write, ~150 fits inside
// the 60s budget with headroom for the final status update.
const CHUNK_SIZE = 150;

// If a SENDING broadcast has had no recipient state change for this long, we
// assume the previous invocation died (Vercel killed it). The cron is allowed
// to pick it back up.
const STUCK_MS = 5 * 60 * 1000;

// Send a broadcast — processes ONE chunk of pending recipients per invocation.
// The cron re-fires this endpoint while any PENDING recipients remain.
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
    .select("id, status, templateId, templateVars, sentCount, failedCount, message, startedAt")
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
    startedAt: string | null;
  };

  if (broadcast.status === "COMPLETED") {
    return NextResponse.json(fail("Broadcast already completed"), { status: 400 });
  }
  if (broadcast.status === "FAILED") {
    return NextResponse.json(fail("Broadcast has failed status — reset it to retry"), { status: 400 });
  }

  // Allow re-entry into a SENDING broadcast only if it looks stuck. This is the
  // recovery path for the previous architecture's killed-mid-loop issue.
  if (broadcast.status === "SENDING") {
    const { data: lastUpdate } = await sb
      .from("broadcast_recipients")
      .select("sentAt, updatedAt")
      .eq("broadcastId", id)
      .neq("status", "PENDING")
      .order("sentAt", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const lastTs =
      (lastUpdate as { sentAt: string | null; updatedAt: string | null } | null)?.sentAt ??
      (lastUpdate as { sentAt: string | null; updatedAt: string | null } | null)?.updatedAt ??
      broadcast.startedAt;
    const lastMs = lastTs ? new Date(lastTs).getTime() : 0;
    const ageMs = Date.now() - lastMs;
    // If progress is fresh, another invocation is probably still working on it.
    // We bail to avoid double-sending the same recipient.
    if (lastMs > 0 && ageMs < STUCK_MS) {
      return NextResponse.json(
        ok({
          id,
          status: "SENDING",
          skipped: true,
          reason: `Another worker is active (last progress ${Math.round(ageMs / 1000)}s ago)`,
        }),
      );
    }
    // Otherwise fall through and resume.
  }

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

  // Build the template payload once — it's the same for every recipient.
  const components: Record<string, unknown>[] = [];
  if (template.headerType && template.headerType !== "TEXT" && template.headerMediaUrl) {
    const fmt = template.headerType.toLowerCase(); // "image" | "video" | "document"
    const param: Record<string, unknown> = { type: fmt };
    if (fmt === "image") param.image = { link: template.headerMediaUrl };
    else if (fmt === "video") param.video = { link: template.headerMediaUrl };
    else if (fmt === "document") param.document = { link: template.headerMediaUrl, filename: "document.pdf" };
    components.push({ type: "header", parameters: [param] });
  }
  const templateVars = (broadcast.templateVars ?? {}) as Record<string, string>;
  if (template.variableCount > 0) {
    const parameters = Array.from({ length: template.variableCount }, (_, i) => ({
      type: "text",
      text: templateVars[String(i + 1)] ?? `{{${i + 1}}}`,
    }));
    components.push({ type: "body", parameters });
  }

  // Flip status to SENDING (if it wasn't already) and stamp startedAt the first time.
  if (broadcast.status !== "SENDING") {
    await sb
      .from("broadcasts")
      .update({
        status: "SENDING",
        startedAt: broadcast.startedAt ?? new Date().toISOString(),
      })
      .eq("id", id);
  }

  // Pull THIS chunk's worth of pending recipients.
  const { data: recipientsRaw, error: recErr } = await sb
    .from("broadcast_recipients")
    .select("id, phone, contactName")
    .eq("broadcastId", id)
    .eq("status", "PENDING")
    .order("createdAt", { ascending: true, nullsFirst: true })
    .limit(CHUNK_SIZE);

  if (recErr) return NextResponse.json(fail(recErr.message), { status: 500 });

  const recipients = (recipientsRaw ?? []) as {
    id: string;
    phone: string;
    contactName: string | null;
  }[];

  // No pending recipients left — finalize the broadcast.
  if (recipients.length === 0) {
    const { count: stillPending } = await sb
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcastId", id)
      .eq("status", "PENDING");

    if ((stillPending ?? 0) === 0) {
      // Recompute counts from the source of truth before completing.
      const counts = await recomputeCounts(id);
      const finalStatus = counts.failed === counts.total && counts.total > 0 ? "FAILED" : "COMPLETED";
      await sb
        .from("broadcasts")
        .update({
          status: finalStatus,
          sentCount: counts.sent,
          failedCount: counts.failed,
          completedAt: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json(ok({ id, status: finalStatus, done: true, ...counts }));
    }
    // Race condition: another worker grabbed everything. Bail without finalizing.
    return NextResponse.json(ok({ id, status: "SENDING", skipped: true }));
  }

  // Process the chunk synchronously inside the request lifetime. Vercel guarantees
  // the function stays alive until we return — no fire-and-forget.
  const broadcastMessage = broadcast.message;
  let chunkSent = 0;
  let chunkFailed = 0;
  const deadline = Date.now() + 55 * 1000; // hard stop at 55s to leave room to flush counts

  for (const recipient of recipients) {
    // If we're close to the timeout, bail early. The cron will pick up the rest.
    if (Date.now() > deadline) break;

    try {
      const payload: Record<string, unknown> = {
        messaging_product: "whatsapp",
        to: recipient.phone,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
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
        await sb
          .from("broadcast_recipients")
          .update({
            status: "SENT",
            whatsappMsgId: waMsgId,
            sentAt: new Date().toISOString(),
          })
          .eq("id", recipient.id);
        chunkSent++;

        // Mirror into WhatsApp chat so it appears in the conversation UI.
        try {
          const lastMessage =
            broadcastMessage.length > 200 ? broadcastMessage.slice(0, 200) + "..." : broadcastMessage;
          const nowIso = new Date().toISOString();

          const { data: existingConv } = await sb
            .from("whatsapp_conversations")
            .select("id")
            .eq("contactPhone", recipient.phone)
            .maybeSingle();

          let conversationId: string | null = null;
          if (existingConv) {
            conversationId = (existingConv as { id: string }).id;
            await sb
              .from("whatsapp_conversations")
              .update({ lastMessage, lastMessageAt: nowIso })
              .eq("id", conversationId);
          } else {
            const { data: newConv } = await sb
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
            await sb.from("whatsapp_messages").insert({
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
        await sb
          .from("broadcast_recipients")
          .update({ status: "FAILED", error: errText.slice(0, 500) })
          .eq("id", recipient.id);
        chunkFailed++;
      }
    } catch (err) {
      await sb
        .from("broadcast_recipients")
        .update({ status: "FAILED", error: String(err).slice(0, 500) })
        .eq("id", recipient.id);
      chunkFailed++;
    }

    // Mild throttle — Meta's per-second limit is well above this, but it keeps us
    // friendly to the Graph API and Supabase.
    await new Promise((r) => setTimeout(r, 30));
  }

  // Update broadcast aggregate counts before returning. This is what the UI polls.
  const counts = await recomputeCounts(id);
  await sb
    .from("broadcasts")
    .update({ sentCount: counts.sent, failedCount: counts.failed })
    .eq("id", id);

  return NextResponse.json(ok({
    id,
    status: "SENDING",
    chunkSent,
    chunkFailed,
    chunkProcessed: chunkSent + chunkFailed,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: counts.pending,
    totalCount: counts.total,
  }));
}

// Recompute aggregate recipient counts straight from broadcast_recipients.
// Cheaper than running 4 separate count queries.
async function recomputeCounts(broadcastId: string): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
}> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("broadcast_recipients")
    .select("status")
    .eq("broadcastId", broadcastId);
  const rows = (data ?? []) as { status: string }[];
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.status === "SENT" || r.status === "DELIVERED" || r.status === "READ") sent++;
    else if (r.status === "FAILED") failed++;
    else if (r.status === "PENDING") pending++;
  }
  return { total: rows.length, sent, failed, pending };
}
