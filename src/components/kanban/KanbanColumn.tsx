import { Draggable, Droppable } from "@hello-pangea/dnd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KanbanCard } from "@/components/kanban/KanbanCard";

type Column = {
  id: string;
  name: string;
  color: string;
  items: Array<{
    id: string;
    caseNumber: string;
    title: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    dueDate: string | null;
    assignedTo: { id: string; name: string | null } | null;
  }>;
};

export function KanbanColumn({
  column,
  index,
  total,
  onMoveLeft,
  onMoveRight,
}: {
  column: Column;
  index: number;
  total: number;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  return (
    <div className="w-[80vw] max-w-[20rem] shrink-0 sm:w-80">
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between rounded-xl border bg-card px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: column.color }}
          />
          <span className="truncate text-sm font-semibold">{column.name}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
            {column.items.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={onMoveLeft}
            disabled={index === 0}
            aria-label="Move column left"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={onMoveRight}
            disabled={index === total - 1}
            aria-label="Move column right"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-24 space-y-2.5 rounded-xl p-1.5 transition-colors ${
              snapshot.isDraggingOver ? "bg-primary/5" : "bg-transparent"
            }`}
          >
            {column.items.map((item, itemIndex) => (
              <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={dragSnapshot.isDragging ? "rotate-1 opacity-90" : ""}
                  >
                    <KanbanCard item={item} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
