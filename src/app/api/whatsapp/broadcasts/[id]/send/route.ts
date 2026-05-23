import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { processBroadcastChunk } from "@/lib/whatsapp/process-broadcast-chunk";

// Use the full Pro/Enterprise window. One chunk per invocation; the cron
// re-fires the SAME library function directly (no HTTP hop) until done.
export const maxDuration = 60;

// Send a broadcast — processes ONE chunk per invocation, synchronously.
// The cron picks up the rest of the broadcast in subsequent invocations.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && request.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const { id } = await params;
  const result = await processBroadcastChunk(id);

  if (!result.ok) {
    // skipped (another worker active, race lost) is informational, not an error
    const status = result.skipped ? 200 : 400;
    return NextResponse.json(
      status === 200
        ? ok({ id, skipped: true, reason: result.reason })
        : fail(result.reason),
      { status },
    );
  }

  return NextResponse.json(ok(result));
}
