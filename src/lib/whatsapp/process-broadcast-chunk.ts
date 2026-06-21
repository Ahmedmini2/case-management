// Chunked broadcast sender — crash-safe, self-continuing.
//
// One call to processBroadcastChunk() drains as many PENDING recipients as fit
// inside a bounded time budget, sending them concurrently (rate-limited) and
// recovering anything a previous worker left orphaned. It is safe to run many
// of these concurrently for the same broadcast: every recipient row is claimed
// with an atomic compare-and-swap, and every terminal write is guarded so a
// reclaimed row can never be clobbered by a slow worker.
//
// Two things drive a broadcast to completion:
//   1. The client driver (browser) calls /send repeatedly until COMPLETED.
//   2. The every-minute Vercel cron calls this directly as a backstop.
// Neither uses cross-function fire-and-forget (Vercel would kill it).

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp/phone";

/* ----------------------------- Tunables ---------------------------------- */

// Recipients claimed per batch. Small enough that a batch settles well within
// the budget even if a few sends hit the timeout.
const BATCH_SIZE = 40;

// Concurrent in-flight sends inside a batch.
const CONCURRENCY = 8;

// Soft outbound cap (messages/sec). Meta Cloud API default throughput is ~80/s;
// we stay under it with headroom. Enforced by a token bucket per invocation.
const RATE_PER_SEC = 40;

// Per-message Graph API timeout. WITHOUT this, one hung request stalls the whole
// invocation until the platform kills it — the classic "sent ~5 then stuck".
const FETCH_TIMEOUT_MS = 15_000;

// How long we spend sending in one invocation before returning. Leaves headroom
// under the 60s function ceiling for in-flight requests to settle + write counts.
const SEND_BUDGET_MS = 45_000;

// A row stuck in SENDING longer than this is assumed orphaned by a dead worker
// and reclaimed to PENDING. MUST exceed the max function lifetime (~60s) so we
// never reclaim a row a *live* worker still owns.
const STALE_CLAIM_MS = 120_000;

// Cron back-pressure window. If a broadcast had recipient activity within this
// window, a client driver is assumed to be actively pushing it, so the cron
// defers to avoid doubling the outbound rate. Manual/driver calls never defer.
const RECENT_ACTIVITY_MS = 75_000;

// Max transient-failure attempts (timeout / 429 / 5xx) before a recipient is
// marked FAILED. Bounds the retry loop so the broadcast always terminates.
const MAX_ATTEMPTS = 5;

const GRAPH_VERSION = "v19.0";

/* ------------------------------- Types ----------------------------------- */

export type ProcessChunkResult = {
  ok: boolean;
  broadcastId: string;
  status: string; // current broadcast status — always present
  done: boolean; // true => no more work; driver should stop looping
  terminal: boolean; // true => stop (completed/failed/stopped/config error)
  skipped: boolean; // true => no work this call but not an error (e.g. cron deferred)
  reason?: string;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  inflightCount: number;
  totalCount: number;
  chunkSent: number;
  chunkFailed: number;
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
  message: string;
  startedAt: string | null;
};

type Claimed = {
  id: string;
  phone: string;
  contactName: string | null;
  attempts: number | null;
  // Per-recipient resolved template variables (overlaid on the broadcast's
  // global templateVars). Null for non-personalized / legacy broadcasts.
  vars: Record<string, string> | null;
  // The exact claim timestamp this worker stamped (as returned by Postgres).
  // Every terminal write matches on it so a worker can only mutate a row it
  // still owns — even if a stale-recovery worker reclaimed it in between.
  claimedAt: string | null;
};

type Counts = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  inflight: number;
};

type SendCtx = {
  phoneNumberId: string;
  token: string;
  template: Tpl;
  // Broadcast-wide variable values; per-recipient vars are overlaid at send time.
  globalVars: Record<string, string>;
  broadcastMessage: string;
};

/* ------------------------------- Entry ----------------------------------- */

export async function processBroadcastChunk(
  broadcastId: string,
  opts: { source?: "manual" | "cron" } = {},
): Promise<ProcessChunkResult> {
  const sb = supabaseAdmin();
  const source = opts.source ?? "manual";

  const { data: broadcastRow, error: bErr } = await sb
    .from("broadcasts")
    .select("id, status, templateId, templateVars, message, startedAt")
    .eq("id", broadcastId)
    .maybeSingle();

  if (bErr) return errorResult(broadcastId, "DRAFT", bErr.message);
  if (!broadcastRow) return errorResult(broadcastId, "DRAFT", "Broadcast not found");
  const broadcast = broadcastRow as Broadcast;

  // Already-terminal broadcasts: report current counts, do nothing.
  if (["COMPLETED", "FAILED", "STOPPED", "CANCELLED"].includes(broadcast.status)) {
    const counts = await recomputeCounts(broadcastId);
    return doneResult(
      broadcastId,
      broadcast.status,
      counts,
      broadcast.status === "STOPPED" ? "Broadcast was stopped" : undefined,
    );
  }

  // Validate template + credentials BEFORE flipping to SENDING, so a
  // misconfigured broadcast surfaces an error instead of getting stuck.
  let template: Tpl | null = null;
  if (broadcast.templateId) {
    const { data: tplRow } = await sb
      .from("whatsapp_templates")
      .select("id, name, language, status, variableCount, headerType, headerMediaUrl")
      .eq("id", broadcast.templateId)
      .maybeSingle();
    template = (tplRow as Tpl | null) ?? null;
  }
  if (!template) return errorResult(broadcastId, broadcast.status, "No template linked");
  if (template.status !== "APPROVED") {
    return errorResult(
      broadcastId,
      broadcast.status,
      `Template "${template.name}" is not APPROVED (status: ${template.status})`,
    );
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    return errorResult(broadcastId, broadcast.status, "WhatsApp API credentials not configured");
  }

  // 1) Recover stale claims orphaned by a killed worker (SENDING -> PENDING).
  await reclaimStale(broadcastId);

  // 2) Unconditional finalize sweep. Decoupled from the send path so ANY trigger
  //    (driver OR cron) that runs after the last message completes the broadcast,
  //    regardless of which worker sent it or whether that worker died.
  let counts = await recomputeCounts(broadcastId);
  if (counts.pending === 0 && counts.inflight === 0) {
    return await finalize(broadcastId, counts);
  }

  // 3) Cron back-pressure: defer to an active client driver to avoid doubling
  //    the outbound rate. The driver (source: "manual") always proceeds.
  if (source === "cron" && (await hasRecentActivity(broadcastId))) {
    return skippedResult(broadcastId, "SENDING", counts, "Client driver active");
  }

  // 4) Flip DRAFT/SCHEDULED -> SENDING, stamping startedAt once.
  if (broadcast.status !== "SENDING") {
    await sb
      .from("broadcasts")
      .update({ status: "SENDING", startedAt: broadcast.startedAt ?? new Date().toISOString() })
      .eq("id", broadcastId);
  }

  // 5) Send batches until the budget is spent or PENDING is drained.
  const ctx: SendCtx = {
    phoneNumberId,
    token,
    template,
    globalVars: broadcast.templateVars ?? {},
    broadcastMessage: broadcast.message,
  };
  const deadline = Date.now() + SEND_BUDGET_MS;
  const bucket = new TokenBucket(RATE_PER_SEC);
  let chunkSent = 0;
  let chunkFailed = 0;
  let stopped = false;

  while (Date.now() < deadline) {
    // Honor a Stop click between batches.
    const { data: st } = await sb
      .from("broadcasts")
      .select("status")
      .eq("id", broadcastId)
      .maybeSingle();
    const live = (st as { status: string } | null)?.status;
    if (live === "STOPPED" || live === "CANCELLED") {
      stopped = true;
      break;
    }

    const claimed = await claimBatch(broadcastId, BATCH_SIZE);
    if (claimed.length === 0) break; // nothing left to claim

    const res = await sendBatch(sb, ctx, claimed, bucket, deadline);
    chunkSent += res.sent;
    chunkFailed += res.failed;
  }

  // 6) Publish aggregate counts for the UI poll.
  counts = await recomputeCounts(broadcastId);
  await sb
    .from("broadcasts")
    .update({ sentCount: counts.sent, failedCount: counts.failed })
    .eq("id", broadcastId);

  if (stopped) {
    return skippedResult(broadcastId, "STOPPED", counts, "Broadcast was stopped");
  }
  if (counts.pending === 0 && counts.inflight === 0) {
    return await finalize(broadcastId, counts);
  }
  // Budget hit with work remaining — the driver/cron will call again.
  return {
    ok: true,
    broadcastId,
    status: "SENDING",
    done: false,
    terminal: false,
    skipped: false,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: counts.pending,
    inflightCount: counts.inflight,
    totalCount: counts.total,
    chunkSent,
    chunkFailed,
  };
}

/* ------------------------------ Claiming --------------------------------- */

async function claimBatch(broadcastId: string, size: number): Promise<Claimed[]> {
  const sb = supabaseAdmin();
  const { data: pend } = await sb
    .from("broadcast_recipients")
    .select("id")
    .eq("broadcastId", broadcastId)
    .eq("status", "PENDING")
    .order("createdAt", { ascending: true, nullsFirst: true })
    .limit(size);
  const ids = ((pend ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];

  // Compare-and-swap: only rows still PENDING flip to SENDING. Concurrent
  // workers reading the same page therefore claim disjoint subsets. We read
  // claimedAt back so every later write can prove ownership of this exact claim.
  const { data: claimed } = await sb
    .from("broadcast_recipients")
    .update({ status: "SENDING", claimedAt: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "PENDING")
    .select("id, phone, contactName, attempts, vars, claimedAt");

  return (claimed ?? []) as Claimed[];
}

/* ------------------------------- Sending --------------------------------- */

async function sendBatch(
  sb: ReturnType<typeof supabaseAdmin>,
  ctx: SendCtx,
  claimed: Claimed[],
  bucket: TokenBucket,
  deadline: number,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= claimed.length) return;
      const r = claimed[i];

      // Past the budget: don't start new sends. Hand the row back so it isn't
      // orphaned in SENDING (stale recovery would otherwise wait STALE_CLAIM_MS).
      if (Date.now() > deadline) {
        await releaseToPending(sb, r);
        continue;
      }

      await bucket.take();
      const outcome = await sendOne(sb, ctx, r);
      if (outcome === "sent") sent++;
      else if (outcome === "failed") failed++;
      // "retry" (back to PENDING) and "skip" (claim stolen) are not counted here;
      // authoritative totals come from recomputeCounts().
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, claimed.length) }, worker);
  await Promise.all(workers);
  return { sent, failed };
}

type SendOutcome = "sent" | "failed" | "retry" | "skip";

async function sendOne(
  sb: ReturnType<typeof supabaseAdmin>,
  ctx: SendCtx,
  r: Claimed,
): Promise<SendOutcome> {
  // Build components per recipient: the broadcast's global vars overlaid with
  // this recipient's personalized values (from a mapped CSV column).
  const components = buildComponents(ctx.template, { ...ctx.globalVars, ...(r.vars ?? {}) });
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: r.phone,
    type: "template",
    template: {
      name: ctx.template.name,
      language: { code: ctx.template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  let res: Response | null = null;
  let networkErr = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${ctx.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    networkErr = true; // includes AbortError (timeout) and connection failures
  } finally {
    clearTimeout(timer);
  }

  // Timeout / network error -> transient (retry with backoff via the loop).
  if (networkErr || !res) {
    return await markTransient(sb, r, "Request timed out or network error");
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
    const waMsgId = data.messages?.[0]?.id ?? null;
    // Terminal write is itself a CAS: only succeed if we still own this exact
    // claim (status === SENDING AND claimedAt unchanged). If a stale-recovery
    // worker stole the claim, this matches 0 rows and we DON'T mirror — the new
    // owner will record it.
    const { data: updated } = await sb
      .from("broadcast_recipients")
      .update({
        status: "SENT",
        whatsappMsgId: waMsgId,
        sentAt: new Date().toISOString(),
        claimedAt: null,
      })
      .eq("id", r.id)
      .eq("status", "SENDING")
      .eq("claimedAt", r.claimedAt)
      .select("id");
    if (!updated || (updated as unknown[]).length === 0) return "skip";

    try {
      // Personalize the mirrored chat body with this recipient's vars so the
      // internal chat shows the real text, not leftover {{n}} placeholders.
      let mirrorBody = ctx.broadcastMessage;
      if (r.vars) {
        for (const [k, v] of Object.entries(r.vars)) {
          mirrorBody = mirrorBody.replaceAll(`{{${k}}}`, v);
        }
      }
      await mirrorToChat(r.phone, r.contactName, mirrorBody, waMsgId);
    } catch (chatErr) {
      console.error("[Broadcast] mirror-to-chat failed:", chatErr);
    }
    return "sent";
  }

  // Non-OK HTTP. 429 (rate limit) and 5xx are transient; 4xx business errors
  // (invalid number, template paused, messaging-limit reached, bad token) are
  // terminal — the error text is preserved so the user can see why.
  const errText = (await res.text().catch(() => "")).slice(0, 500);
  if (res.status === 429 || res.status >= 500) {
    if (res.status === 429) {
      // Throughput throttle — back off (honoring Retry-After, capped) so we ride
      // out short bursts instead of burning the retry budget in a few seconds.
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 2_000;
      await new Promise((rs) => setTimeout(rs, backoff));
    }
    return await markTransient(sb, r, errText);
  }
  const { data: failedRows } = await sb
    .from("broadcast_recipients")
    .update({ status: "FAILED", error: errText, claimedAt: null })
    .eq("id", r.id)
    .eq("status", "SENDING")
    .eq("claimedAt", r.claimedAt)
    .select("id");
  return !failedRows || (failedRows as unknown[]).length === 0 ? "skip" : "failed";
}

// Transient failure: bump the attempt counter and either retry (back to
// PENDING) or, once exhausted, mark FAILED. Both writes are CAS-guarded on the
// claim so they no-op if the row was reclaimed out from under us.
async function markTransient(
  sb: ReturnType<typeof supabaseAdmin>,
  r: Claimed,
  errText: string,
): Promise<SendOutcome> {
  const nextAttempts = (r.attempts ?? 0) + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    const { data } = await sb
      .from("broadcast_recipients")
      .update({
        status: "FAILED",
        error: (errText || "Failed after maximum retries").slice(0, 500),
        attempts: nextAttempts,
        claimedAt: null,
      })
      .eq("id", r.id)
      .eq("status", "SENDING")
      .eq("claimedAt", r.claimedAt)
      .select("id");
    return !data || (data as unknown[]).length === 0 ? "skip" : "failed";
  }
  const { data } = await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", attempts: nextAttempts, claimedAt: null })
    .eq("id", r.id)
    .eq("status", "SENDING")
    .eq("claimedAt", r.claimedAt)
    .select("id");
  return !data || (data as unknown[]).length === 0 ? "skip" : "retry";
}

// Return a claimed-but-unsent row to PENDING (e.g. budget hit). Not an attempt.
// Guarded on the claim so a row already reclaimed by stale recovery is left be.
async function releaseToPending(sb: ReturnType<typeof supabaseAdmin>, r: Claimed): Promise<void> {
  await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", claimedAt: null })
    .eq("id", r.id)
    .eq("status", "SENDING")
    .eq("claimedAt", r.claimedAt);
}

/* --------------------------- Recovery / counts --------------------------- */

async function reclaimStale(broadcastId: string): Promise<void> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  // Claims older than the cutoff are from a dead worker (no live worker outlives
  // the ~60s function ceiling).
  await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", claimedAt: null })
    .eq("broadcastId", broadcastId)
    .eq("status", "SENDING")
    .lt("claimedAt", cutoff);
  // Legacy/edge rows stuck in SENDING with no claim timestamp.
  await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", claimedAt: null })
    .eq("broadcastId", broadcastId)
    .eq("status", "SENDING")
    .is("claimedAt", null);
}

async function hasRecentActivity(broadcastId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - RECENT_ACTIVITY_MS).toISOString();
  const { count: claimedRecent } = await sb
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcastId", broadcastId)
    .gt("claimedAt", cutoff);
  if ((claimedRecent ?? 0) > 0) return true;
  const { count: sentRecent } = await sb
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcastId", broadcastId)
    .gt("sentAt", cutoff);
  return (sentRecent ?? 0) > 0;
}

async function recomputeCounts(broadcastId: string): Promise<Counts> {
  const sb = supabaseAdmin();
  const countWhere = async (statuses?: string[]): Promise<number> => {
    let q = sb
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcastId", broadcastId);
    if (statuses) q = q.in("status", statuses);
    const { count } = await q;
    return count ?? 0;
  };
  const [total, sent, failed, pending, inflight] = await Promise.all([
    countWhere(),
    countWhere(["SENT", "DELIVERED", "READ"]),
    countWhere(["FAILED"]),
    countWhere(["PENDING"]),
    countWhere(["SENDING"]),
  ]);
  return { total, sent, failed, pending, inflight };
}

async function finalize(broadcastId: string, counts: Counts): Promise<ProcessChunkResult> {
  const sb = supabaseAdmin();
  const finalStatus: "COMPLETED" | "FAILED" =
    counts.failed === counts.total && counts.total > 0 ? "FAILED" : "COMPLETED";
  // Don't override a concurrent Stop.
  await sb
    .from("broadcasts")
    .update({
      status: finalStatus,
      sentCount: counts.sent,
      failedCount: counts.failed,
      completedAt: new Date().toISOString(),
    })
    .eq("id", broadcastId)
    .neq("status", "STOPPED");
  return {
    ok: true,
    broadcastId,
    status: finalStatus,
    done: true,
    terminal: true,
    skipped: false,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: 0,
    inflightCount: 0,
    totalCount: counts.total,
    chunkSent: 0,
    chunkFailed: 0,
  };
}

/* ------------------------------ Chat mirror ------------------------------ */

async function mirrorToChat(
  phone: string,
  contactName: string | null,
  body: string,
  whatsappMsgId: string | null,
): Promise<void> {
  const sb = supabaseAdmin();
  const lastMessage = body.length > 200 ? body.slice(0, 200) + "..." : body;
  const nowIso = new Date().toISOString();

  // Canonicalize so the mirrored chat lands on the same row the webhook uses
  // when this recipient later replies (otherwise "+971…" vs "971…" fork).
  const canonicalPhone = normalizePhone(phone) || phone;

  // Find-or-create by the unique contactPhone. A NEWLY created row is marked
  // isBroadcastOnly so it stays out of the chat tabs until the customer replies;
  // an EXISTING (real) chat is only touched for its last-message preview, never
  // re-flagged. (Broadcast recipients are deduped per send, so there's no
  // same-phone concurrency within a broadcast to race here.)
  const { data: existing } = await sb
    .from("whatsapp_conversations")
    .select("id")
    .eq("contactPhone", canonicalPhone)
    .maybeSingle();

  let conversationId: string | null = null;
  if (existing) {
    conversationId = (existing as { id: string }).id;
    await sb
      .from("whatsapp_conversations")
      .update({ lastMessage, lastMessageAt: nowIso })
      .eq("id", conversationId);
  } else {
    const baseRow = { contactName: contactName ?? canonicalPhone, contactPhone: canonicalPhone, lastMessage, lastMessageAt: nowIso };
    let ins = await sb
      .from("whatsapp_conversations")
      .insert({ ...baseRow, isBroadcastOnly: true })
      .select("id")
      .single();
    // Graceful fallback if the isBroadcastOnly column isn't migrated yet.
    if (ins.error && /isBroadcastOnly/i.test(ins.error.message)) {
      ins = await sb.from("whatsapp_conversations").insert(baseRow).select("id").single();
    }
    conversationId = ins.data ? (ins.data as { id: string }).id : null;
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

/* ------------------------------- Helpers --------------------------------- */

function buildComponents(
  template: Tpl,
  templateVars: Record<string, string>,
): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];
  if (template.headerType && template.headerType !== "TEXT" && template.headerMediaUrl) {
    const fmt = template.headerType.toLowerCase(); // "image" | "video" | "document"
    const param: Record<string, unknown> = { type: fmt };
    if (fmt === "image") param.image = { link: template.headerMediaUrl };
    else if (fmt === "video") param.video = { link: template.headerMediaUrl };
    else if (fmt === "document")
      param.document = { link: template.headerMediaUrl, filename: "document.pdf" };
    components.push({ type: "header", parameters: [param] });
  }
  if (template.variableCount > 0) {
    const parameters = Array.from({ length: template.variableCount }, (_, i) => ({
      type: "text",
      text: templateVars[String(i + 1)] ?? `{{${i + 1}}}`,
    }));
    components.push({ type: "body", parameters });
  }
  return components;
}

// Simple per-invocation token bucket so concurrent workers share one rate cap.
class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly ratePerSec: number) {
    this.tokens = ratePerSec;
    this.last = Date.now();
  }
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.ratePerSec, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

function errorResult(broadcastId: string, status: string, reason: string): ProcessChunkResult {
  return {
    ok: false,
    broadcastId,
    status,
    done: true,
    terminal: true,
    skipped: false,
    reason,
    sentCount: 0,
    failedCount: 0,
    pendingCount: 0,
    inflightCount: 0,
    totalCount: 0,
    chunkSent: 0,
    chunkFailed: 0,
  };
}

function doneResult(
  broadcastId: string,
  status: string,
  counts: Counts,
  reason?: string,
): ProcessChunkResult {
  return {
    ok: true,
    broadcastId,
    status,
    done: true,
    terminal: true,
    skipped: false,
    reason,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: counts.pending,
    inflightCount: counts.inflight,
    totalCount: counts.total,
    chunkSent: 0,
    chunkFailed: 0,
  };
}

function skippedResult(
  broadcastId: string,
  status: string,
  counts: Counts,
  reason: string,
): ProcessChunkResult {
  const terminal = status === "STOPPED" || status === "CANCELLED";
  return {
    ok: true,
    broadcastId,
    status,
    done: terminal,
    terminal,
    skipped: true,
    reason,
    sentCount: counts.sent,
    failedCount: counts.failed,
    pendingCount: counts.pending,
    inflightCount: counts.inflight,
    totalCount: counts.total,
    chunkSent: 0,
    chunkFailed: 0,
  };
}
