import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processBroadcastChunk } from "@/lib/whatsapp/process-broadcast-chunk";

export const maxDuration = 60;

// Resume a STOPPED (or FAILED) broadcast: flip status back to DRAFT, then
// kick off the first chunk in this same invocation. The cron picks up the
// rest from the next minute onward.
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
    return NextResponse.json(
      fail(`Cannot resume a broadcast in status ${b.status}`),
      { status: 400 },
    );
  }

  // Reset to DRAFT and clear completedAt so the chunk processor can take it.
  // Existing SENT/FAILED recipients are preserved; remaining PENDING continue
  // from where we left off.
  const { error: updErr } = await sb
    .from("broadcasts")
    .update({ status: "DRAFT", completedAt: null })
    .eq("id", id);
  if (updErr) return NextResponse.json(fail(updErr.message), { status: 500 });

  // Kick off the first chunk synchronously so the user sees immediate progress.
  const result = await processBroadcastChunk(id);
  if (!result.ok) {
    const status = result.skipped ? 200 : 400;
    return NextResponse.json(
      status === 200
        ? ok({ id, resumed: true, skipped: true, reason: result.reason })
        : fail(result.reason),
      { status },
    );
  }
  return NextResponse.json(ok({ ...result, resumed: true }));
}
