import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Set (or clear) the single user who automatically receives every new
// unassigned case. Pass { userId } to make that user the default, or
// { userId: null } to clear the default entirely. Exactly one default at a time.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  // Only admins/managers may change who receives new cases.
  const role = (session.user as { role?: string }).role;
  if (role && !["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json(fail("You don't have permission to change this"), { status: 403 });
  }

  const { userId } = (await request.json()) as { userId?: string | null };

  const sb = supabaseAdmin();

  // Clear any existing default first so there's never more than one.
  const { error: clearErr } = await sb
    .from("users")
    .update({ isDefaultCaseReceiver: false })
    .eq("isDefaultCaseReceiver", true);
  if (clearErr) return NextResponse.json(fail(clearErr.message), { status: 500 });

  if (userId) {
    const { error: setErr } = await sb
      .from("users")
      .update({ isDefaultCaseReceiver: true })
      .eq("id", userId)
      .eq("isActive", true);
    if (setErr) return NextResponse.json(fail(setErr.message), { status: 500 });
  }

  return NextResponse.json(ok({ userId: userId ?? null }));
}
