import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { processBroadcastChunk } from "@/lib/whatsapp/process-broadcast-chunk";

// One chunk per invocation. The browser driver (handleSend in the broadcast
// page) calls this repeatedly until the broadcast reaches a terminal status;
// the every-minute cron is the backstop for when the tab is closed.
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && request.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const { id } = await params;
  const result = await processBroadcastChunk(id, { source: isCron ? "cron" : "manual" });

  // Always 200 with the structured result so the client driver can read
  // { status, done, terminal, pendingCount, reason } uniformly and decide
  // whether to keep looping. Errors are conveyed via result.ok / result.reason.
  return NextResponse.json(ok(result));
}
