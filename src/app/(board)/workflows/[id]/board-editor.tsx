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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ELEMENT_TYPES,
  STAGE_COLORS,
  STAGE_SHAPES,
} from "@/modules/workflows/drawing";
import "./board.css";
import { createBoardSaver, type SaveState } from "./board-saver";
import { BoxCard } from "./box-card";

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Could not save. Trying again…",
  conflict: "Changed somewhere else. Reload to go on.",
};

const dark = () => window.matchMedia("(prefers-color-scheme: dark)");
const watchTheme = (changed: () => void) => {
  dark().addEventListener("change", changed);
  return () => dark().removeEventListener("change", changed);
};

const oneOf = (types: readonly string[], element: ExcalidrawElement) =>
  types.includes(element.type);

type Selected = { id: string; isStage: boolean };

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
  return { id: box.id, isStage: Boolean(box.customData?.stage) };
}

type Drawing = { version: number; elements: Record<string, unknown>[] };

// The drawing is fetched as the whiteboard opens, not handed down by the page,
// so that it is always the stored one: a page the browser kept from before
// (Back, say) would show an old drawing and then have its saves refused.
export function BoardEditor({
  boardId,
  name,
}: {
  boardId: string;
  name: string;
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
      <p className="p-4 text-sm text-muted-foreground">Opening the whiteboard…</p>
    );
  }
  if (drawing === "failed") {
    return (
      <p role="alert" className="p-4 text-sm">
        The drawing could not be opened. Reload the page to try again.
      </p>
    );
  }
  return <Whiteboard boardId={boardId} name={name} {...drawing} />;
}

function Whiteboard({
  boardId,
  name,
  version,
  elements,
}: Drawing & {
  boardId: string;
  name: string;
}) {
  const isDark = useSyncExternalStore(
    watchTheme,
    () => dark().matches,
    () => false,
  );
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
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

  const setStage = (isStage: boolean) => {
    if (!api || !selected) return;
    api.updateScene({
      elements: api.getSceneElements().map((element) =>
        element.id === selected.id
          ? newElementWith(
              element,
              isStage
                ? {
                    customData: { stage: { status: "not_started" } },
                    backgroundColor: STAGE_COLORS.not_started,
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
          // hand-drawn look is still there to choose.
          appState: {
            currentItemRoughness: 0,
            currentItemFontFamily: FONT_FAMILY.Nunito,
            currentItemFillStyle: "solid",
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
            before?.id === box?.id && before?.isStage === box?.isStage
              ? before
              : box,
          );
          // Only what the server keeps is sent, so nothing it would refuse can
          // stop the rest of the drawing saving.
          saver.changed(
            getNonDeletedElements(all).filter((element) =>
              oneOf(ELEMENT_TYPES, element),
            ),
          );
        }}
        renderTopRightUI={() => (
          <p
            role="status"
            className="self-center px-1 text-xs whitespace-nowrap text-muted-foreground"
          >
            {SAVE_LABELS[saveState]}
          </p>
        )}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
      {selected && <BoxCard isStage={selected.isStage} onChange={setStage} />}
    </div>
  );
}
