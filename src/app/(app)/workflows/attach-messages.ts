import type { AttachResult } from "@/modules/workflows/attachments";

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
