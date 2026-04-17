import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

// Get broadcast details with recipients
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const broadcast = await db.broadcast.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          phone: true,
          contactName: true,
          status: true,
          error: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
        },
      },
    },
  });

  if (!broadcast) return NextResponse.json(fail("Broadcast not found"), { status: 404 });
  return NextResponse.json(ok(broadcast));
}

// Delete a broadcast (only if DRAFT or COMPLETED)
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const broadcast = await db.broadcast.findUnique({ where: { id }, select: { status: true } });
  if (!broadcast) return NextResponse.json(fail("Broadcast not found"), { status: 404 });
  if (broadcast.status === "SENDING") return NextResponse.json(fail("Cannot delete a broadcast that is currently sending"), { status: 400 });

  await db.broadcast.delete({ where: { id } });
  return NextResponse.json(ok({ id }));
}
