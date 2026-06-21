import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserRole } from "@/types/enums";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, name, email, image, role, isDefaultCaseReceiver")
    .eq("isActive", true)
    .order("createdAt", { ascending: true });

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data ?? [], { total: (data ?? []).length }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(fail("Email already exists"), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const { data: created, error } = await sb
    .from("users")
    .insert({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      isActive: true,
    })
    .select("id, name, email, role, createdAt")
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(created), { status: 201 });
}
