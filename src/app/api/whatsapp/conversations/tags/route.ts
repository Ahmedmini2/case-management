import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Distinct set of tags used across all WhatsApp conversations, with usage counts.
// Powers the reusable tag picker so an agent can re-apply an existing tag (e.g.
// "influencer") instead of retyping it. Mirrors /api/contacts/tags.
//
// NOTE: this static segment must resolve before the dynamic [id] route — it does,
// because Next matches static segments ahead of dynamic ones.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  // Pull every tags array (unbounded — we need them all for a complete vocabulary).
  const { data, error } = await sb.from("whatsapp_conversations").select("tags");
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const tags = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return NextResponse.json(ok({ tags, total: tags.length }));
}
