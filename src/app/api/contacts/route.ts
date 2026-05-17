import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  // tags=a,b — contact must contain ALL of these (AND)
  const tagsParam = searchParams.get("tags")?.trim() ?? "";
  const tagFilters = tagsParam
    ? tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const sb = supabaseAdmin();
  let query = sb
    .from("contacts")
    .select("id, name, email, phone, company, tags, createdAt, cases(count)")
    .order("createdAt", { ascending: false });

  if (search) {
    // ilike across name/email/phone/company. The .or() pattern needs comma-
    // separated filters; commas in the value would break it, so we strip them.
    const safe = search.replace(/[%,]/g, "");
    query = query.or(
      `name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,company.ilike.%${safe}%`,
    );
  }

  if (tagFilters.length > 0) {
    // contains() compiles to the `@>` operator, which is GIN-indexable.
    query = query.contains("tags", tagFilters);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  type Row = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    tags: string[] | null;
    createdAt: string;
    cases?: Array<{ count: number }>;
  };
  const enriched = (data as Row[] | null ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    tags: c.tags ?? [],
    createdAt: c.createdAt,
    _count: { cases: c.cases?.[0]?.count ?? 0 },
  }));

  return NextResponse.json(ok(enriched, { total: enriched.length }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const sb = supabaseAdmin();
  const payload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.tags) {
    payload.tags = [...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  }
  const { data, error } = await sb
    .from("contacts")
    .insert(payload)
    .select("id, name, email, phone, company, tags, createdAt")
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data), { status: 201 });
}
