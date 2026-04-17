import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const watchers = await db.caseWatcher.findMany({
    where: { caseId: id },
    select: {
      userId: true,
      createdAt: true,
    },
  });

  // Fetch user details for each watcher
  const userIds = watchers.map((w) => w.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const result = watchers.map((w) => ({
    ...w,
    user: users.find((u) => u.id === w.userId) ?? null,
  }));

  return NextResponse.json(ok(result, { total: result.length }));
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const caseRecord = await db.case.findUnique({ where: { id }, select: { id: true } });
  if (!caseRecord) return NextResponse.json(fail("Case not found"), { status: 404 });

  await db.caseWatcher.upsert({
    where: { caseId_userId: { caseId: id, userId: session.user.id } },
    update: {},
    create: { caseId: id, userId: session.user.id },
  });

  return NextResponse.json(ok({ watching: true }));
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  await db.caseWatcher.deleteMany({
    where: { caseId: id, userId: session.user.id },
  });

  return NextResponse.json(ok({ watching: false }));
}
