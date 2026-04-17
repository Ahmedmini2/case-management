import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/prisma";

const updatePipelineSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
  stages: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(100),
        color: z.string().default("#6366f1"),
        isTerminal: z.boolean().optional(),
      }),
    )
    .optional(),
});

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
      description: true,
      isDefault: true,
      stages: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, color: true, position: true, isTerminal: true },
      },
    },
  });

  if (!pipeline) {
    return NextResponse.json(fail("Pipeline not found"), { status: 404 });
  }

  return NextResponse.json(ok(pipeline));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const existing = await db.pipeline.findUnique({
    where: { id },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) {
    return NextResponse.json(fail("Pipeline not found"), { status: 404 });
  }

  const body = await request.json();
  const parsed = updatePipelineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  const updated = await db.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.pipeline.updateMany({ data: { isDefault: false } });
    }

    if (parsed.data.stages) {
      await tx.pipelineStage.deleteMany({ where: { pipelineId: id } });
      await tx.pipelineStage.createMany({
        data: parsed.data.stages.map((stage, idx) => ({
          pipelineId: id,
          name: stage.name,
          color: stage.color,
          isTerminal: Boolean(stage.isTerminal),
          position: idx,
        })),
      });
    }

    return tx.pipeline.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(typeof parsed.data.description !== "undefined"
          ? { description: parsed.data.description }
          : {}),
        ...(typeof parsed.data.isDefault !== "undefined"
          ? { isDefault: parsed.data.isDefault }
          : {}),
      },
      select: { id: true, name: true, description: true, isDefault: true },
    });
  });

  await writeAudit({
    userId: session.user.id,
    action: "PIPELINE_UPDATED",
    resource: "pipeline",
    resourceId: id,
    before: existing,
    after: updated,
    req: request,
  });

  return NextResponse.json(ok(updated));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const existing = await db.pipeline.findUnique({
    where: { id },
    select: { id: true, isDefault: true },
  });
  if (!existing) {
    return NextResponse.json(fail("Pipeline not found"), { status: 404 });
  }

  await db.pipeline.delete({ where: { id } });

  await writeAudit({
    userId: session.user.id,
    action: "PIPELINE_DELETED",
    resource: "pipeline",
    resourceId: id,
    before: existing,
    req: request,
  });

  return NextResponse.json(ok({ id }));
}
