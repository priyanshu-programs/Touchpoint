"use client";

import { MainMenu } from "@excalidraw/excalidraw";
import { Grid3x3, Grip, Rows3, Square } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { SaveState } from "./board-saver";
import { PAPER_COOKIE, PAPERS, type Paper } from "./paper";

// What every whiteboard shows around its drawing, whether a workflow's or a
// brainstorm board's.

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Could not save. Trying again…",
  conflict: "Changed somewhere else. Reload to go on.",
  full: "Board is full. Remove some drawings to keep saving.",
};

// The dot beside the save label: green at rest, amber while work is pending,
// red when saving stopped or failed.
const SAVE_DOTS: Record<SaveState, string> = {
  saved: "bg-emerald-500",
  unsaved: "bg-amber-500",
  saving: "animate-pulse bg-amber-500",
  error: "bg-destructive",
  conflict: "bg-destructive",
  full: "bg-destructive",
};

// The dot alone on a phone, where the tools take the whole width and a word
// beside them pushes the first off the screen. Saving that has failed or
// stopped is said in words there too.
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p
      role="status"
      className="inline-flex items-center gap-1.5 self-center text-xs whitespace-nowrap sm:rounded-full sm:bg-card/90 sm:px-2.5 sm:py-1 sm:shadow-sm sm:ring-1 sm:ring-foreground/10 sm:backdrop-blur"
    >
      <span aria-hidden className={`size-2 rounded-full sm:size-1.5 ${SAVE_DOTS[state]}`} />
      <span
        className={`text-muted-foreground ${
          state === "error" || state === "conflict" || state === "full"
            ? ""
            : "sr-only sm:not-sr-only"
        }`}
      >
        {SAVE_LABELS[state]}
      </span>
    </p>
  );
}

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

export function PaperChoices({
  paper,
  onChange,
}: {
  paper: Paper;
  onChange: (paper: Paper) => void;
}) {
  return (
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
              onChange(key);
              keepPaper(key);
            }}
          >
            {label}
          </MainMenu.Item>
        );
      })}
    </MainMenu.Group>
  );
}

const dark = () => window.matchMedia("(prefers-color-scheme: dark)");
const watchTheme = (changed: () => void) => {
  dark().addEventListener("change", changed);
  return () => dark().removeEventListener("change", changed);
};

export const useDarkTheme = () =>
  useSyncExternalStore(
    watchTheme,
    () => dark().matches,
    () => false,
  );

// The page behind the drawing moves and grows with it. Zoomed far out, its
// marks would run together, so every other one is left out, and again, until
// they stand apart; those kept stay where they were.
export function followPaper(
  page: HTMLDivElement | null,
  { zoom, scrollX, scrollY }: { zoom: number; scrollX: number; scrollY: number },
) {
  if (!page) return;
  let scale = zoom;
  while (scale < 0.5) scale *= 2;
  page.style.setProperty("--paper-scale", String(scale));
  page.style.setProperty("--paper-x", `${scrollX * zoom}px`);
  page.style.setProperty("--paper-y", `${scrollY * zoom}px`);
}
