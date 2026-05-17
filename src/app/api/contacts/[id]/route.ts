import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data: contact, error } = await sb
    .from("contacts")
    .select("id, name, email, phone, company, avatarUrl, notes, tags, createdAt, updatedAt")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  if (!contact) return NextResponse.json(fail("Contact not found"), { status: 404 });

  // Fetch recent cases
  const { data: cases } = await sb
    .from("cases")
    .select("id, caseNumber, title, status, priority, createdAt, assignedToId")
    .eq("contactId", id)
    .order("createdAt", { ascending: false })
    .limit(20);

  type CaseRow = {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    assignedToId: string | null;
  };
  const caseRows = ((cases as CaseRow[] | null) ?? []);

  // Hydrate assignees
  const userIds = [...new Set(caseRows.map((c) => c.assignedToId).filter(Boolean))] as string[];
  const userMap = new Map<string, { id: string; name: string | null; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", userIds);
    for (const u of (users ?? []) as { id: string; name: string | null; email: string }[]) {
      userMap.set(u.id, u);
    }
  }

  const enrichedCases = caseRows.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    status: c.status,
    priority: c.priority,
    createdAt: c.createdAt,
    assignedTo: c.assignedToId ? userMap.get(c.assignedToId) ?? null : null,
  }));

  return NextResponse.json(ok({ ...(contact as Record<string, unknown>), cases: enrichedCases }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("contacts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!existing) return NextResponse.json(fail("Contact not found"), { status: 404 });

  const payload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.tags) {
    payload.tags = [...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  }

  const { data, error } = await sb
    .from("contacts")
    .update(payload)
    .eq("id", id)
    .select("id, name, email, phone, company, notes, tags")
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data));
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("contacts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!existing) return NextResponse.json(fail("Contact not found"), { status: 404 });

  const { error } = await sb.from("contacts").delete().eq("id", id);
  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok({ id }));
}
