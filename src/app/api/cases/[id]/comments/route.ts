import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { runAutomationEngine } from "@/lib/automations/engine";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { enqueueEmailJob } from "@/lib/queue/jobs";
import { db } from "@/lib/prisma";

const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const comments = await db.comment.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      body: true,
      isInternal: true,
      isResolution: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(ok(comments, { total: comments.length }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const caseExists = await db.case.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!caseExists) {
    return NextResponse.json(fail("Case not found"), { status: 404 });
  }

  const json = await request.json();
  const parsed = createCommentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        caseId: id,
        authorId: session.user.id,
        body: parsed.data.body,
        isInternal: parsed.data.isInternal,
      },
      select: {
        id: true,
        body: true,
        isInternal: true,
        createdAt: true,
      },
    });

    await tx.activity.create({
      data: {
        caseId: id,
        userId: session.user.id,
        type: ActivityType.COMMENT_ADDED,
        description: parsed.data.isInternal ? "Internal note added" : "Comment added",
      },
    });

    return created;
  });

  await writeAudit({
    userId: session.user.id,
    caseId: id,
    action: "COMMENT_ADDED",
    resource: "comment",
    resourceId: comment.id,
    after: comment,
    req: request,
  });

  if (!parsed.data.isInternal && session.user.email) {
    const caseInfo = await db.case.findUnique({
      where: { id },
      select: { caseNumber: true, title: true, status: true, priority: true },
    });

    if (caseInfo) {
      const emailRecord = await db.email.create({
        data: {
          caseId: id,
          subject: `New comment on ${caseInfo.caseNumber}`,
          body: parsed.data.body,
          bodyText: parsed.data.body,
          direction: "OUTBOUND",
          from: process.env.EMAIL_FROM ?? "support@example.com",
          to: [session.user.email],
          cc: [],
          bcc: [],
          status: "PENDING",
        },
        select: { id: true },
      });

      await enqueueEmailJob({
        emailId: emailRecord.id,
        to: [session.user.email],
        subject: `New comment on ${caseInfo.caseNumber}`,
        caseNumber: caseInfo.caseNumber,
        caseTitle: caseInfo.title,
        status: caseInfo.status,
        priority: caseInfo.priority,
        assignee: null,
        updateMessage: parsed.data.body,
        caseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases/${id}`,
      });
    }
  }

  await runAutomationEngine({
    triggerType: "COMMENT_ADDED",
    caseId: id,
    actorUserId: session.user.id,
    payload: { isInternal: parsed.data.isInternal },
  });

  return NextResponse.json(ok(comment), { status: 201 });
}
