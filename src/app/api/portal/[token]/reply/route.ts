import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/prisma";

const replySchema = z.object({
  body: z.string().min(1).max(5000),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = replySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const caseItem = await db.case.findFirst({
    where: {
      metadata: { path: ["portalToken"], equals: token },
    },
    select: { id: true, createdById: true },
  });
  if (!caseItem) return NextResponse.json(fail("Portal case not found"), { status: 404 });

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        caseId: caseItem.id,
        authorId: caseItem.createdById,
        body: parsed.data.body,
        isInternal: false,
      },
      select: { id: true, body: true, createdAt: true },
    });

    await tx.activity.create({
      data: {
        caseId: caseItem.id,
        userId: caseItem.createdById,
        type: ActivityType.COMMENT_ADDED,
        description: "Customer replied from portal",
      },
    });

    return created;
  });

  return NextResponse.json(ok(comment), { status: 201 });
}
