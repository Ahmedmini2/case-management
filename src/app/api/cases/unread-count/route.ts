import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Total "new cases" for the sidebar badge: cases created after the current
// user's baseline that they haven't opened yet. The WhatsApp analog is a single
// global unreadCount column; here read state is per-user, stored in case_views.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const userId = session.user.id;

  // Per-user baseline so the badge only reflects cases created since the user
  // started counting (avoids day-one counting every historical case).
  const { data: userRow } = await sb
    .from("users")
    .select("casesBadgeSince")
    .eq("id", userId)
    .maybeSingle();
  const since =
    (userRow as { casesBadgeSince: string | null } | null)?.casesBadgeSince ??
    new Date(0).toISOString();

  // Candidate new cases. Capped: the badge renders "99+" past 99, so we never
  // need an exact count beyond a few hundred.
  const { data: candRows, error } = await sb
    .from("cases")
    .select("id")
    .gt("createdAt", since)
    .order("createdAt", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  const candidates = (candRows ?? []) as { id: string }[];
  if (candidates.length === 0) return NextResponse.json(ok({ total: 0 }));

  // Subtract the candidates this user has already opened.
  const { data: viewRows } = await sb
    .from("case_views")
    .select("caseId")
    .eq("userId", userId)
    .in(
      "caseId",
      candidates.map((c) => c.id),
    );
  const viewed = new Set(((viewRows ?? []) as { caseId: string }[]).map((v) => v.caseId));

  const total = candidates.filter((c) => !viewed.has(c.id)).length;
  return NextResponse.json(ok({ total }));
}
