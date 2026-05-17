import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Returns every distinct tag in the contacts table together with how many
// contacts carry it. Used by the contacts page filter chips and the broadcast
// "send to segment" picker.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  // Pull all tag arrays in one shot — cheap because tags is a small array per
  // row. Aggregation is done in JS to avoid a separate SQL view.
  const { data, error } = await sb
    .from("contacts")
    .select("tags");

  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const tags = [...counts.entries()]
    .map(([name, memberCount]) => ({ name, memberCount }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  return NextResponse.json(ok({ tags, total: tags.length }));
}
