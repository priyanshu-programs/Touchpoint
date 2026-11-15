"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowUpFromLine,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { startTransition, useId, useState } from "react";
import { flushSync } from "react-dom";
import { ClickableRow } from "@/components/clickable-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  moveBrainstormAction,
  reorderBrainstormsAction,
  setBrainstormIconAction,
} from "./actions";
import { FolderMenu } from "./folder-menu";

type Board = {
  id: string;
  name: string;
  icon: string | null;
  edited: string;
  folder: Place;
};

type Place = { id: string; name: string } | null;

export type FolderCardData = { id: string; name: string; boards: number };

// Drop targets other than a board: a folder card, and the strip that takes a
// board out of the folder being looked in.
const FOLDER = "folder:";
const OUT = "out-of-folder";
const isTarget = (id: unknown) => String(id).startsWith(FOLDER) || id === OUT;

// Over a folder or the strip, the pointer decides; anywhere else the nearest
// board, so the list still reorders as it did.
const detect: CollisionDetection = (args) => {
  const targets = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter(({ id }) => isTarget(id)),
  });
  if (targets.length > 0) return targets;
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(({ id }) => !isTarget(id)),
  });
};

const boardsLabel = (count: number) => `${count} ${count === 1 ? "board" : "boards"}`;

function FolderCard({ folder, dragging }: { folder: FolderCardData; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${FOLDER}${folder.id}` });
  const Icon = isOver ? FolderOpen : Folder;

  return (
    <li
      ref={setNodeRef}
      data-over={isOver || undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-[box-shadow,background-color,border-color]",
        "hover:bg-accent/50",
        dragging && "border-dashed",
        isOver && "border-solid border-primary bg-primary/10 shadow-md ring-2 ring-primary/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
          isOver && "scale-110 transition-transform",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="grid min-w-0 flex-1">
        <Link
          href={`/brainstorm?folder=${folder.id}`}
          className="truncate font-medium after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {folder.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {isOver ? "Drop to move it here" : boardsLabel(folder.boards)}
        </span>
      </div>
      <FolderMenu id={folder.id} name={folder.name} className="relative z-10" />
    </li>
  );
}

// Inside a folder, a strip to drop a board on to take it out. Always shown, so
// the list does not jump when a drag starts.
function OutStrip({ dragging }: { dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: OUT });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors",
        dragging && "border-2 border-primary/50 text-foreground",
        isOver && "border-primary bg-primary/10",
      )}
    >
      <ArrowUpFromLine aria-hidden className="size-4" />
      {isOver
        ? "Drop to take it out of the folder"
        : "Drag a board here to take it out of the folder"}
    </div>
  );
}

function MoveMenu({
  board,
  folders,
  onMove,
}: {
  board: Board;
  folders: { id: string; name: string }[];
  onMove: (to: Place) => void;
}) {
  const others = folders.filter(({ id }) => id !== board.folder?.id);
  if (others.length === 0 && !board.folder) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Move ${board.name} to a folder`}
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <FolderInput aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-72 min-w-44">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {board.folder && (
          <DropdownMenuItem onClick={() => onMove(null)}>
            <ArrowUpFromLine aria-hidden />
            Out of the folder
          </DropdownMenuItem>
        )}
        {board.folder && others.length > 0 && <DropdownMenuSeparator />}
        {others.map((folder) => (
          <DropdownMenuItem key={folder.id} onClick={() => onMove(folder)}>
            <Folder aria-hidden />
            <span className="truncate">{folder.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BoardRow({
  board,
  folders,
  showFolder,
  onMove,
  onFile,
}: {
  board: Board;
  folders: { id: string; name: string }[];
  showFolder: boolean;
  onMove: (by: -1 | 1, handle: HTMLButtonElement) => void;
  onFile: (to: Place) => void;
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
        // Rows only ever move up and down; the board itself follows the pointer
        // as a card of its own.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(isDragging && "relative z-10 bg-muted/60 opacity-50")}
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
        {showFolder && board.folder && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Folder aria-hidden className="size-3" />
            {board.folder.name}
          </span>
        )}
      </TableCell>
      <TableCell className="pr-2 text-right">{board.edited}</TableCell>
      <TableCell className="w-10 pl-0">
        <MoveMenu board={board} folders={folders} onMove={onFile} />
      </TableCell>
    </ClickableRow>
  );
}

// The Brainstorming page's folders, then its boards in the order the owner wants
// them. A board is dragged by its handle onto another place in the list, or onto
// a folder to put it inside; in a folder, onto the strip that appears to take it
// out. The arrow keys move a board a place at a time, and the folder button on
// each row moves it without dragging. Each change is saved. The page gives the
// list a new key when what it shows changes.
export function BrainstormList({
  folders,
  boards,
  inFolder,
  moveTargets,
  showFolder,
  emptyBoards,
}: {
  // The folders shown as cards above the boards (none inside a folder).
  folders: FolderCardData[];
  boards: Board[];
  // The folder being looked in, if any.
  inFolder: Place;
  // Every folder, for the row's Move to menu.
  moveTargets: { id: string; name: string }[];
  // A search across folders shows which folder each board is in.
  showFolder: boolean;
  emptyBoards: string;
}) {
  const [order, setOrder] = useState(() => boards.map(({ id }) => id));
  const [placed, setPlaced] = useState<Record<string, Place>>({});
  const [added, setAdded] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const [moved, setMoved] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();
  const rows = order.flatMap((rowId) => {
    const board = boards.find((each) => each.id === rowId);
    if (!board) return [];
    return [rowId in placed ? { ...board, folder: placed[rowId] } : board];
  });
  const dragged = rows.find((board) => board.id === active);

  const persist = (next: string[]) => startTransition(() => reorderBrainstormsAction(next));

  const file = (board: Board, to: Place) => {
    if (board.folder?.id === to?.id) return;
    // A board leaves the list unless a search across folders is showing it.
    if (!showFolder) setOrder((now) => now.filter((each) => each !== board.id));
    setPlaced((now) => ({ ...now, [board.id]: to }));
    setAdded((now) => {
      const next = { ...now };
      if (to) next[to.id] = (next[to.id] ?? 0) + 1;
      if (board.folder) next[board.folder.id] = (next[board.folder.id] ?? 0) - 1;
      return next;
    });
    setMoved(
      to ? `${board.name} moved into ${to.name}.` : `${board.name} moved out of the folder.`,
    );
    startTransition(() => moveBrainstormAction(board.id, to?.id ?? null));
  };

  const onDragStart = ({ active }: DragStartEvent) => setActive(String(active.id));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActive(null);
    if (!over || active.id === over.id) return;
    const board = rows.find((each) => each.id === active.id);
    if (!board) return;
    const target = String(over.id);
    if (target === OUT) return file(board, null);
    if (target.startsWith(FOLDER)) {
      const folder = folders.find((each) => `${FOLDER}${each.id}` === target);
      return folder ? file(board, { id: folder.id, name: folder.name }) : undefined;
    }
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(target));
    setOrder(next);
    persist(next);
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={detect}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press the up or down arrow to move this board. To put it in a folder, use the folder button at the end of its row.",
        },
      }}
    >
      {folders.length > 0 && (
        <section aria-labelledby={`${id}-folders`} className="grid gap-2">
          <h2 id={`${id}-folders`} className="text-sm font-medium text-muted-foreground">
            Folders
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={{ ...folder, boards: folder.boards + (added[folder.id] ?? 0) }}
                dragging={active !== null}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-boards`} className="grid gap-2">
        {(folders.length > 0 || inFolder) && (
          <h2 id={`${id}-boards`} className="text-sm font-medium text-muted-foreground">
            Boards
          </h2>
        )}
        {inFolder && rows.length > 0 && <OutStrip dragging={active !== null} />}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyBoards}</p>
        ) : (
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
                  <TableHead className="pr-2 text-right">Last edited</TableHead>
                  <TableHead className="w-10 pl-0">
                    <span className="sr-only">Folder</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  {rows.map((board, index) => (
                    <BoardRow
                      key={board.id}
                      board={board}
                      folders={moveTargets}
                      showFolder={showFolder}
                      onFile={(to) => file(board, to)}
                      onMove={(by, handle) => {
                        const to = index + by;
                        if (to < 0 || to >= rows.length) return;
                        const next = arrayMove(order, index, to);
                        // Reordering can take the handle out of the page for a
                        // moment, which drops the focus the next key press needs.
                        flushSync(() => {
                          setOrder(next);
                          setMoved(
                            `${board.name} moved to place ${to + 1} of ${rows.length}.`,
                          );
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
        )}
      </section>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="flex w-max max-w-72 cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-lg">
            <GripVertical aria-hidden className="size-4 text-muted-foreground" />
            <span className="truncate">{dragged.name}</span>
          </div>
        )}
      </DragOverlay>

      <p role="status" className="sr-only">
        {moved}
      </p>
    </DndContext>
  );
}
