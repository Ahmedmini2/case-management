import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

const schema = z.object({
  stageIds: z.array(z.string()).min(1),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json(fail("Invalid request body"), { status: 400 });

  const stages = await db.pipelineStage.findMany({
    where: { pipelineId: id },
    select: { id: true },
  });
  const existingIds = new Set(stages.map((s) => s.id));
  if (parsed.data.stageIds.some((sid) => !existingIds.has(sid))) {
    return NextResponse.json(fail("Stage list does not match pipeline stages"), { status: 400 });
  }

  const providedIds = parsed.data.stageIds;
  const missingIds = stages.map((s) => s.id).filter((sid) => !providedIds.includes(sid));
  const finalOrder = [...providedIds, ...missingIds];

  // Two-phase reorder avoids unique constraint collisions on [pipelineId, position].
  await db.$transaction([
    ...finalOrder.map((stageId, idx) =>
      db.pipelineStage.update({
        where: { id: stageId },
        data: { position: idx + 1000 },
      }),
    ),
    ...finalOrder.map((stageId, idx) =>
      db.pipelineStage.update({
        where: { id: stageId },
        data: { position: idx },
      }),
    ),
  ]);

  return NextResponse.json(ok({ pipelineId: id, reordered: true }));
}
