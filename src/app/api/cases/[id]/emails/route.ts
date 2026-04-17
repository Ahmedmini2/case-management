import { ActivityType, EmailDir, EmailStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { enqueueEmailJob } from "@/lib/queue/jobs";
import { db } from "@/lib/prisma";

const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const emails = await db.email.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      body: true,
      direction: true,
      from: true,
      to: true,
      status: true,
      createdAt: true,
      sentAt: true,
    },
  });

  return NextResponse.json(ok(emails, { total: emails.length }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const json = await request.json();
  const parsed = sendEmailSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  const caseItem = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      status: true,
      priority: true,
      assignedTo: { select: { name: true } },
    },
  });
  if (!caseItem) {
    return NextResponse.json(fail("Case not found"), { status: 404 });
  }

  const email = await db.$transaction(async (tx) => {
    const created = await tx.email.create({
      data: {
        caseId: id,
        subject: parsed.data.subject,
        body: parsed.data.body,
        bodyText: parsed.data.body,
        direction: EmailDir.OUTBOUND,
        from: process.env.EMAIL_FROM ?? "support@example.com",
        to: parsed.data.to,
        cc: [],
        bcc: [],
        status: EmailStatus.PENDING,
      },
      select: { id: true, subject: true, to: true, createdAt: true },
    });

    await tx.activity.create({
      data: {
        caseId: id,
        userId: session.user.id,
        type: ActivityType.EMAIL_SENT,
        description: `Email queued: ${parsed.data.subject}`,
      },
    });

    return created;
  });

  await enqueueEmailJob({
    emailId: email.id,
    to: parsed.data.to,
    subject: parsed.data.subject,
    caseNumber: caseItem.caseNumber,
    caseTitle: caseItem.title,
    status: caseItem.status,
    priority: caseItem.priority,
    assignee: caseItem.assignedTo?.name,
    updateMessage: parsed.data.body,
    caseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases/${id}`,
  });

  return NextResponse.json(ok(email), { status: 201 });
}
