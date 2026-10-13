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

export const STAGE_COLORS: Record<StageStatus, string> = {
  not_started: "#e9ecef",
  in_progress: "#ffec99",
  done: "#b2f2bb",
  blocked: "#ffc9c9",
};
