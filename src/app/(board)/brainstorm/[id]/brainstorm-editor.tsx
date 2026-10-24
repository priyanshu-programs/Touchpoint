"use client";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  getNonDeletedElements,
  hashElementsVersion,
  MainMenu,
  ROUNDNESS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ChevronDown, Loader2, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ELEMENT_TYPES } from "@/modules/workflows/drawing";
import "../../workflows/[id]/board.css";
import {
  followPaper,
  PaperChoices,
  SaveStatus,
  useDarkTheme,
} from "../../workflows/[id]/board-chrome";
import { createBoardPictures } from "../../workflows/[id]/board-pictures";
import { createBoardSaver, type SaveState } from "../../workflows/[id]/board-saver";
import { openBrainstormAction } from "@/app/(app)/brainstorm/actions";
import type { Paper } from "../../workflows/[id]/paper";

// The colours a sticky note comes in, as on a wall of paper notes.
const STICKY_COLORS = [
  { key: "yellow", label: "Yellow", fill: "#fff3a3" },
  { key: "pink", label: "Pink", fill: "#ffc9de" },
  { key: "blue", label: "Blue", fill: "#c3e4ff" },
  { key: "green", label: "Green", fill: "#c9f2c7" },
  { key: "orange", label: "Orange", fill: "#ffd8a8" },
] as const;
type StickyColor = (typeof STICKY_COLORS)[number];

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
// inside, so it moves, resizes and takes arrows like any other.
function addSticky(api: ExcalidrawImperativeAPI, { fill }: StickyColor) {
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
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
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
  color: StickyColor;
  onColor: (color: StickyColor) => void;
  className?: string;
}) {
  const add = (chosen: StickyColor) => {
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
        <DropdownMenuContent align="end" className="w-auto min-w-32">
          {STICKY_COLORS.map((choice) => (
            <DropdownMenuItem key={choice.key} onClick={() => add(choice)}>
              <span
                aria-hidden
                className="size-4 rounded-sm ring-1 ring-foreground/15"
                style={{ backgroundColor: choice.fill }}
              />
              {choice.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type Drawing = {
  version: number;
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
      const [response, apart] = await Promise.all([
        fetch(`/api/brainstorm/${boardId}/scene`),
        openBrainstormAction(boardId),
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
  version,
  elements,
  pictures: held,
}: Drawing & { boardId: string; name: string; opensOn: Paper }) {
  const [paper, setPaper] = useState(opensOn);
  const isDark = useDarkTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [color, setColor] = useState<StickyColor>(STICKY_COLORS[0]);
  const page = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saver] = useState(() =>
    createBoardSaver<NonDeletedExcalidrawElement>({
      endpoint: `/api/brainstorm/${boardId}/scene`,
      version,
      hash: hashElementsVersion,
      report: setSaveState,
    }),
  );
  const unfitted = useRef(elements.length > 0);

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

  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && saver.flush();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      saver.flush();
    };
  }, [saver]);

  // A picture still on its way is not stored, nor the drawing that shows it.
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

  return (
    <div className="board absolute inset-0">
      <div ref={page} aria-hidden className="board-paper" data-paper={paper} />
      <Excalidraw
        excalidrawAPI={setApi}
        name={name}
        theme={isDark ? "dark" : "light"}
        autoFocus
        aiEnabled={false}
        validateEmbeddable={false}
        initialData={{
          elements: elements as unknown as ExcalidrawElement[],
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
            requestAnimationFrame(() =>
              api.scrollToContent(undefined, {
                fitToViewport: true,
                viewportZoomFactor: 0.9,
                maxZoom: 1,
                animate: false,
              }),
            );
          }
          followPaper(page.current, { ...appState, zoom: appState.zoom.value });
          pictures.look(all, files);
          // A picture is sent with the drawing once its bytes are stored.
          saver.changed(
            getNonDeletedElements(all).filter(
              (element) =>
                oneOf(ELEMENT_TYPES, element) &&
                (element.type !== "image" || pictures.has(element.fileId)),
            ),
          );
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
