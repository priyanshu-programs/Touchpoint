"use client";

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  BRIGHT_COLORS,
  DARK_COLORS,
  GREY_COLORS,
  LIGHT_COLORS,
  readColor,
  recolored,
  SEE_THROUGH,
  TRANSPARENT,
  withAlpha,
  type Alpha,
  type ColorTarget,
  type GridColor,
} from "@/modules/workflows/colors";

export type Picked = { stroke: string; fill: string | null };

export const samePicked = (a: Picked, b: Picked) =>
  a.stroke === b.stroke && a.fill === b.fill;

// Puts a colour on what is selected and on the next thing drawn, as the
// whiteboard's own colour controls do, in one step that one undo takes back.
function applyColor(api: ExcalidrawImperativeAPI, target: ColorTarget, color: string) {
  const all = api.getSceneElements();
  const state = api.getAppState();
  const ids = recolored(all, state, target);
  api.updateScene({
    elements: all.map((element) =>
      ids.has(element.id)
        ? newElementWith(
            element,
            target === "stroke" ? { strokeColor: color } : { backgroundColor: color },
          )
        : element,
    ),
    appState: {
      currentItemStrokeColor: target === "stroke" ? color : state.currentItemStrokeColor,
      currentItemBackgroundColor:
        target === "fill" ? color : state.currentItemBackgroundColor,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

// One colour of the grid. `drawn` shows it as the whiteboard will draw it,
// which in the dark theme is through the canvas's own filter.
export function Swatch({
  color,
  chosen,
  drawn,
  onPick,
}: {
  color: GridColor;
  chosen: boolean;
  drawn?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={color.name}
      title={color.name}
      aria-pressed={chosen}
      onClick={onPick}
      className="color-swatch"
      data-drawn={drawn || undefined}
      style={{ "--swatch": color.value } as React.CSSProperties}
    />
  );
}

const ROWS = [LIGHT_COLORS, BRIGHT_COLORS, DARK_COLORS];
const GRID_KEYS = new Set(["Enter", " ", "Tab"]);
const NOTHING: GridColor = { name: "No colour", value: TRANSPARENT };

// The grid takes the place of the whiteboard's own Stroke and Background rows,
// which board.css hides, at the top of its properties panel: the panel beside
// the drawing on a wide screen, the sheet above the foot on a phone. That
// panel comes and goes with the selection, so a spot for the grid is put at
// its top each time it appears.
function useGridSpot(board: RefObject<HTMLElement | null>) {
  const [spot, setSpot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = board.current;
    if (!root) return;
    let held: { host: Element; spot: HTMLElement } | null = null;
    const look = () => {
      const host = root.querySelector(".App-menu__left, .App-mobile-menu");
      if (held && held.host === host && held.spot.isConnected) return;
      // The panel went (Escape, a click on the drawing) with a swatch still
      // focused, which leaves the focus nowhere. The whiteboard hears its
      // shortcuts only inside its own container, so the focus goes back there.
      if (held && !held.spot.isConnected && document.activeElement === document.body) {
        root.querySelector<HTMLElement>(".excalidraw-container")?.focus();
      }
      held?.spot.remove();
      held = null;
      if (host) {
        const made = document.createElement("div");
        made.className = "color-grid";
        host.prepend(made);
        held = { host, spot: made };
      }
      setSpot(held?.spot ?? null);
    };
    look();
    const watcher = new MutationObserver(look);
    watcher.observe(root, { childList: true, subtree: true });
    return () => {
      watcher.disconnect();
      held?.spot.remove();
    };
  }, [board]);
  return spot;
}

export function ColorGrid({
  board,
  api,
  picked,
}: {
  board: RefObject<HTMLElement | null>;
  api: ExcalidrawImperativeAPI | null;
  picked: Picked;
}) {
  const spot = useGridSpot(board);
  const [wanted, setWanted] = useState<ColorTarget>("stroke");
  if (!spot || !api) return null;

  const target = picked.fill === null ? "stroke" : wanted;
  const current = target === "stroke" ? picked.stroke : (picked.fill ?? TRANSPARENT);
  const read = readColor(current);
  const alpha: Alpha = read?.alpha ?? "";
  const pick = (base: string, keep: Alpha) => applyColor(api, target, withAlpha(base, keep));
  const swatch = (color: GridColor) => (
    <Swatch
      key={color.value}
      color={color}
      chosen={read?.base === color.value}
      drawn
      onPick={() => pick(color.value, alpha)}
    />
  );

  return createPortal(
    <div
      role="group"
      aria-label="Colours"
      // React sends a key pressed here up this component's tree, not the
      // whiteboard's, so its shortcuts (Escape, a tool's letter) are handed on
      // to it. The keys that work the grid's own buttons stay here.
      onKeyDown={(event) => {
        if (GRID_KEYS.has(event.key)) return;
        event.currentTarget
          .closest(".excalidraw-container")
          ?.dispatchEvent(new KeyboardEvent("keydown", event.nativeEvent));
      }}
    >
      <div className="color-grid-tabs">
        <button
          type="button"
          aria-pressed={target === "stroke"}
          onClick={() => setWanted("stroke")}
        >
          Line
        </button>
        {picked.fill !== null && (
          <button
            type="button"
            aria-pressed={target === "fill"}
            onClick={() => setWanted("fill")}
          >
            Fill
          </button>
        )}
      </div>
      <div className="color-grid-swatches">
        {ROWS.flat().map(swatch)}
        {GREY_COLORS.map(swatch)}
        {swatch(NOTHING)}
      </div>
      <div role="group" aria-label="See-through" className="color-grid-alphas">
        {SEE_THROUGH.map((choice) => (
          <button
            key={choice.label}
            type="button"
            aria-pressed={read !== null && alpha === choice.alpha}
            disabled={!read || read.base === TRANSPARENT}
            onClick={() => read && pick(read.base, choice.alpha)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>,
    spot,
  );
}
