import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const contact = await db.contact.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      avatarUrl: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      cases: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!contact) return NextResponse.json(fail("Contact not found"), { status: 404 });
  return NextResponse.json(ok(contact));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const contact = await db.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return NextResponse.json(fail("Contact not found"), { status: 404 });

  const updated = await db.contact.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, phone: true, company: true, notes: true },
  });

  return NextResponse.json(ok(updated));
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const contact = await db.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return NextResponse.json(fail("Contact not found"), { status: 404 });

  await db.contact.delete({ where: { id } });
  return NextResponse.json(ok({ id }));
}
