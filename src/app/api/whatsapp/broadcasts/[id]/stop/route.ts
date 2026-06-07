import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Stop a broadcast that's mid-flight (or one stuck in SENDING due to errors).
//
// - Flips the broadcast to STOPPED so the cron / chunk worker skip it forever
// - Resets any in-flight (SENDING) recipients back to PENDING so they aren't
//   abandoned, which lets the user resume cleanly later without losing them
// - Leaves SENT / FAILED rows alone (those are already done)
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
  if (b.status === "COMPLETED") {
    return NextResponse.json(fail("Broadcast has already completed"), { status: 400 });
  }
  if (b.status === "STOPPED") {
    return NextResponse.json(ok({ id, status: "STOPPED", alreadyStopped: true }));
  }

  // Flip the broadcast itself first so any in-flight worker sees STOPPED on
  // its next status check and bails out of its loop.
  const { error: updErr } = await sb
    .from("broadcasts")
    .update({ status: "STOPPED", completedAt: new Date().toISOString() })
    .eq("id", id);
  if (updErr) return NextResponse.json(fail(updErr.message), { status: 500 });

  // Return any claimed-but-not-yet-sent recipients to PENDING (clearing the
  // claim stamp) so the user can resume from where we left off without losing
  // them.
  const { error: rstErr } = await sb
    .from("broadcast_recipients")
    .update({ status: "PENDING", claimedAt: null })
    .eq("broadcastId", id)
    .eq("status", "SENDING");

  if (rstErr) {
    // Non-fatal — broadcast is stopped, recipient reset can be retried.
    console.error("[stop broadcast] recipient reset failed:", rstErr.message);
  }

  return NextResponse.json(ok({ id, status: "STOPPED" }));
}
