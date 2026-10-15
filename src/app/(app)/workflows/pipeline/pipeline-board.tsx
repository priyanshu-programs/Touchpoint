"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { ChevronDown, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useId, useOptimistic, useState } from "react";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { moveToStageAction } from "../actions";
import { WorkflowIconGlyph } from "../workflow-icon";

export type PipelineColumn = { key: string; name: string };

export type PipelineCard = {
  id: string;
  icon: string | null;
  record: {
    kind: "organization" | "contact";
    id: string;
    name: string;
    pictureVersion: string | null;
  };
  blocked: boolean;
  // The columns the copy shows in.
  columns: string[];
  // Stages it is at that the copy drew for itself, by name.
  elsewhere: string[];
  // The stage columns it can be moved to.
  targets: string[];
};

const STAGE = "stage:";

const targetOf = (key: string) =>
  key === "done" || key === "not_started"
    ? key
    : { elementId: key.slice(STAGE.length) };

// A pointer picks the column under it; the keyboard, which has none, the
// column nearest the card.
const collisions: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length > 0 ? under : closestCenter(args);
};

// The left and right arrows carry a card a whole column at a time.
const byColumn: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return;
  const middle = collisionRect.left + collisionRect.width / 2;
  const rects = droppableContainers
    .getEnabled()
    .flatMap(({ id }) => droppableRects.get(id) ?? [])
    .sort((a, b) => a.left - b.left);
  const next =
    event.code === "ArrowRight"
      ? rects.find((rect) => rect.left > middle)
      : rects.findLast((rect) => rect.left + rect.width < middle);
  if (!next) return;
  return {
    x: next.left + (next.width - collisionRect.width) / 2,
    y: next.top + 40,
  };
};

const cardOf = (active: Active) =>
  (active.data.current as { card: PipelineCard }).card;

export function WorkflowPicker({
  chosen,
  workflows,
}: {
  chosen: string;
  workflows: { id: string; name: string; icon: string | null; href: string }[];
}) {
  const router = useRouter();
  const current = workflows.find(({ id }) => id === chosen)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        aria-label={`Workflow: ${current.name}`}
      >
        <WorkflowIconGlyph icon={current.icon} className="size-4" />
        <span className="max-w-60 truncate">{current.name}</span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show the pipeline of</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={chosen}
            onValueChange={(next: string) => {
              const workflow = workflows.find(({ id }) => id === next);
              if (workflow) router.push(workflow.href);
            }}
          >
            {workflows.map((workflow) => (
              <DropdownMenuRadioItem key={workflow.id} value={workflow.id} closeOnClick>
                <WorkflowIconGlyph icon={workflow.icon} className="size-4" />
                {workflow.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The copies of one workflow, a column for each of its stages between Not
// started and Done. A card is dragged by its handle, carried with the arrow
// keys, or sent from its "Move to" menu; it moves at once and goes back, with
// a sentence, if the server turns the move down.
export function PipelineBoard({
  columns,
  cards,
}: {
  columns: PipelineColumn[];
  cards: PipelineCard[];
}) {
  const [shown, place] = useOptimistic(
    cards,
    (current, { id, to }: { id: string; to: string }) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              columns: [to],
              elsewhere: [],
              blocked: to.startsWith(STAGE) && card.blocked,
            }
          : card,
      ),
  );
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState<PipelineCard | null>(null);
  const sensors = useSensors(
    // A few pixels first, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: byColumn }),
  );
  // Without a fixed id the library numbers its hidden instructions differently
  // on the server and in the browser.
  const id = useId();
  const nameOf = new Map(columns.map(({ key, name }) => [key, name]));
  const elsewhere = shown.filter((card) => card.elsewhere.length > 0);

  function moveTo(card: PipelineCard, to: string) {
    if (card.columns.length === 1 && card.columns[0] === to && card.elsewhere.length === 0) {
      return;
    }
    if (to.startsWith(STAGE) && !card.targets.includes(to)) {
      setMessage(
        `${card.record.name}'s copy of this workflow has no stage called ${nameOf.get(to)} any more.`,
      );
      return;
    }
    setMessage("");
    startTransition(async () => {
      place({ id: card.id, to });
      const result = await moveToStageAction(card.id, targetOf(to));
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={({ active }) => setDragging(cardOf(active))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={({ active, over }) => {
        setDragging(null);
        if (over) moveTo(cardOf(active), String(over.id));
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Space to pick this card up, the left or right arrow to carry it to another column, then Space to put it down there, or Escape to leave it where it was.",
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${cardOf(active).record.name}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${cardOf(active).record.name} is over ${nameOf.get(String(over.id))}.`
              : `${cardOf(active).record.name} is over no column.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `${cardOf(active).record.name} put down in ${nameOf.get(String(over.id))}.`
              : `${cardOf(active).record.name} left where it was.`,
          onDragCancel: ({ active }) =>
            `${cardOf(active).record.name} left where it was.`,
        },
      }}
    >
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="min-w-0 snap-x snap-mandatory overflow-x-auto pb-2 sm:snap-none">
        <div className="flex w-max items-start gap-3">
          {columns.map((column) => (
            <Column
              key={column.key}
              column={column}
              cards={shown.filter((card) => card.columns.includes(column.key))}
              render={(card) => (
                <Card
                  card={card}
                  column={column.key}
                  columns={columns}
                  also={[
                    ...card.columns
                      .filter((key) => key !== column.key)
                      .map((key) => nameOf.get(key)!),
                    ...card.elsewhere,
                  ]}
                  onMove={(to) => moveTo(card, to)}
                />
              )}
            />
          ))}
          {elsewhere.length > 0 && (
            <Column
              column={{ key: "elsewhere", name: "Other stages" }}
              cards={elsewhere}
              disabled
              render={(card) => (
                <Card
                  card={card}
                  column="elsewhere"
                  columns={columns}
                  also={card.columns.map((key) => nameOf.get(key)!)}
                  at={card.elsewhere}
                  onMove={(to) => moveTo(card, to)}
                />
              )}
            />
          )}
        </div>
      </div>
      <DragOverlay>
        {dragging && <CardFace card={dragging} className="shadow-lg" />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  cards,
  disabled = false,
  render,
}: {
  column: PipelineColumn;
  cards: PipelineCard[];
  disabled?: boolean;
  render: (card: PipelineCard) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled });
  const headingId = useId();
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "grid w-[85vw] shrink-0 snap-start content-start gap-2 rounded-lg border bg-muted/40 p-2 sm:w-64",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <h2 className="flex items-center justify-between gap-2 px-1 py-0.5 text-sm font-medium">
        <span id={headingId} className="break-words">
          {column.name}
        </span>
        <span className="text-muted-foreground">{cards.length}</span>
      </h2>
      <ul className="grid min-h-16 gap-2">
        {cards.map((card) => (
          <li key={card.id}>{render(card)}</li>
        ))}
      </ul>
    </section>
  );
}

function RecordPicture({ record }: { record: PipelineCard["record"] }) {
  return record.kind === "organization" ? (
    <CompanyLogo
      id={record.id}
      name={record.name}
      logoVersion={record.pictureVersion}
      className="size-6 text-[0.625rem]"
    />
  ) : (
    <ContactAvatar
      id={record.id}
      name={record.name}
      photoVersion={record.pictureVersion}
      className="size-6 text-[0.625rem]"
    />
  );
}

// What a card shows of its record, also drawn under the pointer while dragged.
function CardFace({
  card,
  handle,
  className,
}: {
  card: PipelineCard;
  handle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md bg-card", className)}>
      {handle}
      <RecordPicture record={card.record} />
      <Link
        href={`/workflows/${card.id}`}
        className="min-w-0 flex-1 break-words py-0.5 font-medium underline-offset-4 hover:underline"
      >
        {card.record.name}
      </Link>
      {card.icon && (
        <WorkflowIconGlyph
          icon={card.icon}
          className="mt-1 size-4 shrink-0 text-muted-foreground"
        />
      )}
    </div>
  );
}

function Card({
  card,
  column,
  columns,
  also,
  at = [],
  onMove,
}: {
  card: PipelineCard;
  column: string;
  columns: PipelineColumn[];
  also: string[];
  at?: string[];
  onMove: (to: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      // A copy at two stages is two cards, one in each column.
      id: `${card.id} ${column}`,
      data: { card },
      disabled: column === "elsewhere",
    });
  const name = card.record.name;

  return (
    <article
      ref={setNodeRef}
      aria-label={name}
      className={cn(
        "grid gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs",
        isDragging && "opacity-40",
      )}
    >
      <CardFace
        card={card}
        handle={
          column !== "elsewhere" && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Drag ${name}`}
              className="-ml-1 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          )
        }
      />
      {at.length > 0 && (
        <p className="text-xs text-muted-foreground">At: {at.join(", ")}</p>
      )}
      {card.blocked && (
        <p className="text-xs font-medium text-destructive">Blocked</p>
      )}
      {also.length > 0 && (
        <p className="text-xs text-muted-foreground">Also at: {also.join(", ")}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={
            card.record.kind === "organization"
              ? companyHref(card.record.id, "workflows")
              : contactHref(card.record.id, "workflows")
          }
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {card.record.kind === "organization" ? "Open company" : "Open person"}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" />}
            aria-label={`Move ${name} to`}
          >
            Move to…
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move {name} to</DropdownMenuLabel>
              {columns
                .filter(({ key }) => !key.startsWith(STAGE) || card.targets.includes(key))
                .map(({ key, name: columnName }) => (
                  <DropdownMenuItem
                    key={key}
                    disabled={key === column && card.columns.length === 1}
                    onClick={() => onMove(key)}
                  >
                    {columnName}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
