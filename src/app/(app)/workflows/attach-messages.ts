import type { AttachResult } from "@/modules/workflows/attachments";
import type { NoteResult } from "@/modules/workflows/notes";
import type { PictureResult } from "@/modules/workflows/pictures";

type Refusal = Exclude<
  Exclude<AttachResult, { ok: true }>["reason"],
  "not_found"
>;

// Why a link or a file was not put on a box, as the box's card says it.
export const ATTACH_REFUSALS: Record<Refusal, string> = {
  no_box: "That box is not in the saved drawing yet. Try again in a moment.",
  limit: "A whiteboard can carry at most 50 links and files.",
  too_large: "That file is larger than 4 MB. Attach it as a link instead.",
  kind: "Only PDFs, pictures and Word, Excel and PowerPoint files are kept. Attach anything else as a link.",
  full: "Your 200 MB of file storage is used up. Remove a file, or attach this one as a link.",
  rate: "Too many uploads in a minute. Try again shortly.",
};

// Why a note was not put on a box.
export const NOTE_REFUSALS: Record<
  Exclude<Exclude<NoteResult, { ok: true }>["reason"], "not_found">,
  string
> = {
  no_box: ATTACH_REFUSALS.no_box,
  limit: "A whiteboard can carry at most 200 notes.",
};

// Why a picture was taken off the whiteboard again. One sent too fast or to a
// board that is gone is not refused for good, so it has no sentence here.
export const PICTURE_REFUSALS: Record<
  Exclude<Exclude<PictureResult, { ok: true }>["reason"], "not_found" | "rate">,
  string
> = {
  kind: "Only PNG, JPEG, GIF and WebP pictures are kept. Save this one as a PNG and add it again.",
  too_large: "That picture is larger than 4 MB, so it was not kept.",
  full: "Your 200 MB of file storage is used up. Remove a file or a picture to make room.",
  limit: "A whiteboard can hold at most 100 pictures.",
};
