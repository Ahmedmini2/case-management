import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Lightweight endpoint that returns the total unread WhatsApp messages
// across all conversations. Used by the sidebar badge.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .select("unreadCount")
    .gt("unreadCount", 0);

  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  const rows = (data ?? []) as { unreadCount: number | null }[];
  const total = rows.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0);
  const conversations = rows.length;

  return NextResponse.json(ok({ total, conversations }));
}
