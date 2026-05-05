import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();

  const { data: rows, error } = await sb
    .from("broadcast_recipients")
    .select("id, phone, contactName, status, sentAt, deliveredAt, readAt")
    .eq("broadcastId", id)
    .order("createdAt", { ascending: true });

  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  type Row = { id: string; phone: string; contactName: string | null; status: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null };
  const recipients = (rows ?? []) as Row[];

  // Resolve conversationId per phone so the UI can jump straight into the chat.
  const phones = [...new Set(recipients.map((r) => r.phone))];
  const phoneToConv = new Map<string, string>();
  if (phones.length > 0) {
    const { data: convs } = await sb
      .from("whatsapp_conversations")
      .select("id, contactPhone")
      .in("contactPhone", phones);
    for (const c of (convs ?? []) as { id: string; contactPhone: string }[]) {
      phoneToConv.set(c.contactPhone, c.id);
    }
  }

  const enriched = recipients.map((r) => ({
    ...r,
    conversationId: phoneToConv.get(r.phone) ?? null,
  }));

  return NextResponse.json(ok(enriched));
}
