import type { StageStatus } from "@/db/schema";

// What the whiteboard in the browser and the server both need to know about a
// drawing. Nothing here touches the database, so the browser can load it.

// What may be drawn. Pictures arrive with their own storage; embedded pages never do.
export const ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "frame",
] as const;

// The shapes that hold text, and so can be a named stage.
export const STAGE_SHAPES = ["rectangle", "diamond", "ellipse"] as const;

// A stage's name is cut to this, wherever it comes from.
export const MAX_STAGE_NAME = 200;

export const STAGE_COLORS: Record<StageStatus, string> = {
  not_started: "#e9ecef",
  in_progress: "#ffec99",
  done: "#b2f2bb",
  blocked: "#ffc9c9",
};

export const STAGE_LABELS: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export const STAGE_ORDER = Object.keys(STAGE_LABELS) as StageStatus[];

// The same four in a strength that reads as a dot or a pill outside the drawing,
// where the fills above are too pale.
export const STAGE_MARKS: Record<StageStatus, string> = {
  not_started: "#868e96",
  in_progress: "#f08c00",
  done: "#2f9e44",
  blocked: "#e03131",
};
