import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { triggerPusherEvent } from "@/lib/pusher";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  if (!data) return NextResponse.json(fail("Conversation not found"), { status: 404 });

  return NextResponse.json(ok(data));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: conversation, error: findErr } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!conversation) return NextResponse.json(fail("Conversation not found"), { status: 404 });

  type Conv = {
    id: string;
    handledBy: string;
    caseId: string | null;
    agentId: string | null;
  } & Record<string, unknown>;
  const conv = conversation as Conv;

  const body = (await request.json()) as {
    handledBy?: string;
    status?: string;
    agentId?: string;
    tags?: string[];
    caseId?: string;
    caseNumber?: string;
  };

  const data: Record<string, unknown> = {};

  if (body.status) data.status = body.status.toUpperCase();
  if (body.agentId !== undefined) data.agentId = body.agentId;
  if (body.tags) data.tags = body.tags;
  if (body.caseId) data.caseId = body.caseId;

  if (body.handledBy) {
    const newHandledBy = body.handledBy.toUpperCase();
    data.handledBy = newHandledBy;

    if (newHandledBy === "HUMAN" && conv.handledBy === "AI") {
      // Default the owner to the actor only on a plain take-over. If the caller
      // explicitly named an agent (the "Assign Agent" dropdown), keep that choice.
      if (body.agentId === undefined) data.agentId = session.user.id;

      if (conv.caseId) {
        await sb.from("activities").insert({
          caseId: conv.caseId,
          userId: session.user.id,
          type: "FIELD_UPDATED",
          description: `Agent ${session.user.name ?? session.user.email} took over WhatsApp conversation from AI`,
        });
      }
    } else if (newHandledBy === "AI" && conv.handledBy === "HUMAN") {
      data.agentId = null;

      if (conv.caseId) {
        await sb.from("activities").insert({
          caseId: conv.caseId,
          userId: session.user.id,
          type: "FIELD_UPDATED",
          description: "Handed WhatsApp conversation back to AI agent",
        });
      }
    }
  }

  const { data: updated, error: updErr } = await sb
    .from("whatsapp_conversations")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) return NextResponse.json(fail(updErr.message), { status: 500 });

  await writeAudit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "WhatsAppConversation",
    resourceId: id,
    before: conv,
    after: updated,
    req: request,
  });

  await triggerPusherEvent("whatsapp", "whatsapp:conversation_updated", {
    conversationId: id,
    ...(updated as Record<string, unknown>),
  });

  return NextResponse.json(ok(updated));
}
