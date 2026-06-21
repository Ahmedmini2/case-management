import Link from "next/link";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Map as MapIcon } from "lucide-react";
import type { Priority } from "@/types/enums";

type StageWithCases = {
  id: string;
  name: string;
  color: string;
  position: number;
  cases: {
    id: string;
    caseNumber: string;
    title: string;
    priority: Priority;
    dueDate: string | null;
    assignedTo: { id: string; name: string | null } | null;
  }[];
};

type PipelineWithStages = {
  id: string;
  name: string;
  stages: StageWithCases[];
};

async function loadPipelineWithStagesAndCases(pipelineId: string): Promise<PipelineWithStages | null> {
  const sb = supabaseAdmin();
  const { data: pRow } = await sb
    .from("pipelines")
    .select("id, name")
    .eq("id", pipelineId)
    .maybeSingle();
  if (!pRow) return null;

  const { data: stagesRaw } = await sb
    .from("pipeline_stages")
    .select("id, name, color, position")
    .eq("pipelineId", pipelineId)
    .order("position", { ascending: true });

  const stages = (stagesRaw ?? []) as {
    id: string;
    name: string;
    color: string;
    position: number;
  }[];

  const stageIds = stages.map((s) => s.id);
  const casesByStage = new Map<string, StageWithCases["cases"]>();
  if (stageIds.length > 0) {
    const { data: caseRowsRaw } = await sb
      .from("cases")
      .select("id, caseNumber, title, priority, dueDate, assignedToId, pipelineStageId, updatedAt")
      .in("pipelineStageId", stageIds)
      .order("updatedAt", { ascending: false })
      .limit(100 * stageIds.length);

    const caseRows = (caseRowsRaw ?? []) as {
      id: string;
      caseNumber: string;
      title: string;
      priority: string;
      dueDate: string | null;
      assignedToId: string | null;
      pipelineStageId: string | null;
      updatedAt: string;
    }[];

    const assigneeIds = [
      ...new Set(caseRows.map((c) => c.assignedToId).filter(Boolean) as string[]),
    ];
    const assigneeMap = new Map<string, { id: string; name: string | null }>();
    if (assigneeIds.length > 0) {
      const { data: users } = await sb
        .from("users")
        .select("id, name")
        .in("id", assigneeIds);
      for (const u of (users ?? []) as { id: string; name: string | null }[]) {
        assigneeMap.set(u.id, u);
      }
    }

    for (const c of caseRows) {
      if (!c.pipelineStageId) continue;
      const list = casesByStage.get(c.pipelineStageId) ?? [];
      if (list.length >= 100) continue;
      list.push({
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        priority: c.priority as Priority,
        dueDate: c.dueDate,
        assignedTo: c.assignedToId ? assigneeMap.get(c.assignedToId) ?? null : null,
      });
      casesByStage.set(c.pipelineStageId, list);
    }
  }

  const p = pRow as { id: string; name: string };
  return {
    id: p.id,
    name: p.name,
    stages: stages.map((s) => ({
      ...s,
      cases: casesByStage.get(s.id) ?? [],
    })),
  };
}

async function getOrCreateDefaultPipeline(): Promise<PipelineWithStages | null> {
  const sb = supabaseAdmin();

  const { data: defaultRow } = await sb
    .from("pipelines")
    .select("id")
    .eq("isDefault", true)
    .maybeSingle();

  if (defaultRow) {
    return loadPipelineWithStagesAndCases((defaultRow as { id: string }).id);
  }

  // No default pipeline — find any pipeline with cases first
  let targetId: string | null = null;
  const { data: caseRows } = await sb
    .from("cases")
    .select("pipelineId")
    .not("pipelineId", "is", null)
    .limit(1);
  const caseRow = (caseRows ?? [])[0] as { pipelineId: string | null } | undefined;
  if (caseRow?.pipelineId) {
    targetId = caseRow.pipelineId;
  } else {
    const { data: anyPipe } = await sb
      .from("pipelines")
      .select("id")
      .order("createdAt", { ascending: true })
      .limit(1)
      .maybeSingle();
    targetId = anyPipe ? (anyPipe as { id: string }).id : null;
  }

  if (targetId) {
    await sb
      .from("pipelines")
      .update({ isDefault: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await sb.from("pipelines").update({ isDefault: true }).eq("id", targetId);
  } else {
    // Create a default pipeline + stages
    const { data: newPipe } = await sb
      .from("pipelines")
      .insert({ name: "Default Pipeline", isDefault: true })
      .select("id")
      .single();
    if (newPipe) {
      const newId = (newPipe as { id: string }).id;
      await sb.from("pipeline_stages").insert([
        { pipelineId: newId, name: "Backlog", color: "#6366f1", position: 0 },
        { pipelineId: newId, name: "In Progress", color: "#0ea5e9", position: 1 },
        { pipelineId: newId, name: "Done", color: "#22c55e", position: 2, isTerminal: true },
      ]);
      targetId = newId;
    }
  }

  if (!targetId) return null;
  return loadPipelineWithStagesAndCases(targetId);
}

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const pipeline = await getOrCreateDefaultPipeline();

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">No pipeline found.</p>
        <Link href="/pipeline/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
          Create Pipeline
        </Link>
      </div>
    );
  }

  // Backfill cases with no pipeline assignment (fire-and-forget, non-blocking)
  const firstStageId = pipeline.stages[0]?.id;
  if (firstStageId) {
    const sb = supabaseAdmin();
    void (async () => {
      try {
        // Cases missing pipelineId
        await sb
          .from("cases")
          .update({ pipelineId: pipeline.id, pipelineStageId: firstStageId })
          .is("pipelineId", null);
        await sb
          .from("cases")
          .update({ pipelineId: pipeline.id, pipelineStageId: firstStageId })
          .is("pipelineStageId", null);
      } catch {
        /* non-critical */
      }
    })();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <MapIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{pipeline.name}</h1>
            <p className="text-xs text-muted-foreground">
              {pipeline.stages.reduce((s, col) => s + col.cases.length, 0)} cases across {pipeline.stages.length} stages
            </p>
          </div>
        </div>
        <Link href={`/pipeline/${pipeline.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors sm:w-auto">
          Manage Pipeline
        </Link>
      </div>
      <KanbanBoard
        initial={{
          id: pipeline.id,
          name: pipeline.name,
          stages: pipeline.stages.map((stage) => ({
            ...stage,
            cases: stage.cases.map((item) => ({
              ...item,
              dueDate: item.dueDate,
            })),
          })),
        }}
      />
    </div>
  );
}
