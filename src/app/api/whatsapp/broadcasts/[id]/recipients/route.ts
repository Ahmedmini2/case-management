import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp/phone";

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
  // Match on the canonical form, and also query the legacy bare form so links
  // still resolve for conversations created before the phone-normalization backfill.
  const queryPhones = new Set<string>();
  for (const r of recipients) {
    const canon = normalizePhone(r.phone) || r.phone;
    queryPhones.add(canon);
    if (canon.startsWith("+")) queryPhones.add(canon.slice(1)); // legacy bare row
  }
  const phoneToConv = new Map<string, string>(); // keyed by canonical phone
  if (queryPhones.size > 0) {
    const { data: convs } = await sb
      .from("whatsapp_conversations")
      .select("id, contactPhone")
      .in("contactPhone", [...queryPhones]);
    for (const c of (convs ?? []) as { id: string; contactPhone: string }[]) {
      phoneToConv.set(normalizePhone(c.contactPhone) || c.contactPhone, c.id);
    }
  }

  const enriched = recipients.map((r) => ({
    ...r,
    conversationId: phoneToConv.get(normalizePhone(r.phone) || r.phone) ?? null,
  }));

  return NextResponse.json(ok(enriched));
}
