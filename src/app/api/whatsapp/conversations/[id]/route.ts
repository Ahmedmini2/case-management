import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/prisma";
import { triggerPusherEvent } from "@/lib/pusher";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const conversation = await db.whatsAppConversation.findUnique({
    where: { id },
  });

  if (!conversation) {
    return NextResponse.json(fail("Conversation not found"), { status: 404 });
  }

  return NextResponse.json(ok(conversation));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const conversation = await db.whatsAppConversation.findUnique({
    where: { id },
  });

  if (!conversation) {
    return NextResponse.json(fail("Conversation not found"), { status: 404 });
  }

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

  // Handle handoff logic
  if (body.handledBy) {
    const newHandledBy = body.handledBy.toUpperCase();
    data.handledBy = newHandledBy;

    if (newHandledBy === "HUMAN" && conversation.handledBy === "AI") {
      data.agentId = session.user.id;

      // Log activity if linked to a case
      if (conversation.caseId) {
        await db.activity.create({
          data: {
            caseId: conversation.caseId,
            userId: session.user.id,
            type: "FIELD_UPDATED",
            description: `Agent ${session.user.name ?? session.user.email} took over WhatsApp conversation from AI`,
          },
        });
      }
    } else if (newHandledBy === "AI" && conversation.handledBy === "HUMAN") {
      data.agentId = null;

      if (conversation.caseId) {
        await db.activity.create({
          data: {
            caseId: conversation.caseId,
            userId: session.user.id,
            type: "FIELD_UPDATED",
            description: "Handed WhatsApp conversation back to AI agent",
          },
        });
      }
    }
  }

  const updated = await db.whatsAppConversation.update({
    where: { id },
    data,
  });

  await writeAudit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "WhatsAppConversation",
    resourceId: id,
    before: conversation,
    after: updated,
    req: request,
  });

  await triggerPusherEvent("whatsapp", "whatsapp:conversation_updated", {
    conversationId: id,
    ...updated,
  });

  return NextResponse.json(ok(updated));
}
