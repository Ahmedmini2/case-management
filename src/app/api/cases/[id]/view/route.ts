import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Records that the current user has opened this case, clearing it from their
// sidebar "new cases" badge. Idempotent upsert on (caseId, userId) — safe to
// call on every open. Analogous to the WhatsApp messages GET resetting unread.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("case_views").upsert(
    { caseId: id, userId: session.user.id, viewedAt: new Date().toISOString() },
    { onConflict: "caseId,userId" },
  );
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  return NextResponse.json(ok({ ok: true }));
}
