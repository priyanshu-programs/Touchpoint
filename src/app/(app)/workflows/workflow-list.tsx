"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { startTransition, useId, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

type Workflow = { id: string; name: string; description: string | null };

function WorkflowRow({
  workflow,
  onMove,
}: {
  workflow: Workflow;
  onMove: (by: -1 | 1, handle: HTMLButtonElement) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workflow.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        // Rows only ever move up and down.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(
        "flex items-start gap-2 border-b bg-card px-3 py-3 text-sm last:border-b-0",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${workflow.name}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1, event.currentTarget);
        }}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="grid min-w-0 flex-1 gap-0.5 py-0.5">
        <Link
          href={`/workflows/${workflow.id}`}
          className="justify-self-start font-medium underline-offset-4 hover:underline"
        >
          {workflow.name}
        </Link>
        {workflow.description && (
          <p className="break-words text-muted-foreground">
            {workflow.description}
          </p>
        )}
      </div>
    </li>
  );
}

// The owner's workflows in the order they want them: dragged by the handle, or
// moved from it a place at a time with the arrow keys. Each move is saved. Only
// the order is held here and what a row says comes from the server; the page
// gives the list a new key when a workflow is added or removed.
export function WorkflowList({
  workflows,
  action,
}: {
  workflows: Workflow[];
  action: (ids: string[]) => Promise<void>;
}) {
  const [order, setOrder] = useState(() => workflows.map(({ id }) => id));
  const [moved, setMoved] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();
  const rows = order.flatMap(
    (rowId) => workflows.find((workflow) => workflow.id === rowId) ?? [],
  );

  const persist = (next: string[]) => startTransition(() => action(next));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      order,
      order.indexOf(String(active.id)),
      order.indexOf(String(over.id)),
    );
    setOrder(next);
    persist(next);
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Press the up or down arrow to move this workflow.",
        },
      }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul aria-label="Your workflows">
          {rows.map((workflow, index) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              onMove={(by, handle) => {
                const to = index + by;
                if (to < 0 || to >= rows.length) return;
                const next = arrayMove(order, index, to);
                // Reordering can take the handle out of the page for a moment,
                // which drops the focus the next key press needs.
                flushSync(() => {
                  setOrder(next);
                  setMoved(
                    `${workflow.name} moved to place ${to + 1} of ${rows.length}.`,
                  );
                });
                handle.focus();
                persist(next);
              }}
            />
          ))}
        </ul>
      </SortableContext>
      <p role="status" className="sr-only">
        {moved}
      </p>
    </DndContext>
  );
}
