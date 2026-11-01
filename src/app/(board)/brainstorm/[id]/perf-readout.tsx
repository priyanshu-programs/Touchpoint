"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";

const LONG_GAP_MS = 200;

type LiveStatus = { state: string; roundTrip: number | null };

type Numbers = {
  openedAt: number;
  framesASecond: number;
  longest: number;
  strokes: number;
  onScreen: number;
  zoom: number;
  live: LiveStatus;
};

export const wantsPerfReadout = () =>
  new URLSearchParams(window.location.search).get("perf") === "1";

// A board's speed in numbers, shown on the device itself when the address ends
// in ?perf=1, so a tablet can be measured with no cable and no developer tools.
// It reads the frames of this page and sends nothing anywhere.
export function PerfReadout({
  api,
  liveStatus,
}: {
  api: ExcalidrawImperativeAPI | null;
  liveStatus: () => LiveStatus;
}) {
  const [numbers, setNumbers] = useState<Numbers | null>(null);
  const longest = useRef(0);
  const apiNow = useRef(api);

  useEffect(() => {
    apiNow.current = api;
  }, [api]);

  useEffect(() => {
    let last = performance.now();
    let frames = 0;
    let frame = 0;
    let openedAt = last;
    let touched = false;
    const touch = () => {
      touched = true;
    };
    window.addEventListener("pointerdown", touch, { capture: true, once: true });
    window.addEventListener("wheel", touch, { capture: true, once: true });

    const tick = (now: number) => {
      const gap = now - last;
      frames += 1;
      if (touched) longest.current = Math.max(longest.current, gap);
      // The board counts as open once its last long freeze before being touched is over.
      else if (gap > LONG_GAP_MS || !apiNow.current) openedAt = now;
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const report = setInterval(() => {
      const board = apiNow.current;
      const state = board?.getAppState();
      const strokes = board?.getSceneElements().filter(({ type }) => type === "freedraw") ?? [];
      const zoom = state?.zoom.value ?? 1;
      const left = -(state?.scrollX ?? 0);
      const top = -(state?.scrollY ?? 0);
      const right = left + (state?.width ?? 0) / zoom;
      const bottom = top + (state?.height ?? 0) / zoom;
      setNumbers({
        openedAt,
        framesASecond: frames,
        longest: longest.current,
        strokes: strokes.length,
        onScreen: strokes.filter(
          ({ x, y, width, height }) =>
            x < right && x + width > left && y < bottom && y + height > top,
        ).length,
        zoom,
        live: liveStatus(),
      });
      frames = 0;
    }, 1000);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(report);
      window.removeEventListener("pointerdown", touch, { capture: true });
      window.removeEventListener("wheel", touch, { capture: true });
    };
  }, [liveStatus]);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <aside
      aria-label="Board speed"
      className="absolute top-16 left-2 z-20 w-44 rounded-md bg-card p-2 font-mono text-xs shadow-lg ring-1 ring-foreground/10"
    >
      {numbers ? (
        <dl>
          {row("Opened in", `${(numbers.openedAt / 1000).toFixed(1)} s`)}
          {row("Frames/s", String(numbers.framesASecond))}
          {row("Worst freeze", `${Math.round(numbers.longest)} ms`)}
          {row("Strokes", String(numbers.strokes))}
          {row("On screen", String(numbers.onScreen))}
          {row("Zoom", `${Math.round(numbers.zoom * 100)}%`)}
          {row("Pixels", String(window.devicePixelRatio))}
          {row(
            "Live",
            numbers.live.state === "open" && numbers.live.roundTrip !== null
              ? `open ${numbers.live.roundTrip} ms`
              : numbers.live.state,
          )}
        </dl>
      ) : (
        "Measuring…"
      )}
      <button
        type="button"
        className="mt-1 w-full rounded-sm border px-1 py-0.5 hover:bg-accent"
        onClick={() => {
          longest.current = 0;
        }}
      >
        Reset worst freeze
      </button>
    </aside>
  );
}
