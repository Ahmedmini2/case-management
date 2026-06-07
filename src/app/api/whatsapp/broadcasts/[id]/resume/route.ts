import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processBroadcastChunk } from "@/lib/whatsapp/process-broadcast-chunk";

export const maxDuration = 60;

// Resume a STOPPED or FAILED broadcast: requeue everything that didn't send
// (in-flight claims AND prior failures), flip back to DRAFT, then kick the first
// chunk in this same invocation. The browser driver + cron carry it the rest of
// the way. SENT/DELIVERED/READ recipients are preserved and never re-sent.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data: broadcast, error: findErr } = await sb
    .from("broadcasts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!broadcast) return NextResponse.json(fail("Broadcast not found"), { status: 404 });

  const b = broadcast as { id: string; status: string };
  if (b.status !== "STOPPED" && b.status !== "FAILED") {
    return NextResponse.json(fail(`Cannot resume a broadcast in status ${b.status}`), { status: 400 });
  }

  // Requeue unsent recipients (claimed-but-stuck + previously failed). Reset the
  // attempt counter so they get a fresh set of retries.
  const { error: rstErr } = await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", claimedAt: null, attempts: 0, error: null })
    .eq("broadcastId", id)
    .in("status", ["SENDING", "FAILED"]);
  if (rstErr) return NextResponse.json(fail(rstErr.message), { status: 500 });

  const { error: updErr } = await sb
    .from("broadcasts")
    .update({ status: "DRAFT", completedAt: null })
    .eq("id", id);
  if (updErr) return NextResponse.json(fail(updErr.message), { status: 500 });

  const result = await processBroadcastChunk(id, { source: "manual" });
  return NextResponse.json(ok({ ...result, resumed: true }));
}
