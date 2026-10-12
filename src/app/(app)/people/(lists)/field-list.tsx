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
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { startTransition, useId, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import type { LayoutField } from "@/modules/fields/queries";

function FieldRow({
  field,
  onMove,
  onToggle,
}: {
  field: LayoutField;
  onMove: (by: -1 | 1, handle: HTMLButtonElement) => void;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.key });

  return (
    <li
      ref={setNodeRef}
      style={{
        // Rows only ever move up and down.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${field.label}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1, event.currentTarget);
        }}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 break-words",
          field.hidden && "text-muted-foreground",
        )}
      >
        {field.label}
      </span>
      <button
        type="button"
        aria-pressed={!field.hidden}
        aria-label={`Show ${field.label}`}
        onClick={onToggle}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        {field.hidden ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </button>
    </li>
  );
}

// The fields of a company or a person: dragged into order by the handle, or moved
// from it with the arrow keys, and shown or hidden with the eye. Each change is saved.
export function FieldList({
  fields,
  action,
}: {
  fields: LayoutField[];
  action: (fields: { key: string; hidden: boolean }[]) => Promise<void>;
}) {
  const [items, setItems] = useState(fields);
  const [moved, setMoved] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();

  const persist = (next: LayoutField[]) =>
    startTransition(() =>
      action(next.map(({ key, hidden }) => ({ key, hidden }))),
    );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      items,
      items.findIndex(({ key }) => key === active.id),
      items.findIndex(({ key }) => key === over.id),
    );
    setItems(next);
    persist(next);
  };

  return (
    // The panel keeps arrow keys to itself, so the library's own keyboard dragging
    // never hears them; the handle moves its row a place at a time instead.
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Press the up or down arrow to move this field.",
        },
      }}
    >
      <SortableContext
        items={items.map(({ key }) => key)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="grid gap-1.5">
          {items.map((field, index) => (
            <FieldRow
              key={field.key}
              field={field}
              onMove={(by, handle) => {
                const to = index + by;
                if (to < 0 || to >= items.length) return;
                const next = arrayMove(items, index, to);
                // Reordering can take the handle out of the page for a moment,
                // which drops the focus the next key press needs.
                flushSync(() => {
                  setItems(next);
                  setMoved(
                    `${field.label} moved to place ${to + 1} of ${next.length}.`,
                  );
                });
                handle.focus();
                persist(next);
              }}
              onToggle={() => {
                const next = items.map((item) =>
                  item.key === field.key
                    ? { ...item, hidden: !item.hidden }
                    : item,
                );
                setItems(next);
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
