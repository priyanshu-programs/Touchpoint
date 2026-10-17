import { useEffect, useRef, useState, type PointerEvent, type Ref } from "react";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MoveTarget } from "@/modules/workflows/stages";
import type { StageBox } from "./stage-halos";

// The company or the person a board was started on.
export type BoardRecord = {
  kind: "organization" | "contact";
  id: string;
  name: string;
  pictureVersion: string | null;
};

// A chip standing on a stage: the stage, and the middle of its box's top edge.
export type ChipSpot = { id: string; x: number; y: number };

const TRAYS = [
  { target: "not_started", label: "Not started" },
  { target: "done", label: "Done" },
] as const;

type Tray = (typeof TRAYS)[number]["target"];

// A press that goes no further than this is a click, which opens the menu.
const DRAG = 4;

type Drag = {
  pointerId: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  moving: boolean;
  over: MoveTarget | null;
};

function RecordPicture({ record }: { record: BoardRecord }) {
  return record.kind === "organization" ? (
    <CompanyLogo
      id={record.id}
      name={record.name}
      logoVersion={record.pictureVersion}
      className="size-5 rounded text-[0.5625rem]"
    />
  ) : (
    <ContactAvatar
      id={record.id}
      name={record.name}
      photoVersion={record.pictureVersion}
      className="size-5 text-[0.5625rem]"
    />
  );
}

function ChipFace({ record, className }: { record: BoardRecord; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-52 items-center gap-1.5 rounded-full bg-card py-1 pr-3 pl-1 text-sm font-medium text-card-foreground shadow-md ring-1 ring-foreground/15",
        className,
      )}
    >
      <RecordPicture record={record} />
      <span className="truncate">{record.name}</span>
    </span>
  );
}

// The record on its own board: a chip with its picture and name on each stage
// box it is at, or in one of two trays at the foot of the board when it is at
// none, not started or done. The chips stand in a layer over the canvases that
// the whiteboard moves and scales with the drawing through `layer`, each kept
// at its own size (board.css). A chip is dragged onto another box or a tray to
// move the record there, or pressed for a menu of every place it can go.
export function RecordChips({
  layer,
  record,
  spots,
  at,
  stages,
  boxes,
  stageAt,
  onMove,
}: {
  layer: Ref<HTMLDivElement>;
  record: BoardRecord;
  spots: readonly ChipSpot[];
  // The tray the record is in, when it is at no stage.
  at: Tray | null;
  // Every stage in order, by name.
  stages: readonly { elementId: string; name: string }[];
  boxes: readonly StageBox[];
  // The stage whose box is under a point of the window.
  stageAt: (clientX: number, clientY: number) => string | null;
  onMove: (target: MoveTarget) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef<Drag | null>(null);
  const trays = useRef(new Map<Tray, HTMLElement>());
  const nameOf = new Map(stages.map(({ elementId, name }) => [elementId, name]));

  const follow = (next: Drag | null) => {
    dragging.current = next;
    setDrag(next);
  };

  // Escape puts a chip being dragged back where it was.
  const held = drag !== null;
  useEffect(() => {
    if (!held) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dragging.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [held]);

  // The trays lie over the drawing, so they are looked for first.
  const targetAt = (x: number, y: number): MoveTarget | null => {
    for (const [target, tray] of trays.current) {
      const { left, right, top, bottom } = tray.getBoundingClientRect();
      if (x >= left && x <= right && y >= top && y <= bottom) return target;
    }
    const id = stageAt(x, y);
    return id ? { elementId: id } : null;
  };

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    // No mouse events follow, so the menu does not open on the press itself.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    follow({
      pointerId: event.pointerId,
      fromX: event.clientX,
      fromY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moving: false,
      over: null,
    });
  };

  const carry = (event: PointerEvent<HTMLButtonElement>) => {
    const now = dragging.current;
    if (!now || now.pointerId !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    const moving = now.moving || Math.hypot(x - now.fromX, y - now.fromY) > DRAG;
    follow({ ...now, x, y, moving, over: moving ? targetAt(x, y) : null });
  };

  // Whether the press was a click.
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    const now = dragging.current;
    if (!now || now.pointerId !== event.pointerId) return false;
    follow(null);
    if (!now.moving) return true;
    if (now.over) onMove(now.over);
    return false;
  };

  const where = (target: MoveTarget) =>
    target === "done"
      ? `${record.name} is done`
      : target === "not_started"
        ? `${record.name} has not started`
        : `${record.name} is at ${nameOf.get(target.elementId)}`;

  const chip = (target: MoveTarget) => (
    <Chip
      record={record}
      label={where(target)}
      stages={stages}
      faded={drag?.moving ?? false}
      onPress={press}
      onCarry={carry}
      onRelease={release}
      onCancel={() => follow(null)}
      onMove={onMove}
    />
  );

  const over = drag?.over;
  const outlined =
    typeof over === "object" && over
      ? boxes.find(({ id }) => id === over.elementId)
      : undefined;

  return (
    <div className="record-chips">
      <div ref={layer} className="record-chips-layer">
        {outlined && (
          <div
            aria-hidden
            className="record-drop"
            data-shape={outlined.shape}
            style={{
              left: outlined.x,
              top: outlined.y,
              width: outlined.width,
              height: outlined.height,
              transform: `rotate(${outlined.angle}rad)`,
            }}
          />
        )}
        {spots.map((spot) => (
          <div key={spot.id} className="record-chip" style={{ left: spot.x, top: spot.y }}>
            {chip({ elementId: spot.id })}
          </div>
        ))}
      </div>
      <div className="record-trays">
        {TRAYS.map(({ target, label }) => (
          <section
            key={target}
            ref={(tray) => {
              if (tray) trays.current.set(target, tray);
              else trays.current.delete(target);
            }}
            aria-label={label}
            data-over={over === target || undefined}
            className="record-tray"
          >
            <span className="px-1 text-xs font-medium text-muted-foreground">{label}</span>
            {at === target && chip(target)}
          </section>
        ))}
      </div>
      {drag?.moving && (
        <div aria-hidden className="record-ghost" style={{ left: drag.x, top: drag.y }}>
          <ChipFace record={record} className="shadow-lg" />
        </div>
      )}
    </div>
  );
}

function Chip({
  record,
  label,
  stages,
  faded,
  onPress,
  onCarry,
  onRelease,
  onCancel,
  onMove,
}: {
  record: BoardRecord;
  label: string;
  stages: readonly { elementId: string; name: string }[];
  faded: boolean;
  onPress: (event: PointerEvent<HTMLButtonElement>) => void;
  onCarry: (event: PointerEvent<HTMLButtonElement>) => void;
  onRelease: (event: PointerEvent<HTMLButtonElement>) => boolean;
  onCancel: () => void;
  onMove: (target: MoveTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const targets: { key: string; name: string; target: MoveTarget }[] = [
    { key: "not_started", name: "Not started", target: "not_started" },
    ...stages.map(({ elementId, name }) => ({
      key: elementId,
      name,
      target: { elementId },
    })),
    { key: "done", name: "Done", target: "done" },
  ];
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "cursor-grab touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
          faded && "opacity-40",
        )}
        onPointerDown={onPress}
        onPointerMove={onCarry}
        onPointerUp={(event) => {
          if (onRelease(event)) setOpen(true);
        }}
        onPointerCancel={onCancel}
      >
        <ChipFace record={record} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-auto min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move {record.name} to</DropdownMenuLabel>
          {targets.map(({ key, name, target }) => (
            <DropdownMenuItem key={key} onClick={() => onMove(target)}>
              {name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
