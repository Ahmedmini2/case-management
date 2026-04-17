import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const pipeline = await db.pipeline.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      stages: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          position: true,
          isTerminal: true,
          cases: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              caseNumber: true,
              title: true,
              priority: true,
              dueDate: true,
              assignedTo: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });

  if (!pipeline) {
    return NextResponse.json(fail("Pipeline not found"), { status: 404 });
  }

  return NextResponse.json(ok(pipeline));
}
