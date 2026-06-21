"use client";

import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { useRealtime } from "@/hooks/useRealtime";

type BoardStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  cases: Array<{
    id: string;
    caseNumber: string;
    title: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    dueDate: string | null;
    assignedTo: { id: string; name: string | null } | null;
  }>;
};

type BoardData = {
  id: string;
  name: string;
  stages: BoardStage[];
};

function moveItem(stages: BoardStage[], fromStageId: string, toStageId: string, caseId: string) {
  const next = structuredClone(stages) as BoardStage[];
  const source = next.find((s) => s.id === fromStageId);
  const target = next.find((s) => s.id === toStageId);
  if (!source || !target) return stages;

  const itemIndex = source.cases.findIndex((c) => c.id === caseId);
  if (itemIndex < 0) return stages;

  const [item] = source.cases.splice(itemIndex, 1);
  target.cases.unshift(item);
  return next;
}

export function KanbanBoard({ initial }: { initial: BoardData }) {
  const [search, setSearch] = useState("");
  const [stages, setStages] = useState(initial.stages);

  const filteredStages = useMemo(
    () =>
      stages.map((stage) => ({
        ...stage,
        cases: stage.cases.filter((c) =>
          `${c.caseNumber} ${c.title}`.toLowerCase().includes(search.toLowerCase()),
        ),
      })),
    [search, stages],
  );

  const onCaseUpdated = useCallback(() => {
    // Realtime scaffold hook: for now we notify user and keep optimistic state.
    toast.info("Board updated in another session.");
  }, []);

  useRealtime({
    channelName: "cases",
    eventName: "case:updated",
    onEvent: onCaseUpdated,
  });

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const fromStageId = result.source.droppableId;
    const toStageId = result.destination.droppableId;
    const caseId = result.draggableId;
    if (fromStageId === toStageId) return;

    const previous = stages;
    const optimistic = moveItem(stages, fromStageId, toStageId, caseId);
    setStages(optimistic);

    const response = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStageId: toStageId }),
    });

    if (!response.ok) {
      setStages(previous);
      toast.error("Unable to move card. Changes were rolled back.");
      return;
    }

    toast.success("Case moved.");
  }

  async function moveColumn(stageId: string, direction: "left" | "right") {
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === stageId);
    if (idx < 0) return;
    const swapIdx = direction === "left" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const next = [...sorted];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const optimistic = next.map((stage, i) => ({ ...stage, position: i }));
    const previous = stages;
    setStages(optimistic);

    const response = await fetch(`/api/pipelines/${initial.id}/stages/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageIds: optimistic.map((s) => s.id) }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setStages(previous);
      toast.error(payload?.error ?? "Unable to reorder columns.");
      return;
    }
    toast.success("Column order updated.");
  }

  return (
    <div>
      <KanbanFilters search={search} onSearchChange={setSearch} />
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 [-webkit-overflow-scrolling:touch]">
          {filteredStages
            .sort((a, b) => a.position - b.position)
            .map((stage, idx, arr) => (
              <KanbanColumn
                key={stage.id}
                column={{
                  id: stage.id,
                  name: stage.name,
                  color: stage.color,
                  items: stage.cases,
                }}
                index={idx}
                total={arr.length}
                onMoveLeft={() => void moveColumn(stage.id, "left")}
                onMoveRight={() => void moveColumn(stage.id, "right")}
              />
            ))}
        </div>
      </DragDropContext>
    </div>
  );
}
