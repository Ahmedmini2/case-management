import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  image: z.string().url().or(z.string().startsWith("/")).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  if (parsed.data.email) {
    const existing = await db.user.findFirst({
      where: { email: parsed.data.email, id: { not: id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(fail("Email already exists"), { status: 409 });
    }
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(typeof parsed.data.name !== "undefined" ? { name: parsed.data.name } : {}),
      ...(typeof parsed.data.email !== "undefined" ? { email: parsed.data.email } : {}),
      ...(typeof parsed.data.image !== "undefined" ? { image: parsed.data.image } : {}),
    },
    select: { id: true, name: true, email: true, image: true, role: true, updatedAt: true },
  });

  return NextResponse.json(ok(updated));
}
