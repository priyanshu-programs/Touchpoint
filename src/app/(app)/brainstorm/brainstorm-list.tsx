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
import { ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ListCard } from "../people/(lists)/list-card";
import { IconPicker } from "../workflows/icon-picker";
import { reorderBrainstormsAction, setBrainstormIconAction } from "./actions";

type Board = {
  id: string;
  name: string;
  icon: string | null;
  edited: string;
};

function BoardRow({
  board,
  onMove,
}: {
  board: Board;
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
  } = useSortable({ id: board.id });
  const href = `/brainstorm/${board.id}`;

  return (
    <ClickableRow
      ref={setNodeRef}
      href={href}
      style={{
        // Rows only ever move up and down.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(isDragging && "relative z-10 bg-card shadow-md")}
    >
      <TableCell className="w-8 pr-0">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${board.name}`}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onMove(event.key === "ArrowUp" ? -1 : 1, event.currentTarget);
          }}
          className="flex cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        <IconPicker
          name={board.name}
          icon={board.icon}
          action={setBrainstormIconAction.bind(null, board.id)}
        />
      </TableCell>
      <TableCell className="whitespace-normal">
        <Link
          href={href}
          className="font-medium break-words underline-offset-4 hover:underline"
        >
          {board.name}
        </Link>
      </TableCell>
      <TableCell className="pr-4 text-right sm:pr-2">{board.edited}</TableCell>
    </ClickableRow>
  );
}

// The boards of one page in the order the owner wants them: dragged by the
// handle, or moved from it a place at a time with the arrow keys. Each move is
// saved. Only the order is held here; the page gives the list a new key when
// the boards shown change.
export function BrainstormList({ boards }: { boards: Board[] }) {
  const [order, setOrder] = useState(() => boards.map(({ id }) => id));
  const [moved, setMoved] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();
  const rows = order.flatMap((rowId) => boards.find((board) => board.id === rowId) ?? []);

  const persist = (next: string[]) => startTransition(() => reorderBrainstormsAction(next));

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
          draggable: "Press the up or down arrow to move this board.",
        },
      }}
    >
      <ListCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                <span className="sr-only">Move</span>
              </TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Icon</span>
              </TableHead>
              <TableHead>Board</TableHead>
              <TableHead className="pr-4 text-right sm:pr-2">Last edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {rows.map((board, index) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  onMove={(by, handle) => {
                    const to = index + by;
                    if (to < 0 || to >= rows.length) return;
                    const next = arrayMove(order, index, to);
                    // Reordering can take the handle out of the page for a
                    // moment, which drops the focus the next key press needs.
                    flushSync(() => {
                      setOrder(next);
                      setMoved(`${board.name} moved to place ${to + 1} of ${rows.length}.`);
                    });
                    handle.focus();
                    persist(next);
                  }}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </ListCard>
      <p role="status" className="sr-only">
        {moved}
      </p>
    </DndContext>
  );
}
