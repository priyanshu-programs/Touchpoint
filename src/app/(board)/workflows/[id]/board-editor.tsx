"use client";

import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  getNonDeletedElements,
  hashElementsVersion,
  MainMenu,
  newElementWith,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Grid3x3, Grip, Loader2, Rows3, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StageStatus } from "@/db/schema";
import {
  ELEMENT_TYPES,
  STAGE_COLORS,
  STAGE_SHAPES,
} from "@/modules/workflows/drawing";
import "./board.css";
import { createBoardSaver, type SaveState } from "./board-saver";
import { BoxCard } from "./box-card";
import { PAPER_COOKIE, PAPERS, type Paper } from "./paper";
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

// `status` is nothing for a box that is not a stage.
type Selected = { id: string; status: StageStatus | null };

// The one box that is selected, if a single box is all that is.
function selectedBox(
  elements: readonly ExcalidrawElement[],
  { selectedElementIds }: AppState,
): Selected | null {
  const ids = Object.keys(selectedElementIds);
  if (ids.length !== 1) return null;
  const box = elements.find(
    (element) => element.id === ids[0] && !element.isDeleted,
  );
  if (!box || !oneOf(STAGE_SHAPES, box)) return null;
  const stage = box.customData?.stage as { status: StageStatus } | undefined;
  return { id: box.id, status: stage?.status ?? null };
}

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

type Drawing = { version: number; elements: Record<string, unknown>[] };

// The drawing is fetched as the whiteboard opens, not handed down by the page,
// so that it is always the stored one: a page the browser kept from before
// (Back, say) would show an old drawing and then have its saves refused.
export function BoardEditor({
  boardId,
  name,
  tracked,
  paper,
}: {
  boardId: string;
  name: string;
  // A company's or a person's own board, whose stages have a status.
  tracked: boolean;
  // The page the owner last chose to draw on.
  paper: Paper;
}) {
  const [drawing, setDrawing] = useState<Drawing | "failed" | null>(null);

  useEffect(() => {
    let wanted = true;
    const load = async (): Promise<Drawing | "failed"> => {
      const response = await fetch(`/api/workflows/${boardId}/scene`);
      return response.ok ? response.json() : "failed";
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
      tracked={tracked}
      opensOn={paper}
      {...drawing}
    />
  );
}

function Whiteboard({
  boardId,
  name,
  tracked,
  opensOn,
  version,
  elements,
}: Drawing & {
  boardId: string;
  name: string;
  tracked: boolean;
  opensOn: Paper;
}) {
  const [paper, setPaper] = useState(opensOn);
  const isDark = useSyncExternalStore(
    watchTheme,
    () => dark().matches,
    () => false,
  );
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [stages, setStages] = useState<StageBox[]>([]);
  const halos = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saver] = useState(() =>
    createBoardSaver<NonDeletedExcalidrawElement>({
      boardId,
      version,
      hash: hashElementsVersion,
      report: setSaveState,
    }),
  );

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
  // saving has stopped for good, when a reload is the way on.
  const unstored =
    saveState === "unsaved" || saveState === "saving" || saveState === "error";
  useEffect(() => {
    if (!unstored) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unstored]);

  // Makes the selected box a stage with that status, or no stage at all.
  const setStage = (status: StageStatus | null) => {
    if (!api || !selected) return;
    api.updateScene({
      elements: api.getSceneElements().map((element) =>
        element.id === selected.id
          ? newElementWith(
              element,
              status
                ? {
                    customData: { stage: { status } },
                    backgroundColor: STAGE_COLORS[status],
                    fillStyle: "solid",
                  }
                : // Emptied, not removed: the whiteboard skips an update that
                  // sets a field to nothing.
                  { customData: {} },
            )
          : element,
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return (
    <div className="board absolute inset-0">
      <div ref={page} aria-hidden className="board-paper" data-paper={paper} />
      <StageHalos layer={halos} stages={stages} tracked={tracked} />
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
          tools: { image: false },
        }}
        onChange={(all, appState) => {
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
          const box = selectedBox(all, appState);
          setSelected((before) =>
            before?.id === box?.id && before?.status === box?.status
              ? before
              : box,
          );
          // The glows go where the drawing goes. Moving and zooming it changes
          // no box, so the layer is moved here and nothing is drawn again.
          const zoom = appState.zoom.value;
          if (halos.current) {
            halos.current.style.transform = `scale(${zoom}) translate(${appState.scrollX}px, ${appState.scrollY}px)`;
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
          // Only what the server keeps is sent, so nothing it would refuse can
          // stop the rest of the drawing saving.
          saver.changed(
            getNonDeletedElements(all).filter((element) =>
              oneOf(ELEMENT_TYPES, element),
            ),
          );
        }}
        renderTopRightUI={() => (
          // A plain word on a phone, where the pill pushes the tools off the screen.
          <p
            role="status"
            className="inline-flex items-center gap-1.5 self-center px-1 text-xs whitespace-nowrap sm:rounded-full sm:bg-card/90 sm:px-2.5 sm:py-1 sm:shadow-sm sm:ring-1 sm:ring-foreground/10 sm:backdrop-blur"
          >
            <span
              aria-hidden
              className={`hidden size-1.5 rounded-full sm:block ${SAVE_DOTS[saveState]}`}
            />
            <span className="text-muted-foreground">{SAVE_LABELS[saveState]}</span>
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
      {selected && (
        <BoxCard status={selected.status} tracked={tracked} onChange={setStage} />
      )}
    </div>
  );
}
