// Chunked broadcast sender.
//
// One call drains up to CHUNK_SIZE PENDING recipients for a single broadcast,
// synchronously, inside the calling serverless invocation's lifetime. It
// returns when the chunk is done or when we run out of time budget — never
// using fire-and-forget. Both the /send HTTP endpoint and the cron call this
// directly, so there is no cross-function HTTP fire-and-forget anywhere.

import { supabaseAdmin } from "@/lib/supabase/admin";

const CHUNK_SIZE = 150;

// If a SENDING broadcast has had no recipient state change for this long, we
// assume the previous worker died (Vercel killed it) and allow a new one to
// take over. Tighter than the time between cron ticks (60s) so we don't stall.
const STUCK_MS = 3 * 60 * 1000;

// Hard cap on how long we spend sending inside one invocation. Leaves a few
// seconds of headroom under Vercel's 60s Pro budget to flush counts.
const SEND_BUDGET_MS = 55 * 1000;

// Mild per-message throttle so we stay friendly to the Graph API + Supabase.
const PER_MESSAGE_DELAY_MS = 30;

export type ProcessChunkResult =
  | {
      ok: true;
      broadcastId: string;
      status: "SENDING" | "COMPLETED" | "FAILED";
      done: boolean; // true when no PENDING recipients remain
      chunkSent: number;
      chunkFailed: number;
      sentCount: number;
      failedCount: number;
      pendingCount: number;
      totalCount: number;
    }
  | {
      ok: false;
      broadcastId: string;
      reason: string;
      // Set to true when we voluntarily skipped because another worker looks
      // active. NOT an error — just informational.
      skipped?: boolean;
    };

type Tpl = {
  id: string;
  name: string;
  language: string;
  status: string;
  variableCount: number;
  headerType: string | null;
  headerMediaUrl: string | null;
};

type Broadcast = {
  id: string;
  status: string;
  templateId: string | null;
  templateVars: Record<string, string> | null;
  sentCount: number;
  failedCount: number;
  message: string;
  startedAt: string | null;
};

export async function processBroadcastChunk(broadcastId: string): Promise<ProcessChunkResult> {
  const sb = supabaseAdmin();

  const { data: broadcastRow, error: bErr } = await sb
    .from("broadcasts")
    .select("id, status, templateId, templateVars, sentCount, failedCount, message, startedAt")
    .eq("id", broadcastId)
    .maybeSingle();

  if (bErr) return { ok: false, broadcastId, reason: bErr.message };
  if (!broadcastRow) return { ok: false, broadcastId, reason: "Broadcast not found" };

  const broadcast = broadcastRow as Broadcast;

  if (broadcast.status === "COMPLETED") {
    return { ok: false, broadcastId, reason: "Already completed" };
  }
  if (broadcast.status === "FAILED") {
    return { ok: false, broadcastId, reason: "Marked FAILED — reset to DRAFT to retry" };
  }
  if (broadcast.status === "STOPPED") {
    return { ok: false, broadcastId, reason: "Broadcast was stopped", skipped: true };
  }

  // Concurrency guard: if another worker is actively processing this broadcast,
  // bail. Detected via the most recent recipient state-change timestamp.
  if (broadcast.status === "SENDING") {
    const isStuck = await isBroadcastStuck(broadcastId, broadcast.startedAt);
    if (!isStuck) {
      return { ok: false, broadcastId, reason: "Another worker is active", skipped: true };
    }
    // Fall through and resume.
  }

  // Load the template once.
  let template: Tpl | null = null;
  if (broadcast.templateId) {
    const { data: tplRow } = await sb
      .from("whatsapp_templates")
      .select("id, name, language, status, variableCount, headerType, headerMediaUrl")
      .eq("id", broadcast.templateId)
      .maybeSingle();
    template = (tplRow as Tpl | null) ?? null;
  }

  if (!template) return { ok: false, broadcastId, reason: "No template linked" };
  if (template.status !== "APPROVED") {
    return {
      ok: false,
      broadcastId,
      reason: `Template "${template.name}" is not APPROVED (status: ${template.status})`,
    };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    return { ok: false, broadcastId, reason: "WhatsApp API credentials not configured" };
  }

  // Build the template payload once — identical for every recipient.
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

  // Flip to SENDING if needed, stamping startedAt the first time.
  if (broadcast.status !== "SENDING") {
    await sb
      .from("broadcasts")
      .update({
        status: "SENDING",
        startedAt: broadcast.startedAt ?? new Date().toISOString(),
      })
      .eq("id", broadcastId);
  }

  // Pull this chunk's pending recipients.
  const { data: recipientsRaw, error: recErr } = await sb
    .from("broadcast_recipients")
    .select("id, phone, contactName")
    .eq("broadcastId", broadcastId)
    .eq("status", "PENDING")
    .order("createdAt", { ascending: true, nullsFirst: true })
    .limit(CHUNK_SIZE);

  if (recErr) return { ok: false, broadcastId, reason: recErr.message };

  const recipients = (recipientsRaw ?? []) as {
    id: string;
    phone: string;
    contactName: string | null;
  }[];

  if (recipients.length === 0) {
    // No PENDING left → finalize.
    return await finalizeIfDone(broadcastId);
  }

  // Race protection: claim each recipient by setting status to SENDING. The
  // .eq("status", "PENDING") clause acts as compare-and-swap; if another
  // worker grabbed the row first it has already moved off PENDING and our
  // update silently matches zero rows. We re-read what we actually own.
  const recipientIds = recipients.map((r) => r.id);
  const { data: claimedRaw, error: claimErr } = await sb
    .from("broadcast_recipients")
    .update({ status: "SENDING" })
    .in("id", recipientIds)
    .eq("status", "PENDING")
    .select("id, phone, contactName");

  if (claimErr) return { ok: false, broadcastId, reason: claimErr.message };

  const claimed = (claimedRaw ?? []) as {
    id: string;
    phone: string;
    contactName: string | null;
  }[];

  if (claimed.length === 0) {
    // Lost every race to another worker. Bail without re-finalizing.
    return { ok: false, broadcastId, reason: "Lost race for chunk", skipped: true };
  }

  // Process the chunk. We're synchronous inside the request lifetime, so the
  // serverless runtime keeps the process alive until we return.
  const broadcastMessage = broadcast.message;
  let chunkSent = 0;
  let chunkFailed = 0;
  let stoppedMidChunk = false;
  const deadline = Date.now() + SEND_BUDGET_MS;

  for (let i = 0; i < claimed.length; i++) {
    const recipient = claimed[i];

    // Periodically re-check the broadcast row so a Stop click during this
    // chunk takes effect within ~25 messages instead of waiting for the
    // whole chunk (or the entire 55s budget) to finish.
    if (i > 0 && i % 25 === 0) {
      const { data: latest } = await sb
        .from("broadcasts")
        .select("status")
        .eq("id", broadcastId)
        .maybeSingle();
      if ((latest as { status: string } | null)?.status === "STOPPED") {
        stoppedMidChunk = true;
        // Roll the rest of the claimed-but-unsent rows back to PENDING.
        const remainingIds = claimed.slice(i).map((r) => r.id);
        if (remainingIds.length > 0) {
          await sb
            .from("broadcast_recipients")
            .update({ status: "PENDING" })
            .in("id", remainingIds);
        }
        break;
      }
    }

    if (Date.now() > deadline) {
      // Hand the rest back to PENDING so the next worker can pick them up.
      const remainingIds = claimed.slice(i).map((r) => r.id);
      if (remainingIds.length > 0) {
        await sb
          .from("broadcast_recipients")
          .update({ status: "PENDING" })
          .in("id", remainingIds);
      }
      break;
    }

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

        // Mirror into the WhatsApp chat UI. Best-effort — if any of this
        // fails we still consider the message sent (Meta accepted it).
        try {
          await mirrorToChat(
            recipient.phone,
            recipient.contactName,
            broadcastMessage,
            waMsgId,
          );
        } catch (chatErr) {
          console.error("[Broadcast] mirror-to-chat failed:", chatErr);
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

    if (PER_MESSAGE_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, PER_MESSAGE_DELAY_MS));
    }
  }

  // Update aggregate counts so the UI poll sees fresh numbers.
  const counts = await recomputeCounts(broadcastId);
  await sb
    .from("broadcasts")
    .update({ sentCount: counts.sent, failedCount: counts.failed })
    .eq("id", broadcastId);

  // If the user clicked Stop mid-chunk, the broadcast is now STOPPED. Don't
  // override that with COMPLETED even if pending happens to be 0.
  if (stoppedMidChunk) {
    return {
      ok: false,
      broadcastId,
      reason: "Broadcast was stopped",
      skipped: true,
    };
  }

  // Auto-finalize if this chunk drained the last of the PENDING.
  if (counts.pending === 0) {
    return await finalizeIfDone(broadcastId);
  }

  return {
    ok: true,
    broadcastId,
    status: "SENDING",
    done: false,
    chunkSent,
    chunkFailed,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: counts.pending,
    totalCount: counts.total,
  };
}

async function isBroadcastStuck(
  broadcastId: string,
  startedAt: string | null,
): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("broadcast_recipients")
    .select("sentAt, updatedAt")
    .eq("broadcastId", broadcastId)
    .neq("status", "PENDING")
    .order("sentAt", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const row = data as { sentAt: string | null; updatedAt: string | null } | null;
  const lastTs = row?.sentAt ?? row?.updatedAt ?? startedAt;
  if (!lastTs) return true; // never made progress — safe to take over
  return Date.now() - new Date(lastTs).getTime() > STUCK_MS;
}

async function recomputeCounts(broadcastId: string): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
  inflight: number;
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
  let inflight = 0;
  for (const r of rows) {
    if (r.status === "SENT" || r.status === "DELIVERED" || r.status === "READ") sent++;
    else if (r.status === "FAILED") failed++;
    else if (r.status === "PENDING") pending++;
    else if (r.status === "SENDING") inflight++;
  }
  return { total: rows.length, sent, failed, pending, inflight };
}

async function finalizeIfDone(broadcastId: string): Promise<ProcessChunkResult> {
  const sb = supabaseAdmin();
  const counts = await recomputeCounts(broadcastId);
  if (counts.pending > 0 || counts.inflight > 0) {
    return {
      ok: true,
      broadcastId,
      status: "SENDING",
      done: false,
      chunkSent: 0,
      chunkFailed: 0,
      sentCount: counts.sent,
      failedCount: counts.failed,
      pendingCount: counts.pending,
      totalCount: counts.total,
    };
  }
  const finalStatus: "COMPLETED" | "FAILED" =
    counts.failed === counts.total && counts.total > 0 ? "FAILED" : "COMPLETED";
  await sb
    .from("broadcasts")
    .update({
      status: finalStatus,
      sentCount: counts.sent,
      failedCount: counts.failed,
      completedAt: new Date().toISOString(),
    })
    .eq("id", broadcastId);
  return {
    ok: true,
    broadcastId,
    status: finalStatus,
    done: true,
    chunkSent: 0,
    chunkFailed: 0,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: 0,
    totalCount: counts.total,
  };
}

async function mirrorToChat(
  phone: string,
  contactName: string | null,
  body: string,
  whatsappMsgId: string | null,
): Promise<void> {
  const sb = supabaseAdmin();
  const lastMessage = body.length > 200 ? body.slice(0, 200) + "..." : body;
  const nowIso = new Date().toISOString();

  const { data: existingConv } = await sb
    .from("whatsapp_conversations")
    .select("id")
    .eq("contactPhone", phone)
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
        contactName: contactName ?? phone,
        contactPhone: phone,
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
      whatsappMsgId,
      direction: "outbound",
      sender: "ai",
      senderName: "Broadcast",
      body,
      isAI: true,
      status: "sent",
      isRead: true,
    });
  }
}
