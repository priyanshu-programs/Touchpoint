"use client";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ChevronDown, Loader2, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BRIGHT_COLORS,
  LIGHT_COLORS,
  pickedColors,
  type GridColor,
} from "@/modules/workflows/colors";
import { ELEMENT_TYPES } from "@/modules/workflows/drawing";
import {
  sameNotes,
  stickyNotes,
  writingOnNote,
  unmarkedSticky,
  type StickyNote as NoteOnBoard,
} from "@/modules/workflows/sticky";
import "../../workflows/[id]/board.css";
import { createTypedLinks } from "../../workflows/[id]/typed-links";
import {
  createPaperFollower,
  PaperChoices,
  SaveStatus,
  useDarkTheme,
} from "../../workflows/[id]/board-chrome";
import { ColorGrid, samePicked, type Picked } from "../../workflows/[id]/color-grid";
import { createBoardPictures } from "../../workflows/[id]/board-pictures";
import {
  HEADER_PX,
  openingView,
  useRememberedView,
  type Placed,
} from "../../workflows/[id]/board-view";
import type { SaveState } from "../../workflows/[id]/board-saver";
import { openBrainstormAction } from "@/app/(app)/brainstorm/actions";
import type { Paper } from "../../workflows/[id]/paper";
import { StickySheen, StickyShadows } from "../../workflows/[id]/sticky-notes";
import { createBoardSync, loadBoard } from "./board-sync";
import { PerfReadout, wantsPerfReadout } from "./perf-readout";

// How often a moving view or a pen stroke looks over every element of the board:
// a board of handwriting holds thousands, and these run many times a second.
const SCAN_MS = 250;

// A sticky note comes in the grid's light and bright colours, light yellow first.
const STICKY_COLORS = [...LIGHT_COLORS, ...BRIGHT_COLORS];
const FIRST_STICKY = LIGHT_COLORS.find(({ name }) => name === "Light yellow")!;

const STICKY_SIZE = 200;
const STICKY_STEP = STICKY_SIZE + 24;
// Where a note goes from the middle of the screen, nearest first, beside and
// below before above: the first of these that is on the screen and that
// nothing is drawn on yet.
const STICKY_SPOTS = [0, 1, -1, 2].flatMap((row) =>
  [0, 1, -1, 2, -2].map((column) => [column, row] as const),
).sort(([a, b], [c, d]) => Math.hypot(a, b) - Math.hypot(c, d));

type Area = { x: number; y: number; width: number; height: number };

const overlaps = (a: Area, b: Area) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const inside = (a: Area, b: Area) =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

function freeSpot(drawn: readonly ExcalidrawElement[], middle: { x: number; y: number }, seen: Area) {
  const spots = STICKY_SPOTS.map(([column, row]) => ({
    x: middle.x - STICKY_SIZE / 2 + column * STICKY_STEP,
    y: middle.y - STICKY_SIZE / 2 + row * STICKY_STEP,
    width: STICKY_SIZE,
    height: STICKY_SIZE,
  }));
  const free = spots.filter(
    (spot) => !drawn.some((element) => !element.isDeleted && overlaps(element, spot)),
  );
  return free.find((spot) => inside(spot, seen)) ?? free[0] ?? spots[0];
}

// A square note near the middle of what is on the screen, where it covers
// nothing, selected and open for typing. It is a plain box with its text
// inside, so it moves, resizes and takes arrows like any other; its mark is
// what has the board draw it as a note.
function addSticky(api: ExcalidrawImperativeAPI, { value: fill }: GridColor) {
  const appState = api.getAppState();
  const middle = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );
  const zoom = appState.zoom.value;
  const { x, y } = freeSpot(api.getSceneElements(), middle, {
    x: -appState.scrollX,
    y: -appState.scrollY,
    width: appState.width / zoom,
    height: appState.height / zoom,
  });
  const [note] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width: STICKY_SIZE,
      height: STICKY_SIZE,
      backgroundColor: fill,
      fillStyle: "solid",
      strokeColor: "transparent",
      roughness: 0,
      roundness: null,
      customData: { sticky: true },
    },
  ]);
  api.updateScene({
    elements: [...api.getSceneElements(), note],
    appState: { selectedElementIds: { [note.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
  // Enter on one selected box starts writing inside it. The whiteboard listens
  // for keys on its own container, once it has drawn the note as selected.
  requestAnimationFrame(() =>
    document
      .querySelector(".board .excalidraw-container")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
}

function StickyButton({
  api,
  color,
  onColor,
  className,
}: {
  api: ExcalidrawImperativeAPI | null;
  color: GridColor;
  onColor: (color: GridColor) => void;
  className?: string;
}) {
  const add = (chosen: GridColor) => {
    onColor(chosen);
    if (api) addSticky(api, chosen);
  };

  return (
    <div
      className={`h-9 items-stretch self-center overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/10 ${className}`}
    >
      <button
        type="button"
        onClick={() => add(color)}
        className="inline-flex items-center gap-1.5 px-2.5 text-sm hover:bg-accent"
      >
        <StickyNote aria-hidden className="size-4 text-amber-500" />
        <span className="sr-only sm:not-sr-only">Sticky note</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Sticky note colour"
          className="grid w-7 place-items-center border-l text-muted-foreground hover:bg-accent"
        >
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="grid w-auto grid-cols-10 gap-0.5 p-1.5">
          {STICKY_COLORS.map((choice) => (
            <DropdownMenuItem
              key={choice.value}
              aria-label={choice.name}
              title={choice.name}
              onClick={() => add(choice)}
              className="p-1"
            >
              <span
                aria-hidden
                className="color-swatch size-5"
                style={{ "--swatch": choice.value } as React.CSSProperties}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type Drawing = {
  clock: number;
  elements: Record<string, unknown>[];
  pictures: string[];
};

function Notice({ paper, children }: { paper: Paper; children: React.ReactNode }) {
  return (
    <div className="board absolute inset-0">
      <div aria-hidden className="board-paper" data-paper={paper} />
      <div className="relative grid h-full place-items-center p-4">{children}</div>
    </div>
  );
}

// The drawing and the ids of its pictures are fetched as the whiteboard opens,
// so they are always the stored ones, as on a workflow's board.
export function BrainstormEditor({
  boardId,
  name,
  paper,
}: {
  boardId: string;
  name: string;
  paper: Paper;
}) {
  const [drawing, setDrawing] = useState<Drawing | "failed" | null>(null);

  useEffect(() => {
    let wanted = true;
    const load = async (): Promise<Drawing | "failed"> => {
      const [board, apart] = await Promise.all([
        loadBoard(`/api/brainstorm/${boardId}/elements`),
        openBrainstormAction(boardId),
      ]);
      return { ...board, ...apart };
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
      <Notice paper={paper}>
        <p className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg ring-1 ring-foreground/10">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Opening the whiteboard…
        </p>
      </Notice>
    );
  }
  if (drawing === "failed") {
    return (
      <Notice paper={paper}>
        <p
          role="alert"
          className="max-w-sm rounded-xl bg-card p-4 text-sm shadow-lg ring-1 ring-foreground/10"
        >
          The board could not be opened. Reload the page to try again.
        </p>
      </Notice>
    );
  }
  return <Whiteboard boardId={boardId} name={name} opensOn={paper} {...drawing} />;
}

const oneOf = (types: readonly string[], element: ExcalidrawElement) =>
  types.includes(element.type);

function Whiteboard({
  boardId,
  name,
  opensOn,
  clock,
  elements,
  pictures: held,
}: Drawing & { boardId: string; name: string; opensOn: Paper }) {
  const [paper, setPaper] = useState(opensOn);
  const isDark = useDarkTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [typedLinks] = useState(createTypedLinks);
  const [color, setColor] = useState(FIRST_STICKY);
  const [picked, setPicked] = useState<Picked>({ stroke: "", fill: null });
  const board = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<NoteOnBoard[]>([]);
  const shadows = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [perf] = useState(wantsPerfReadout);
  // Worked out before the first draw, so the board is drawn once and not moved after.
  const [opensAt] = useState(() =>
    openingView(boardId, elements as unknown as Placed[], {
      width: window.innerWidth,
      height: window.innerHeight - HEADER_PX,
    }),
  );
  const [paperFollows] = useState(createPaperFollower);
  const sawView = useRememberedView(boardId);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toScan = useRef<(() => void) | null>(null);
  useEffect(() => () => clearTimeout(scanTimer.current), []);
  // Notes put down before they carried a mark are given it, and square
  // corners, as the board opens, as a change of their own the next save keeps.
  const [opening] = useState(() =>
    (elements as unknown as ExcalidrawElement[]).map((element) =>
      unmarkedSticky(element)
        ? {
            ...element,
            roundness: null,
            customData: { sticky: true },
            version: element.version + 1,
          }
        : element,
    ),
  );

  // Whether a picture put on the whiteboard is still on its way to the server.
  const [sending, setSending] = useState(false);
  const [pictures] = useState(() =>
    createBoardPictures({
      address: `/api/brainstorm/${boardId}/pictures`,
      held,
      report: setSending,
    }),
  );
  useEffect(() => {
    if (!api) return;
    pictures.attach(api);
    return pictures.stop;
  }, [api, pictures]);

  const [sync] = useState(() =>
    createBoardSync({
      address: `/api/brainstorm/${boardId}/elements`,
      clock,
      // As they were stored, so a note given its mark above is sent.
      elements: elements as unknown as ExcalidrawElement[],
      // A picture is sent with the drawing once its bytes are stored.
      sendable: (element) =>
        oneOf(ELEMENT_TYPES, element) &&
        (element.type !== "image" || pictures.has(element.fileId)),
      report: setSaveState,
      received: pictures.fetchShown,
    }),
  );
  useEffect(() => {
    if (!api) return;
    sync.attach(api);
    const hidden = () => document.visibilityState === "hidden" && sync.flush();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      sync.flush();
      sync.stop();
    };
  }, [api, sync]);

  // A picture still on its way is not stored, nor the drawing that shows it.
  const shownState: SaveState =
    sending && saveState === "saved" ? "saving" : saveState;
  const unstored =
    shownState === "unsaved" ||
    shownState === "saving" ||
    shownState === "error" ||
    shownState === "full";
  useEffect(() => {
    if (!unstored) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unstored]);

  return (
    <div ref={board} className="board absolute inset-0">
      <div ref={page} aria-hidden className="board-paper" data-paper={paper} />
      <StickyShadows layer={shadows} notes={notes} dark={isDark} />
      <Excalidraw
        excalidrawAPI={setApi}
        name={name}
        theme={isDark ? "dark" : "light"}
        autoFocus
        aiEnabled={false}
        validateEmbeddable={false}
        initialData={{
          elements: opening,
          appState: {
            currentItemRoughness: 0,
            currentItemFontFamily: FONT_FAMILY.Nunito,
            currentItemFillStyle: "solid",
            viewBackgroundColor: "transparent",
            ...(opensAt && {
              zoom: { value: opensAt.zoom as NormalizedZoomValue },
              scrollX: opensAt.scrollX,
              scrollY: opensAt.scrollY,
            }),
          },
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
        onPaste={() => {
          typedLinks.pasted(api);
          return true;
        }}
        onChange={(all, appState, files) => {
          typedLinks.watch(api, appState);
          const zoom = appState.zoom.value;
          const view = { zoom, scrollX: appState.scrollX, scrollY: appState.scrollY };
          const moved = sawView(view);
          if (moved) {
            paperFollows(page.current, view, appState);
            // The notes' shadows and shading go where the drawing goes.
            const placed = `scale(${zoom}) translate(${appState.scrollX}px, ${appState.scrollY}px)`;
            if (shadows.current) shadows.current.style.transform = placed;
            if (sheen.current) sheen.current.style.transform = placed;
          }

          const scan = () => {
            const onScreen = stickyNotes(all, {
              x: -appState.scrollX,
              y: -appState.scrollY,
              width: appState.width / zoom,
              height: appState.height / zoom,
            });
            setNotes((before) => (sameNotes(before, onScreen) ? before : onScreen));
            board.current?.toggleAttribute(
              "data-writing-on-note",
              writingOnNote(all, appState.editingTextElement),
            );
            const now = pickedColors(all, appState);
            setPicked((before) => (samePicked(before, now) ? before : now));
            pictures.look(all, files);
            sync.changed(all);
          };
          // Moving the view and writing with the pen change nothing these need
          // at once. Anything else, like dragging a note, is followed exactly.
          if (moved || appState.newElement?.type === "freedraw") {
            toScan.current = scan;
            scanTimer.current ??= setTimeout(() => {
              scanTimer.current = undefined;
              toScan.current?.();
            }, SCAN_MS);
          } else {
            clearTimeout(scanTimer.current);
            scanTimer.current = undefined;
            scan();
          }
        }}
        renderTopRightUI={() => (
          <div className="flex items-center gap-2">
            <StickyButton
              api={api}
              color={color}
              onColor={setColor}
              className="hidden sm:inline-flex"
            />
            <SaveStatus state={shownState} />
          </div>
        )}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <PaperChoices paper={paper} onChange={setPaper} />
        </MainMenu>
      </Excalidraw>
      <StickySheen layer={sheen} notes={notes} dark={isDark} />
      {perf && <PerfReadout api={api} />}
      <ColorGrid board={board} api={api} picked={picked} />
      {/* On a phone the tools fill the top row, so the note waits above the bar
          at the foot of the board instead. */}
      <StickyButton
        api={api}
        color={color}
        onColor={setColor}
        className="absolute right-4 bottom-24 z-10 inline-flex sm:hidden"
      />
    </div>
  );
}
