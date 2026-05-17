import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const bulkSchema = z.object({
  entries: z
    .array(
      z.object({
        phone: z.string().min(5).max(40),
        name: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(5000),
  // Tags to apply to every entry. New rows are created with these tags,
  // existing rows get the tags merged in (union — never replaced).
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
});

function normPhone(raw: string): string {
  const digits = raw.replace(/[^+\d]/g, "");
  if (!digits) return raw.trim();
  return digits.startsWith("+") ? digits : `+${digits}`;
}

// Bulk-upsert contacts by phone number and tag them all with the supplied tags.
// This is the path the broadcast CSV-upload flow uses to "save as segment":
// it preserves existing contact data and just unions the new tags in.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = bulkSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const cleanTags = [
    ...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ];

  // Dedup incoming entries by normalized phone — last name wins.
  const byPhone = new Map<string, { phone: string; name: string }>();
  for (const e of parsed.data.entries) {
    const p = normPhone(e.phone);
    byPhone.set(p, { phone: p, name: (e.name?.trim() || p).slice(0, 120) });
  }
  const incoming = [...byPhone.values()];

  const sb = supabaseAdmin();

  // Find which phones already exist so we can union tags without losing data.
  const phones = incoming.map((e) => e.phone);
  const { data: existingRows, error: lookupErr } = await sb
    .from("contacts")
    .select("id, phone, name, tags")
    .in("phone", phones);

  if (lookupErr) return NextResponse.json(fail(lookupErr.message), { status: 500 });

  const existing = new Map<string, { id: string; name: string; tags: string[] | null }>();
  for (const row of (existingRows ?? []) as { id: string; phone: string; name: string; tags: string[] | null }[]) {
    existing.set(row.phone, { id: row.id, name: row.name, tags: row.tags });
  }

  let updated = 0;
  let created = 0;

  // Update existing rows one by one. Bulk upsert via Supabase doesn't easily
  // do tag-union without overwriting, so we do per-row updates instead.
  for (const e of incoming) {
    const found = existing.get(e.phone);
    if (found) {
      const mergedTags = [...new Set([...(found.tags ?? []), ...cleanTags])];
      const { error: updErr } = await sb
        .from("contacts")
        .update({ tags: mergedTags })
        .eq("id", found.id);
      if (!updErr) updated++;
    }
  }

  // Insert net-new rows.
  const toInsert = incoming
    .filter((e) => !existing.has(e.phone))
    .map((e) => ({
      name: e.name,
      phone: e.phone,
      tags: cleanTags,
    }));

  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await sb
      .from("contacts")
      .insert(toInsert)
      .select("id");
    if (insErr) {
      // Most common reason for partial failure: email unique constraint when
      // an entry collides with an existing email. We don't add emails here,
      // so it should be safe — surface the error rather than silently dropping.
      return NextResponse.json(fail(insErr.message), { status: 500 });
    }
    created = inserted?.length ?? 0;
  }

  return NextResponse.json(ok({
    created,
    updated,
    tags: cleanTags,
    total: incoming.length,
  }));
}
