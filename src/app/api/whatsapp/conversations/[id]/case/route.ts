import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp/phone";

// Resolve the case "related" to a WhatsApp chat:
//   1. an explicitly linked conversation.caseId, else
//   2. the most recent case of the contact behind this phone number.
// When found via the contact, we link the conversation so future inbound
// messages keep updating that case's timeline.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data: convRow, error: convErr } = await sb
    .from("whatsapp_conversations")
    .select("id, contactPhone, caseId")
    .eq("id", id)
    .maybeSingle();
  if (convErr) return NextResponse.json(fail(convErr.message), { status: 500 });
  if (!convRow) return NextResponse.json(fail("Conversation not found"), { status: 404 });
  const conv = convRow as { id: string; contactPhone: string; caseId: string | null };

  let caseId = conv.caseId ?? null;

  if (!caseId) {
    // Find the contact behind this number (match both stored phone forms), then
    // their newest case.
    const canon = normalizePhone(conv.contactPhone);
    if (canon) {
      const { data: contacts } = await sb
        .from("contacts")
        .select("id")
        .in("phone", [canon, canon.slice(1)]);
      const contactIds = (contacts ?? []).map((c) => (c as { id: string }).id);
      if (contactIds.length > 0) {
        const { data: caseRow } = await sb
          .from("cases")
          .select("id")
          .in("contactId", contactIds)
          .order("createdAt", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (caseRow) {
          caseId = (caseRow as { id: string }).id;
          // Best-effort link so the chat and case stay associated going forward.
          await sb.from("whatsapp_conversations").update({ caseId }).eq("id", conv.id);
        }
      }
    }
  }

  if (!caseId) return NextResponse.json(ok({ case: null }));

  const { data: caseRow } = await sb
    .from("cases")
    .select("id, caseNumber, title, description, status, priority, assignedToId")
    .eq("id", caseId)
    .maybeSingle();

  return NextResponse.json(ok({ case: caseRow ?? null }));
}
