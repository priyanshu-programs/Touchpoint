"use client";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  getCommonBounds,
  getNonDeletedElements,
  hashElementsVersion,
  MainMenu,
  newElementWith,
  ROUNDNESS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Grid3x3, Grip, Loader2, Rows3, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BoardStage, StageStatus } from "@/db/schema";
import {
  attachmentKind,
  BOX_KINDS,
  ELEMENT_TYPES,
  STAGE_COLORS,
  STAGE_SHAPES,
  type BoxAttachment,
  type BoxKind,
  type BoxNote,
} from "@/modules/workflows/drawing";
import { openBoardAction } from "@/app/(app)/workflows/actions";
import "./board.css";
import { createBoardPictures } from "./board-pictures";
import { createBoardSaver, type SaveState } from "./board-saver";
import { closedShape } from "@/modules/workflows/sketch";
import {
  placeOf,
  stageLinks,
  stagesOf,
  statusesAfterMove,
  type MoveTarget,
  type StageLinks,
} from "@/modules/workflows/stages";
import { BoxAttachments } from "./box-attachments";
import { BoxCard, StrokesCard } from "./box-card";
import { BoxMarks, type BoxMark } from "./box-marks";
import { BoxNotes } from "./box-notes";
import { PAPER_COOKIE, PAPERS, type Paper } from "./paper";
import { RecordChips, type BoardRecord, type ChipSpot } from "./record-chip";
import { StageAsk } from "./stage-ask";
import { StageHalos, type StageBox } from "./stage-halos";

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Could not save. Trying again…",
  conflict: "Changed somewhere else. Reload to go on.",
};

// The dot beside the save label: green at rest, amber while work is pending,
// red when saving stopped or failed.
const SAVE_DOTS: Record<SaveState, string> = {
  saved: "bg-emerald-500",
  unsaved: "bg-amber-500",
  saving: "animate-pulse bg-amber-500",
  error: "bg-destructive",
  conflict: "bg-destructive",
};

const PAPER_ICONS: Record<Paper, typeof Grip> = {
  dots: Grip,
  grid: Grid3x3,
  lines: Rows3,
  plain: Square,
};

// The page is how the owner likes every whiteboard, so it is kept in a cookie
// the board's page reads, and the next whiteboard opens on it at once.
function keepPaper(paper: Paper) {
  document.cookie = `${PAPER_COOKIE}=${paper}; path=/; max-age=31536000; samesite=lax`;
}

const dark = () => window.matchMedia("(prefers-color-scheme: dark)");
const watchTheme = (changed: () => void) => {
  dark().addEventListener("change", changed);
  return () => dark().removeEventListener("change", changed);
};

const oneOf = (types: readonly string[], element: ExcalidrawElement) =>
  types.includes(element.type);

// What is selected, as far as stages go: one box (`status` is nothing when it
// is not a stage), or strokes of the pen, which can be made one.
type Selected =
  | { kind: "box"; id: string; status: StageStatus | null; name?: string }
  | { kind: "strokes"; ids: string[] };

// One box counts with whatever is grouped with it (the handwriting a stage was
// made around); a box selected beside anything else does not.
function selection(
  elements: readonly ExcalidrawElement[],
  { selectedElementIds }: AppState,
): Selected | null {
  const chosen = elements.filter(
    (element) => selectedElementIds[element.id] && !element.isDeleted,
  );
  if (chosen.length === 0) return null;
  if (chosen.every((element) => element.type === "freedraw")) {
    return { kind: "strokes", ids: chosen.map(({ id }) => id) };
  }
  const boxes = chosen.filter((element) => oneOf(STAGE_SHAPES, element));
  if (boxes.length !== 1) return null;
  const [box] = boxes;
  const together = chosen.every(
    (element) =>
      element === box || element.groupIds.some((id) => box.groupIds.includes(id)),
  );
  if (!together) return null;
  const stage = box.customData?.stage as
    | { status: StageStatus; name?: string }
    | undefined;
  return { kind: "box", id: box.id, status: stage?.status ?? null, name: stage?.name };
}

const sameSelected = (before: Selected | null, now: Selected | null) =>
  before?.kind === "box" && now?.kind === "box"
    ? before.id === now.id && before.status === now.status && before.name === now.name
    : before?.kind === "strokes" && now?.kind === "strokes"
      ? before.ids.join() === now.ids.join()
      : before === now;

// A shape just drawn with the pen that the whiteboard is asking about. `version`
// is the stroke's as it was asked about: a stroke changed since is left alone.
type Ask = {
  id: string;
  version: number;
  shape: "rectangle" | "ellipse";
  x: number;
  y: number;
  below: boolean;
};

// A shape smaller than this on the screen is more likely a letter than a stage.
const MIN_SHAPE = 48;
// The question stands under a shape drawn this near the top, clear of the tools.
const TOOLS = 150;
// The room left around handwriting by the box put behind it.
const ROOM = 16;

// A box or a circle in the hand-drawn style, marked a stage that is not started.
const sketched = (
  shape: Ask["shape"],
  [left, top, right, bottom]: readonly number[],
  like: ExcalidrawElement,
  more: { name?: string; groupIds?: string[] } = {},
) =>
  convertToExcalidrawElements([
    {
      type: shape,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      strokeColor: like.strokeColor,
      strokeWidth: like.strokeWidth,
      roughness: 1,
      roundness: shape === "rectangle" ? { type: ROUNDNESS.ADAPTIVE_RADIUS } : null,
      backgroundColor: STAGE_COLORS.not_started,
      fillStyle: "solid",
      groupIds: more.groupIds ?? [],
      customData: {
        stage: { status: "not_started", ...(more.name && { name: more.name }) },
      },
    },
  ])[0];

// Every stage of the drawing, with where its box is.
function stageBoxes(elements: readonly ExcalidrawElement[]): StageBox[] {
  return elements.flatMap((element) => {
    const stage = element.customData?.stage as { status: StageStatus } | undefined;
    if (!stage || element.isDeleted || !oneOf(STAGE_SHAPES, element)) return [];
    const { id, version, x, y, width, height, angle } = element;
    return {
      id,
      version,
      shape: element.type as StageBox["shape"],
      status: stage.status,
      x,
      y,
      width,
      height,
      angle,
    };
  });
}

const sameBoxes = (before: readonly StageBox[], now: readonly StageBox[]) =>
  before.length === now.length &&
  before.every(
    (box, index) => box.id === now[index].id && box.version === now[index].version,
  );

// Whether a point of the drawing is inside a box, turned as the box is.
function within({ x, y, width, height, angle }: StageBox, pointX: number, pointY: number) {
  const dx = pointX - (x + width / 2);
  const dy = pointY - (y + height / 2);
  const across = dx * Math.cos(angle) + dy * Math.sin(angle);
  const down = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(across) <= width / 2 && Math.abs(down) <= height / 2;
}

// The middle of a box's top edge, which goes round the box's middle when the
// box is turned.
const topOf = ({ x, y, width, height, angle }: StageBox) => ({
  x: x + width / 2 + (height / 2) * Math.sin(angle),
  y: y + height / 2 - (height / 2) * Math.cos(angle),
});

// The stages in order, with their names and statuses, and the arrows between
// them, as the server reads them from a saved drawing.
type Flow = { stages: BoardStage[]; links: StageLinks; key: string };

function flowOf(elements: readonly ExcalidrawElement[]): Flow {
  const drawn = getNonDeletedElements(elements) as unknown as Record<string, unknown>[];
  const stages = stagesOf(drawn);
  const links = stageLinks(drawn, new Set(stages.map(({ elementId }) => elementId)));
  return {
    stages,
    links,
    key: JSON.stringify([stages, [...links].map(([from, to]) => [from, [...to]])]),
  };
}

// A stage's box at that status and in its colour. A name given with the mark
// stays with it.
const restaged = (element: ExcalidrawElement, status: StageStatus) =>
  newElementWith(element, {
    customData: { stage: { ...element.customData?.stage, status } },
    backgroundColor: STAGE_COLORS[status],
    fillStyle: "solid",
  });

// What the boxes carry, kept apart from the drawing.
type Carried = { attachments: BoxAttachment[]; notes: BoxNote[] };

// Every box that carries links, files or notes, with how many of each kind and
// where its top right corner is drawn: the corner goes round the box's middle
// when the box is turned.
function boxMarks(
  elements: readonly ExcalidrawElement[],
  { attachments, notes }: Carried,
): BoxMark[] {
  const counts = new Map<string, Map<BoxKind, number>>();
  const add = (elementId: string, kind: BoxKind) => {
    const kinds = counts.get(elementId) ?? new Map<BoxKind, number>();
    counts.set(elementId, kinds.set(kind, (kinds.get(kind) ?? 0) + 1));
  };
  for (const attachment of attachments) {
    add(attachment.elementId, attachmentKind(attachment));
  }
  for (const { elementId } of notes) add(elementId, "note");
  return elements.flatMap((element) => {
    const kinds = counts.get(element.id);
    if (!kinds || element.isDeleted) return [];
    const { id, version, x, y, width, height, angle } = element;
    return {
      id,
      version,
      kinds: BOX_KINDS.flatMap((kind) => {
        const count = kinds.get(kind);
        return count ? { kind, count } : [];
      }),
      x: x + (width * (1 + Math.cos(angle)) + height * Math.sin(angle)) / 2,
      y: y + (height * (1 - Math.cos(angle)) + width * Math.sin(angle)) / 2,
    };
  });
}

const kindsOf = ({ kinds }: BoxMark) =>
  kinds.map(({ kind, count }) => `${kind}${count}`).join();

const sameMarks = (before: readonly BoxMark[], now: readonly BoxMark[]) =>
  before.length === now.length &&
  before.every(
    (mark, index) =>
      mark.id === now[index].id &&
      mark.version === now[index].version &&
      kindsOf(mark) === kindsOf(now[index]),
  );

type Drawing = Carried & {
  version: number;
  elements: Record<string, unknown>[];
  // The ids of the pictures stored for the drawing, which holds only the ids.
  pictures: string[];
};

// The drawing is fetched as the whiteboard opens, not handed down by the page,
// so that it is always the stored one: a page the browser kept from before
// (Back, say) would show an old drawing and then have its saves refused.
export function BoardEditor({
  boardId,
  name,
  record,
  paper,
}: {
  boardId: string;
  name: string;
  // The company or the person whose own board this is, whose stages have a
  // status; nothing on a workflow that is only drawn.
  record: BoardRecord | null;
  // The page the owner last chose to draw on.
  paper: Paper;
}) {
  const [drawing, setDrawing] = useState<Drawing | "failed" | null>(null);

  useEffect(() => {
    let wanted = true;
    const load = async (): Promise<Drawing | "failed"> => {
      const [response, apart] = await Promise.all([
        fetch(`/api/workflows/${boardId}/scene`),
        openBoardAction(boardId),
      ]);
      return response.ok ? { ...(await response.json()), ...apart } : "failed";
    };
    load()
      .catch(() => "failed" as const)
      .then((loaded) => wanted && setDrawing(loaded));
    return () => {
      wanted = false;
    };
  }, [boardId]);

  if (drawing === null) {
    return (
      <div className="board absolute inset-0">
        <div aria-hidden className="board-paper" data-paper={paper} />
        <div className="relative grid h-full place-items-center p-4">
          <p className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg ring-1 ring-foreground/10">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Opening the whiteboard…
          </p>
        </div>
      </div>
    );
  }
  if (drawing === "failed") {
    return (
      <div className="board absolute inset-0">
        <div aria-hidden className="board-paper" data-paper={paper} />
        <div className="relative grid h-full place-items-center p-4">
          <p
            role="alert"
            className="max-w-sm rounded-xl bg-card p-4 text-sm shadow-lg ring-1 ring-foreground/10"
          >
            The drawing could not be opened. Reload the page to try again.
          </p>
        </div>
      </div>
    );
  }
  return (
    <Whiteboard
      boardId={boardId}
      name={name}
      record={record}
      opensOn={paper}
      {...drawing}
    />
  );
}

function Whiteboard({
  boardId,
  name,
  record,
  opensOn,
  version,
  elements,
  attachments: attached,
  notes: noted,
  pictures: held,
}: Drawing & {
  boardId: string;
  name: string;
  record: BoardRecord | null;
  opensOn: Paper;
}) {
  const tracked = record !== null;
  const [paper, setPaper] = useState(opensOn);
  const [carried, setCarried] = useState<Carried>({
    attachments: attached,
    notes: noted,
  });
  const [marks, setMarks] = useState<BoxMark[]>([]);
  const clips = useRef<HTMLDivElement>(null);
  const isDark = useSyncExternalStore(
    watchTheme,
    () => dark().matches,
    () => false,
  );
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [stages, setStages] = useState<StageBox[]>([]);
  const [flow, setFlow] = useState<Flow>(() => flowOf([]));
  const halos = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement | null>(null);
  // Where the drawing is moved to and how large it is drawn, for a layer that
  // first shows between two changes, as the chips do once there is a stage.
  const view = useRef({ placed: "", zoom: 1 });
  const follow = (layer: HTMLDivElement | null) => {
    if (!layer) return;
    layer.style.transform = view.current.placed;
    layer.style.setProperty("--board-zoom", String(view.current.zoom));
  };
  const page = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const asks = useRef<HTMLDivElement>(null);
  // The stroke the pen is in the middle of, to tell when it is lifted.
  const drawing = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saver] = useState(() =>
    createBoardSaver<NonDeletedExcalidrawElement>({
      boardId,
      version,
      hash: hashElementsVersion,
      report: setSaveState,
    }),
  );

  // Whether a picture put on the whiteboard is still on its way to the server.
  const [sending, setSending] = useState(false);
  const [pictures] = useState(() =>
    createBoardPictures({ boardId, held, report: setSending }),
  );
  useEffect(() => {
    if (!api) return;
    pictures.attach(api);
    return pictures.stop;
  }, [api, pictures]);

  // The whole drawing is brought into view once, when it has been put on the
  // whiteboard, and made smaller if the window is. An empty whiteboard is left
  // alone, or the first box drawn on it would jump to the middle.
  const unfitted = useRef(elements.length > 0);

  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && saver.flush();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      saver.flush();
    };
  }, [saver]);

  // While something drawn is not yet stored, the browser asks before the tab is
  // closed or reloaded: a save made as the page goes can be cut short. Not once
  // saving has stopped for good, when a reload is the way on. A picture still
  // on its way is not stored either, and the drawing that shows it not yet sent.
  const shownState: SaveState =
    sending && saveState === "saved" ? "saving" : saveState;
  const unstored =
    shownState === "unsaved" || shownState === "saving" || shownState === "error";
  useEffect(() => {
    if (!unstored) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unstored]);

  // What the boxes carry after a link, a file or a note was added or taken off,
  // from what they carried just then: an upload may end after a note was added.
  // That redraws nothing on the whiteboard, so the marks are worked out here too.
  const latest = useRef(carried);
  const carry = (change: Partial<Carried>) => {
    latest.current = { ...latest.current, ...change };
    setCarried(latest.current);
    if (api) setMarks(boxMarks(api.getSceneElements(), latest.current));
  };

  // Makes the selected box a stage with that status, or no stage at all.
  const setStage = (status: StageStatus | null) => {
    if (!api || selected?.kind !== "box") return;
    api.updateScene({
      elements: api.getSceneElements().map((element) =>
        element.id !== selected.id
          ? element
          : status
            ? restaged(element, status)
            : // Emptied, not removed: the whiteboard skips an update that sets
              // a field to nothing.
              newElementWith(element, { customData: {} }),
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // Moves the record to a stage, or sets every stage done or not started, by
  // the same rule as the stages' order and arrows give. It is a change to the
  // drawing like any other: one undo takes it back, and it is saved with it.
  // The stages it is moved from are left behind.
  const moveTo = (target: MoveTarget, from: readonly string[]) => {
    if (!api) return;
    const all = api.getSceneElements();
    const { stages: order, links } = flowOf(all);
    const changed = statusesAfterMove(order, links, target, from);
    if (changed.size === 0) return;
    api.updateScene({
      elements: all.map((element) => {
        const status = changed.get(element.id);
        return status ? restaged(element, status) : element;
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // The stage whose box is under a point of the window, the one drawn last
  // where boxes overlap.
  const stageAt = (clientX: number, clientY: number) => {
    if (!api) return null;
    const { x, y } = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
    return stages.findLast((box) => within(box, x, y))?.id ?? null;
  };

  // Where the record's chip stands: on each stage box it is at, or in a tray,
  // which on a board with no stages yet is Not started.
  const place = record ? placeOf(flow.stages, flow.links) : null;
  const spots: ChipSpot[] =
    place && typeof place === "object"
      ? place.stages.flatMap((id) => {
          const box = stages.find((stage) => stage.id === id);
          return box ? { id, ...topOf(box) } : [];
        })
      : [];

  // Swaps the shape asked about for a real box or circle where it was drawn,
  // which arrows attach to and text goes inside. One undo brings the stroke back.
  const tidy = () => {
    if (!api || !ask) return;
    setAsk(null);
    const all = api.getSceneElements();
    const stroke = all.find((element) => element.id === ask.id);
    if (!stroke) return;
    const shape = sketched(ask.shape, getCommonBounds([stroke]), stroke);
    api.updateScene({
      elements: all.flatMap((element) =>
        element === stroke
          ? [newElementWith(stroke, { isDeleted: true }), shape]
          : element,
      ),
      appState: { selectedElementIds: { [shape.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.setActiveTool({ type: "selection" });
  };

  // Makes a stage of the selected strokes: a box behind them, grouped with them
  // so they move as one, under the name typed, since handwriting cannot be read.
  const wrap = (name: string) => {
    if (!api || selected?.kind !== "strokes") return;
    const all = api.getSceneElements();
    const strokes = all.filter((element) => selected.ids.includes(element.id));
    if (strokes.length === 0) return;
    const [left, top, right, bottom] = getCommonBounds(strokes);
    const group = crypto.randomUUID();
    const box = sketched(
      "rectangle",
      [left - ROOM, top - ROOM, right + ROOM, bottom + ROOM],
      strokes[0],
      { name, groupIds: [group] },
    );
    api.updateScene({
      elements: all.flatMap((element) =>
        strokes.includes(element)
          ? [
              ...(element === strokes[0] ? [box] : []),
              newElementWith(element, { groupIds: [...element.groupIds, group] }),
            ]
          : element,
      ),
      appState: {
        selectedElementIds: Object.fromEntries(
          [box, ...strokes].map(({ id }) => [id, true as const]),
        ),
        selectedGroupIds: { [group]: true },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return (
    <div className="board absolute inset-0">
      <div ref={page} aria-hidden className="board-paper" data-paper={paper} />
      <StageHalos layer={halos} stages={stages} tracked={tracked} />
      <BoxMarks layer={clips} marks={marks} />
      <Excalidraw
        excalidrawAPI={setApi}
        name={name}
        theme={isDark ? "dark" : "light"}
        autoFocus
        aiEnabled={false}
        validateEmbeddable={false}
        initialData={{
          elements: elements as unknown as ExcalidrawElement[],
          // Clean lines and a plain font, so it reads as a whiteboard; the
          // hand-drawn look is still there to choose. Transparent so the
          // dotted grid behind the canvases shows through.
          appState: {
            currentItemRoughness: 0,
            currentItemFontFamily: FONT_FAMILY.Nunito,
            currentItemFillStyle: "solid",
            viewBackgroundColor: "transparent",
          },
          scrollToContent: true,
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        onChange={(all, appState, files) => {
          if (unfitted.current && api && all.length > 0) {
            unfitted.current = false;
            // After this redraw, which the whiteboard is still in the middle of.
            requestAnimationFrame(() =>
              api.scrollToContent(undefined, {
                fitToViewport: true,
                // Clear of the window's edges, and never larger than drawn.
                viewportZoomFactor: 0.9,
                maxZoom: 1,
                animate: false,
              }),
            );
          }
          const now = selection(all, appState);
          setSelected((before) => (sameSelected(before, now) ? before : now));
          // The glows go where the drawing goes. Moving and zooming it changes
          // no box, so the layer is moved here and nothing is drawn again. The
          // question about a shape stands at a point of the drawing as well.
          const zoom = appState.zoom.value;
          const placed = `scale(${zoom}) translate(${appState.scrollX}px, ${appState.scrollY}px)`;
          if (halos.current) halos.current.style.transform = placed;
          if (clips.current) {
            clips.current.style.transform = placed;
            clips.current.style.setProperty("--board-zoom", String(zoom));
          }
          view.current = { placed, zoom };
          follow(asks.current);
          follow(chips.current);

          // The pen has been lifted when the stroke it was drawing is no longer
          // the one under way. A stroke that closes into a shape is asked about.
          const pen =
            appState.newElement?.type === "freedraw" ? appState.newElement.id : null;
          if (pen !== drawing.current) {
            const lifted = all.find(
              (element) => element.id === drawing.current && !element.isDeleted,
            );
            drawing.current = pen;
            let next: Ask | null = null;
            if (!pen && lifted?.type === "freedraw") {
              const shape = closedShape(lifted.points);
              const [left, top, right, bottom] = getCommonBounds([lifted]);
              if (shape && Math.min(right - left, bottom - top) * zoom >= MIN_SHAPE) {
                const below = (top + appState.scrollY) * zoom < TOOLS;
                next = {
                  id: lifted.id,
                  version: lifted.version,
                  shape,
                  x: (left + right) / 2,
                  y: below ? bottom : top,
                  below,
                };
              }
            }
            setAsk(next);
          } else if (ask) {
            // Asked about as it was drawn: moved, changed or gone, it is let be.
            const stroke = all.find((element) => element.id === ask.id);
            if (!stroke || stroke.isDeleted || stroke.version !== ask.version) {
              setAsk(null);
            }
          }
          // The page moves and grows with the drawing too. Zoomed far out, its
          // marks would run together, so every other one is left out, and again,
          // until they stand apart; those kept stay where they were.
          if (page.current) {
            let scale: number = zoom;
            while (scale < 0.5) scale *= 2;
            page.current.style.setProperty("--paper-scale", String(scale));
            page.current.style.setProperty("--paper-x", `${appState.scrollX * zoom}px`);
            page.current.style.setProperty("--paper-y", `${appState.scrollY * zoom}px`);
          }
          const boxes = stageBoxes(all);
          setStages((before) => (sameBoxes(before, boxes) ? before : boxes));
          if (tracked) {
            const drawn = flowOf(all);
            setFlow((before) => (before.key === drawn.key ? before : drawn));
          }
          const carrying = boxMarks(all, carried);
          setMarks((before) => (sameMarks(before, carrying) ? before : carrying));
          pictures.look(all, files);
          // Only what the server keeps is sent, so nothing it would refuse can
          // stop the rest of the drawing saving. A picture is sent with the
          // drawing once its bytes are stored, and not before.
          saver.changed(
            getNonDeletedElements(all).filter(
              (element) =>
                oneOf(ELEMENT_TYPES, element) &&
                (element.type !== "image" || pictures.has(element.fileId)),
            ),
          );
        }}
        renderTopRightUI={() => (
          // The dot alone on a phone, where the tools take the whole width and a
          // word beside them pushes the first off the screen. Saving that has
          // failed or stopped is said in words there too.
          <p
            role="status"
            className="inline-flex items-center gap-1.5 self-center text-xs whitespace-nowrap sm:rounded-full sm:bg-card/90 sm:px-2.5 sm:py-1 sm:shadow-sm sm:ring-1 sm:ring-foreground/10 sm:backdrop-blur"
          >
            <span
              aria-hidden
              className={`size-2 rounded-full sm:size-1.5 ${SAVE_DOTS[shownState]}`}
            />
            <span
              className={`text-muted-foreground ${
                shownState === "error" || shownState === "conflict"
                  ? ""
                  : "sr-only sm:not-sr-only"
              }`}
            >
              {SAVE_LABELS[shownState]}
            </span>
          </p>
        )}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.Group title="Page">
            {PAPERS.map(({ key, label }) => {
              const Icon = PAPER_ICONS[key];
              return (
                <MainMenu.Item
                  key={key}
                  icon={<Icon aria-hidden />}
                  selected={paper === key}
                  aria-pressed={paper === key}
                  onSelect={() => {
                    setPaper(key);
                    keepPaper(key);
                  }}
                >
                  {label}
                </MainMenu.Item>
              );
            })}
          </MainMenu.Group>
        </MainMenu>
      </Excalidraw>
      <div ref={asks} className="stage-asks">
        {ask && (
          <StageAsk
            x={ask.x}
            y={ask.y}
            below={ask.below}
            onYes={tidy}
            onNo={() => setAsk(null)}
          />
        )}
      </div>
      {record && place && (
        <RecordChips
          layer={(layer) => {
            chips.current = layer;
            follow(layer);
          }}
          record={record}
          spots={spots}
          at={typeof place === "string" ? place : null}
          stages={flow.stages}
          boxes={stages}
          stageAt={stageAt}
          onMove={moveTo}
        />
      )}
      {selected?.kind === "box" && (
        <BoxCard
          status={selected.status}
          name={selected.name}
          tracked={tracked}
          onChange={setStage}
          moveHere={
            record && selected.status
              ? {
                  name: record.name,
                  onMove: () =>
                    moveTo(
                      { elementId: selected.id },
                      spots.map(({ id }) => id),
                    ),
                }
              : undefined
          }
        >
          <BoxAttachments
            // A form of its own for each box, so nothing typed for one is
            // left for the next.
            key={selected.id}
            boardId={boardId}
            elementId={selected.id}
            attachments={carried.attachments.filter(
              ({ elementId }) => elementId === selected.id,
            )}
            stored={saver.stored}
            onChange={(attachments) => carry({ attachments })}
          />
          <BoxNotes
            key={`${selected.id}-notes`}
            boardId={boardId}
            elementId={selected.id}
            notes={carried.notes.filter(({ elementId }) => elementId === selected.id)}
            stored={saver.stored}
            onChange={(notes) => carry({ notes })}
          />
        </BoxCard>
      )}
      {selected?.kind === "strokes" && (
        // A card of its own for each selection, so a name typed for one is
        // not left in the box for the next.
        <StrokesCard key={selected.ids.join()} onMake={wrap} />
      )}
    </div>
  );
}
