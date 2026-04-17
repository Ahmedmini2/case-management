import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const item = await db.case.findFirst({
    where: {
      metadata: {
        path: ["portalToken"],
        equals: token,
      },
    },
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
      comments: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "asc" },
        select: { id: true, description: true, type: true, createdAt: true },
      },
    },
  });

  if (!item) return NextResponse.json(fail("Portal case not found"), { status: 404 });
  return NextResponse.json(ok(item));
}
