import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processBroadcastChunk } from "@/lib/whatsapp/process-broadcast-chunk";

// Vercel Cron pings this endpoint every minute. It (a) starts any due
// SCHEDULED broadcasts and (b) keeps draining chunks of any SENDING broadcast
// that still has PENDING recipients.
//
// CRITICAL: We process chunks INSIDE this invocation by directly awaiting the
// chunk processor — no HTTP fetch to /send. Earlier versions used
// `void fetch(...)` which Vercel kills along with this function. That's why
// only 5/21000 messages were going out.
export const maxDuration = 60;

// How much of this invocation's 60s budget we'll actually spend on sending.
// One chunk takes up to ~55s, so we only have time for ONE chunk per tick.
const CRON_BUDGET_MS = 58 * 1000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function dispatch(): Promise<{
  triggered: number;
  resumed: number;
  results: Array<{ id: string; ok: boolean; reason?: string; sent?: number; failed?: number; pending?: number; done?: boolean }>;
  errors: string[];
}> {
  const start = Date.now();
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Due scheduled broadcasts (oldest first).
  const { data: scheduledRaw, error: schedErr } = await sb
    .from("broadcasts")
    .select("id, scheduledAt")
    .eq("status", "SCHEDULED")
    .not("scheduledAt", "is", null)
    .lte("scheduledAt", nowIso)
    .order("scheduledAt", { ascending: true })
    .limit(20);

  if (schedErr) {
    console.error("[cron] scheduled lookup failed:", schedErr.message);
    return { triggered: 0, resumed: 0, results: [], errors: [schedErr.message] };
  }

  // 2) In-progress broadcasts (resume the oldest first so big ones finish).
  const { data: sendingRaw, error: sendErr } = await sb
    .from("broadcasts")
    .select("id, startedAt")
    .eq("status", "SENDING")
    .order("startedAt", { ascending: true })
    .limit(20);

  if (sendErr) {
    console.error("[cron] sending lookup failed:", sendErr.message);
  }

  const candidates: { id: string; kind: "scheduled" | "sending" }[] = [
    ...((scheduledRaw ?? []) as { id: string }[]).map((b) => ({ id: b.id, kind: "scheduled" as const })),
    ...((sendingRaw ?? []) as { id: string }[]).map((b) => ({ id: b.id, kind: "sending" as const })),
  ];

  if (candidates.length === 0) {
    return { triggered: 0, resumed: 0, results: [], errors: [] };
  }

  let triggered = 0;
  let resumed = 0;
  const errors: string[] = [];
  const results: Array<{ id: string; ok: boolean; reason?: string; sent?: number; failed?: number; pending?: number; done?: boolean }> = [];

  // Process candidates sequentially within our time budget. With CHUNK_SIZE=150
  // and ~300-400ms per message, one chunk uses essentially the whole budget,
  // so we typically only get to the first broadcast per tick. That's fine —
  // the cron fires again in 60s and continues.
  for (const c of candidates) {
    if (Date.now() - start > CRON_BUDGET_MS - 5000) {
      // Out of time. Remaining candidates picked up next tick.
      break;
    }

    try {
      const result = await processBroadcastChunk(c.id, { source: "cron" });
      if (result.skipped) {
        // Deferred (a client driver is active) or stopped — informational.
        results.push({ id: c.id, ok: true, reason: result.reason, pending: result.pendingCount });
      } else if (result.ok) {
        if (c.kind === "scheduled") triggered++;
        else resumed++;
        results.push({
          id: c.id,
          ok: true,
          sent: result.chunkSent,
          failed: result.chunkFailed,
          pending: result.pendingCount,
          done: result.done,
        });
      } else {
        // Config error (no template, not approved, missing creds).
        results.push({ id: c.id, ok: false, reason: result.reason });
        errors.push(`${c.id}: ${result.reason}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${c.id}: ${msg}`);
      results.push({ id: c.id, ok: false, reason: msg });
    }
  }

  return { triggered, resumed, results, errors };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }
  const result = await dispatch();
  return NextResponse.json(ok(result));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }
  const result = await dispatch();
  return NextResponse.json(ok(result));
}
