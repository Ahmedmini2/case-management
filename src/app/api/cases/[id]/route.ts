import { ActivityType, CaseStatus, Priority } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { runAutomationEngine } from "@/lib/automations/engine";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { enqueueEmailJob } from "@/lib/queue/jobs";
import { triggerPusherEvent } from "@/lib/pusher";
import { db } from "@/lib/prisma";

const updateCaseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.nativeEnum(CaseStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assignedToId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  pipelineStageId: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const item = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      dueDate: true,
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          isInternal: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          description: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json(fail("Case not found"), { status: 404 });
  }

  return NextResponse.json(ok(item));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const existing = await db.case.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(fail("Case not found"), { status: 404 });
  }

  const json = await request.json();
  const parsed = updateCaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  const updated = await db.$transaction(async (tx) => {
    const nextStage =
      typeof parsed.data.pipelineStageId !== "undefined" && parsed.data.pipelineStageId
        ? await tx.pipelineStage.findUnique({
            where: { id: parsed.data.pipelineStageId },
            select: { name: true },
          })
        : null;
    const nextCase = await tx.case.update({
      where: { id },
      data: {
        ...parsed.data,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : parsed.data.dueDate,
      },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
      },
    });

    if (parsed.data.status && parsed.data.status !== existing.status) {
      await tx.activity.create({
        data: {
          caseId: id,
          userId: session.user.id,
          type: ActivityType.STATUS_CHANGED,
          description: "Status updated",
          oldValue: existing.status,
          newValue: parsed.data.status,
        },
      });
    }

    if (parsed.data.priority && parsed.data.priority !== existing.priority) {
      await tx.activity.create({
        data: {
          caseId: id,
          userId: session.user.id,
          type: ActivityType.PRIORITY_CHANGED,
          description: "Priority updated",
          oldValue: existing.priority,
          newValue: parsed.data.priority,
        },
      });
    }

    if (
      typeof parsed.data.pipelineStageId !== "undefined" &&
      parsed.data.pipelineStageId !== existing.pipelineStageId
    ) {
      await tx.activity.create({
        data: {
          caseId: id,
          userId: session.user.id,
          type: ActivityType.STAGE_CHANGED,
          description: "Pipeline stage updated",
          oldValue: existing.pipelineStageId ?? "",
          newValue: parsed.data.pipelineStageId ?? "",
        },
      });
    }

    if (
      typeof parsed.data.pipelineStageId !== "undefined" &&
      parsed.data.pipelineStageId !== existing.pipelineStageId
    ) {
      const oldStageTagName = existing.pipelineStageId ? `stage:${existing.pipelineStageId}` : null;
      const newStageTagName = parsed.data.pipelineStageId ? `stage:${parsed.data.pipelineStageId}` : null;

      if (oldStageTagName) {
        const oldTag = await tx.tag.findUnique({
          where: { name: oldStageTagName },
          select: { id: true },
        });
        if (oldTag) {
          await tx.caseTag.deleteMany({
            where: { caseId: id, tagId: oldTag.id },
          });
        }
      }

      if (newStageTagName) {
        const tag = await tx.tag.upsert({
          where: { name: newStageTagName },
          update: { color: "#0ea5e9" },
          create: {
            name: newStageTagName,
            color: "#0ea5e9",
          },
          select: { id: true },
        });
        await tx.caseTag.upsert({
          where: { caseId_tagId: { caseId: id, tagId: tag.id } },
          update: {},
          create: { caseId: id, tagId: tag.id },
        });
      }

      if (nextStage?.name) {
        await tx.activity.create({
          data: {
            caseId: id,
            userId: session.user.id,
            type: ActivityType.TAG_ADDED,
            description: `Stage tag updated to ${nextStage.name}`,
            newValue: nextStage.name,
          },
        });
      }
    }

    return nextCase;
  });

  await writeAudit({
    userId: session.user.id,
    caseId: id,
    action: "CASE_UPDATED",
    resource: "case",
    resourceId: id,
    before: existing,
    after: updated,
    req: request,
  });

  await triggerPusherEvent("cases", "case:updated", {
    id: updated.id,
    caseNumber: updated.caseNumber,
    title: updated.title,
    pipelineStageId: parsed.data.pipelineStageId ?? null,
  });

  const recipient = session.user.email;
  if (recipient && (parsed.data.status || parsed.data.priority)) {
    const emailRecord = await db.email.create({
      data: {
        caseId: id,
        subject: `Case updated: ${updated.caseNumber}`,
        body: "A case was updated.",
        bodyText: "A case was updated.",
        direction: "OUTBOUND",
        from: process.env.EMAIL_FROM ?? "support@example.com",
        to: [recipient],
        cc: [],
        bcc: [],
        status: "PENDING",
      },
      select: { id: true },
    });

    await enqueueEmailJob({
      emailId: emailRecord.id,
      to: [recipient],
      subject: `Case updated: ${updated.caseNumber}`,
      caseNumber: updated.caseNumber,
      caseTitle: updated.title,
      status: updated.status,
      priority: updated.priority,
      assignee: null,
      updateMessage: "Status or priority changed.",
      caseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases/${id}`,
    });
  }

  if (parsed.data.status) {
    await runAutomationEngine({
      triggerType: "CASE_STATUS_CHANGED",
      caseId: id,
      actorUserId: session.user.id,
      payload: { oldStatus: existing.status, newStatus: parsed.data.status },
    });
  }

  if (parsed.data.priority) {
    await runAutomationEngine({
      triggerType: "CASE_PRIORITY_CHANGED",
      caseId: id,
      actorUserId: session.user.id,
      payload: { oldPriority: existing.priority, newPriority: parsed.data.priority },
    });
  }

  if (
    typeof parsed.data.pipelineStageId !== "undefined" &&
    parsed.data.pipelineStageId !== existing.pipelineStageId
  ) {
    await runAutomationEngine({
      triggerType: "STAGE_CHANGED",
      caseId: id,
      actorUserId: session.user.id,
      payload: { oldStageId: existing.pipelineStageId, newStageId: parsed.data.pipelineStageId },
    });
  }

  return NextResponse.json(ok(updated));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const existing = await db.case.findUnique({
    where: { id },
    select: { id: true, caseNumber: true, title: true },
  });
  if (!existing) {
    return NextResponse.json(fail("Case not found"), { status: 404 });
  }

  await db.case.delete({ where: { id } });

  await writeAudit({
    userId: session.user.id,
    caseId: id,
    action: "CASE_DELETED",
    resource: "case",
    resourceId: id,
    before: existing,
    req: request,
  });

  return NextResponse.json(ok({ id }));
}
