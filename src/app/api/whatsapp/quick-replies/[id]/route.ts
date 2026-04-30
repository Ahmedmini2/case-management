import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("whatsapp_quick_replies")
    .delete()
    .eq("id", id)
    .eq("userId", session.user.id);

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok({ id }));
}
