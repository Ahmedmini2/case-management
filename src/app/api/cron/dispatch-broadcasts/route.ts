import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Vercel Cron pings this endpoint every minute. It picks up any broadcast whose
// scheduledAt has passed and is still SCHEDULED, then triggers the existing send route.
//
// Vercel signs cron requests with the CRON_SECRET env var via `Authorization: Bearer <secret>`.
// In dev, also accept ?secret=... query for manual triggering.

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, allow (dev convenience). Set CRON_SECRET in production.
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

function resolveBaseUrl(request: Request): string {
  // Prefer explicit config; fall back to the request's own host (works on Vercel without env);
  // use VERCEL_URL as a last resort for non-custom-domain deployments.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    if (u.host && u.host !== "localhost:3000") return `${u.protocol}//${u.host}`;
  } catch { /* ignore */ }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function dispatch(request: Request) {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Find due scheduled broadcasts.
  const { data: scheduledRaw, error: schedErr } = await sb
    .from("broadcasts")
    .select("id")
    .eq("status", "SCHEDULED")
    .not("scheduledAt", "is", null)
    .lte("scheduledAt", nowIso)
    .limit(20);

  if (schedErr) {
    console.error("[cron/dispatch-broadcasts] scheduled lookup failed:", schedErr.message);
    return { triggered: 0, resumed: 0, errors: [schedErr.message] };
  }

  // 2) Find in-progress broadcasts that still have PENDING recipients. These are
  //    the ones we need to keep feeding chunks to — every cron tick processes
  //    another ~150 recipients per broadcast.
  const { data: sendingRaw, error: sendErr } = await sb
    .from("broadcasts")
    .select("id")
    .eq("status", "SENDING")
    .limit(20);

  if (sendErr) {
    console.error("[cron/dispatch-broadcasts] sending lookup failed:", sendErr.message);
  }

  const scheduled = (scheduledRaw ?? []) as { id: string }[];
  const sending = (sendingRaw ?? []) as { id: string }[];

  // Filter SENDING broadcasts to only those with PENDING recipients left.
  const sendingWithPending: { id: string }[] = [];
  for (const b of sending) {
    const { count } = await sb
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcastId", b.id)
      .eq("status", "PENDING");
    if ((count ?? 0) > 0) sendingWithPending.push(b);
  }

  const baseUrl = resolveBaseUrl(request);
  const cronSecret = process.env.CRON_SECRET ?? "";

  const errors: string[] = [];
  let triggered = 0;
  let resumed = 0;

  // Helper that fires the send endpoint without awaiting. We don't await because
  // /send takes up to 60 seconds per call and we want this cron handler to
  // return quickly — the send route is now self-contained per chunk.
  function kick(id: string): void {
    void fetch(`${baseUrl}/api/whatsapp/broadcasts/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    }).catch((e) => console.error(`[cron] send fetch failed for ${id}:`, e));
  }

  for (const b of scheduled) {
    try { kick(b.id); triggered++; }
    catch (err) { errors.push(`${b.id}: ${err instanceof Error ? err.message : String(err)}`); }
  }

  for (const b of sendingWithPending) {
    try { kick(b.id); resumed++; }
    catch (err) { errors.push(`${b.id}: ${err instanceof Error ? err.message : String(err)}`); }
  }

  return { triggered, resumed, errors };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }
  const result = await dispatch(request);
  return NextResponse.json(ok(result));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }
  const result = await dispatch(request);
  return NextResponse.json(ok(result));
}
