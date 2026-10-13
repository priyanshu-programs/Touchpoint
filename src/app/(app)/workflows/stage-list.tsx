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
import { startTransition, useId, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { ROW_CONTROL } from "../people/(lists)/field-list";

// `detail` says what the stage holds and where it leads.
export type StageListItem = { id: string; name: string; detail: string };

function StageRow({
  stage,
  menu,
  onOpen,
  onMove,
}: {
  stage: StageListItem;
  menu: ReactNode;
  onOpen: () => void;
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
  } = useSortable({ id: stage.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        // Rows only ever move up and down.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(
        "group/row flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
        isDragging && "relative z-10 bg-background shadow-md",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">
        <button
          type="button"
          onClick={onOpen}
          className="justify-self-start text-left font-medium break-words underline-offset-4 hover:underline"
        >
          {stage.name}
        </button>
        <p className="text-xs break-words text-muted-foreground">
          {stage.detail}
        </p>
      </div>
      {menu}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${stage.name}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1, event.currentTarget);
        }}
        className={cn(
          ROW_CONTROL,
          "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
    </li>
  );
}

// The stages of a workflow in the order a client goes through them: dragged into
// order by the handle, or moved from it with the arrow keys. Each move is saved.
export function StageList<Item extends StageListItem>({
  stages,
  action,
  onOpen,
  menu,
}: {
  stages: Item[];
  action: (stageIds: string[]) => Promise<void>;
  onOpen: (stage: Item) => void;
  menu: (stage: Item) => ReactNode;
}) {
  // Only the order is kept here. What a row says comes from the server each time,
  // since where a stage leads changes with its place.
  const [order, setOrder] = useState(() => stages.map((stage) => stage.id));
  const [moved, setMoved] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();
  const items = order.flatMap(
    (stageId) => stages.find((stage) => stage.id === stageId) ?? [],
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
          draggable: "Press the up or down arrow to move this stage.",
        },
      }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol className="grid">
          {items.map((stage, index) => (
            <StageRow
              key={stage.id}
              stage={stage}
              menu={menu(stage)}
              onOpen={() => onOpen(stage)}
              onMove={(by, handle) => {
                const to = index + by;
                if (to < 0 || to >= order.length) return;
                const next = arrayMove(order, index, to);
                // Reordering can take the handle out of the page for a moment,
                // which drops the focus the next key press needs.
                flushSync(() => {
                  setOrder(next);
                  setMoved(
                    `${stage.name} moved to place ${to + 1} of ${next.length}.`,
                  );
                });
                handle.focus();
                persist(next);
              }}
            />
          ))}
        </ol>
      </SortableContext>
      <p role="status" className="sr-only">
        {moved}
      </p>
    </DndContext>
  );
}
