import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const handledBy = searchParams.get("handledBy");
  const search = searchParams.get("search");
  const unreadOnly = searchParams.get("unreadOnly");
  const phone = searchParams.get("phone");

  const sb = supabaseAdmin();
  let query = sb
    .from("whatsapp_conversations")
    .select("*")
    .order("lastMessageAt", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status.toUpperCase());
  if (handledBy) query = query.eq("handledBy", handledBy.toUpperCase());
  if (unreadOnly === "true") query = query.gt("unreadCount", 0);
  if (phone) {
    // Match either +<digits> or just <digits>. The webhook stores Meta's raw value
    // (no `+`), while user-typed numbers usually carry a `+`. Try both.
    const digits = phone.replace(/\D/g, "");
    if (digits) {
      query = query.in("contactPhone", [digits, `+${digits}`]);
    }
  }
  if (search) {
    query = query.or(
      `contactName.ilike.%${search}%,contactPhone.ilike.%${search}%,lastMessage.ilike.%${search}%`,
    );
  }

  const { data: conversations, error } = await query;
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  const list = conversations ?? [];
  type Conv = { agentId: string | null };
  const agentIds = [...new Set((list as Conv[]).map((c) => c.agentId).filter(Boolean))] as string[];

  const agentMap = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", agentIds);
    for (const a of (agents ?? []) as { id: string; name: string | null; email: string }[]) {
      agentMap.set(a.id, a.name ?? a.email);
    }
  }

  const enriched = (list as (Conv & Record<string, unknown>)[]).map((c) => {
    const rawTags = (c as { tags?: unknown }).tags;
    return {
      ...c,
      tags: Array.isArray(rawTags) ? (rawTags as string[]) : [],
      agentName: c.agentId ? agentMap.get(c.agentId) ?? null : null,
    };
  });

  return NextResponse.json(ok(enriched));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const body = (await request.json()) as {
    contactName: string;
    contactPhone: string;
    contactAvatar?: string;
  };

  if (!body.contactName || !body.contactPhone) {
    return NextResponse.json(fail("contactName and contactPhone are required"), { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .upsert(
      {
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactAvatar: body.contactAvatar ?? null,
      },
      { onConflict: "contactPhone" },
    )
    .select()
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data), { status: 201 });
}
