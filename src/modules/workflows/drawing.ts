import type { StageStatus } from "@/db/schema";

// What the whiteboard in the browser and the server both need to know about a
// drawing. Nothing here touches the database, so the browser can load it.

// What may be drawn. A picture's bytes are kept apart from the drawing, which
// holds only the picture's id; embedded pages are never drawn.
export const ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "frame",
  "image",
] as const;

// The whiteboard shrinks a picture to this on its longer side before placing
// it. What is stored is held to the same, so a picture is as large stored as
// it is on the screen, and a part cut out of it stays the same part.
export const MAX_PICTURE_SIDE = 1440;

// The shapes that hold text, and so can be a named stage.
export const STAGE_SHAPES = ["rectangle", "diamond", "ellipse"] as const;

// A link or a file kept on a box. A link has an address; a file has a size and
// a kind, and is fetched by the attachment's own id.
export type BoxAttachment = {
  id: string;
  elementId: string;
  title: string;
  url: string | null;
  size: number | null;
  contentType: string | null;
};

export const MAX_NOTE_LENGTH = 2000;

// A note left on a box, as the board's whiteboard shows it.
export type BoxNote = {
  id: string;
  elementId: string;
  body: string;
  createdAt: string;
};

// What a box can carry, in the order its mark shows them.
export const BOX_KINDS = [
  "pdf",
  "word",
  "excel",
  "powerpoint",
  "picture",
  "file",
  "link",
  "note",
] as const;
export type BoxKind = (typeof BOX_KINDS)[number];

const FILE_KINDS: Record<string, BoxKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "powerpoint",
};

// A file's kind is the one read from its bytes when it was stored. `file` is
// for a kind kept that has no mark of its own.
export const attachmentKind = ({ url, contentType }: BoxAttachment): BoxKind =>
  url
    ? "link"
    : contentType?.startsWith("image/")
      ? "picture"
      : (FILE_KINDS[contentType ?? ""] ?? "file");

// The largest file a box can carry, and the largest picture that can be sent:
// under the 4.5 MB a request may be on the free hosting.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

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
