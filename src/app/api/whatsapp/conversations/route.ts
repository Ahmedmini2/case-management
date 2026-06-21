import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp/phone";

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
  // Pagination for the infinite-scroll chat list.
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  // Commas/parens would break PostgREST's .or() filter syntax.
  const safeSearch = (search ?? "").replace(/[%,()]/g, "").trim();

  const sb = supabaseAdmin();

  // Build the list query. `excludeBroadcast` hides broadcast-only conversations
  // (a send the customer never replied to) from the chat tabs — but NOT from the
  // case-panel phone lookup, which must still find them.
  const buildQuery = (excludeBroadcast: boolean) => {
    let q = sb
      .from("whatsapp_conversations")
      .select("*")
      .order("lastMessageAt", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) q = q.eq("status", status.toUpperCase());
    if (handledBy) q = q.eq("handledBy", handledBy.toUpperCase());
    if (unreadOnly === "true") q = q.gt("unreadCount", 0);
    if (phone) {
      // Canonicalize (handles +971 / 00971 / 971 / spaces/dashes), then match
      // both stored forms: app-side "+digits" and the webhook's bare "digits".
      const canon = normalizePhone(phone);
      if (canon) q = q.in("contactPhone", [canon, canon.slice(1)]);
    }
    if (safeSearch) {
      q = q.or(
        `contactName.ilike.%${safeSearch}%,contactPhone.ilike.%${safeSearch}%,lastMessage.ilike.%${safeSearch}%`,
      );
    }
    if (excludeBroadcast) q = q.neq("isBroadcastOnly", true);
    return q;
  };

  // Exclude broadcast-only chats by default; if the column hasn't been migrated
  // yet, fall back to the unfiltered query so the list still works.
  let { data: conversations, error } = await buildQuery(!phone);
  if (error && /isBroadcastOnly/i.test(error.message)) {
    ({ data: conversations, error } = await buildQuery(false));
  }
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

  // Canonicalize so a user-typed "+971…"/"971…" lands on the same row Meta's
  // webhook would create. See src/lib/whatsapp/phone.ts.
  const contactPhone = normalizePhone(body.contactPhone);
  if (contactPhone.length < 8) {
    return NextResponse.json(fail("Phone number looks invalid"), { status: 400 });
  }

  const sb = supabaseAdmin();

  // If a conversation already exists for this number (e.g. the customer messaged
  // in and is currently handled by the AI or another agent), do NOT hijack it:
  // return it as-is rather than stealing ownership or overwriting the stored
  // WhatsApp profile name. The agent can still "Take Over" explicitly. Only a
  // genuinely new number is claimed for its creator.
  const { data: existing } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("contactPhone", contactPhone)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(ok(existing), { status: 200 });
  }

  // New chat: belongs to the agent who created it, NOT the AI. handledBy=HUMAN +
  // agentId=me so the AI never auto-replies and it shows under "My Chats".
  // (The inbound webhook is a separate insert that stays AI-default.)
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .insert({
      contactName: body.contactName,
      contactPhone,
      contactAvatar: body.contactAvatar ?? null,
      handledBy: "HUMAN",
      agentId: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data), { status: 201 });
}
