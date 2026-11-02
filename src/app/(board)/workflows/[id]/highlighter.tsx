"use client";

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Highlighter } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Pen = Pick<
  AppState,
  "currentItemStrokeColor" | "currentItemStrokeWidth" | "currentItemOpacity"
>;

// A wide, see-through yellow pen stroke, about one line of the board's text tall.
const MARKER: Pen = {
  currentItemStrokeColor: "#fab005",
  currentItemStrokeWidth: 6,
  currentItemOpacity: 40,
};

// The highlighter is the whiteboard's own pen with the marker's colour, width and
// opacity. Leaving the pen, or pressing the button again, gives back the pen the
// owner had.
export function useHighlighter(api: ExcalidrawImperativeAPI | null) {
  const [on, setOn] = useState(false);
  const before = useRef<Pen | null>(null);

  const stop = (toSelection: boolean) => {
    setOn(false);
    if (!api || !before.current) return;
    api.updateScene({ appState: before.current, captureUpdate: CaptureUpdateAction.NEVER });
    before.current = null;
    if (toSelection) api.setActiveTool({ type: "selection" });
  };

  const start = () => {
    if (!api) return;
    const state = api.getAppState();
    before.current = {
      currentItemStrokeColor: state.currentItemStrokeColor,
      currentItemStrokeWidth: state.currentItemStrokeWidth,
      currentItemOpacity: state.currentItemOpacity,
    };
    api.updateScene({ appState: MARKER, captureUpdate: CaptureUpdateAction.NEVER });
    api.setActiveTool({ type: "freedraw" });
    setOn(true);
  };

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    if (!api || !on) return;
    return api.onChange((_, state) => {
      if (before.current && state.activeTool.type !== "freedraw") stopRef.current(false);
    });
  }, [api, on]);

  return { on, toggle: () => (on ? stop(true) : start()) };
}

export function HighlighterButton({
  on,
  onToggle,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`h-9 items-center gap-1.5 self-center rounded-lg bg-card px-2.5 text-sm shadow-sm ring-1 ring-foreground/10 hover:bg-accent aria-pressed:bg-amber-100 aria-pressed:ring-amber-400 dark:aria-pressed:bg-amber-950 ${className}`}
    >
      <Highlighter aria-hidden className="size-4 text-amber-500" />
      <span className="sr-only sm:not-sr-only">Highlighter</span>
    </button>
  );
}
