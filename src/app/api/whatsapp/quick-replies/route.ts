import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const createSchema = z.object({
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(4000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_quick_replies")
    .select("id, title, content, createdAt")
    .eq("userId", session.user.id)
    .order("createdAt", { ascending: false });

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data ?? []));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(fail("Title and content are required"), { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_quick_replies")
    .insert({
      userId: session.user.id,
      title: parsed.data.title.trim(),
      content: parsed.data.content,
    })
    .select("id, title, content, createdAt")
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data), { status: 201 });
}
