import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const updated = await db.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { isRead: true },
  });
  if (!updated.count) return NextResponse.json(fail("Notification not found"), { status: 404 });
  return NextResponse.json(ok({ id, isRead: true }));
}
