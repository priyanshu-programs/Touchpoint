import { z } from "zod";
import { MAX_NOTE_MARKS, NOTE_STYLES, trimNote } from "@/modules/workflows/note-marks";

export const MAX_MEETING_NOTE = 10_000;
export const MAX_MEETING_FILES = 20;
export const MEETING_UPLOADS_PER_MINUTE = 30;
export const MAX_MEETING_FILE_TITLE = 200;

const mark = z.strictObject({
  from: z.int().min(0).max(MAX_MEETING_NOTE * 5),
  to: z.int().min(0).max(MAX_MEETING_NOTE * 5),
  style: z.enum(NOTE_STYLES),
});

// A meeting's notes as the editor sends them: plain words, and which of their characters
// are bold, italic or underlined. Emptied notes are allowed: the files may still be there.
export const meetingNotesInput = z
  .strictObject({
    eventId: z.uuid(),
    body: z.string().max(MAX_MEETING_NOTE * 5),
    marks: z.array(mark).max(MAX_NOTE_MARKS),
  })
  .transform(({ eventId, body, marks }) => ({ eventId, ...trimNote(body, marks) }))
  .refine(({ body }) => body.length <= MAX_MEETING_NOTE, {
    message: `Notes can be at most ${MAX_MEETING_NOTE.toLocaleString("en")} characters.`,
  });
export type MeetingNotesInput = z.infer<typeof meetingNotesInput>;

export const meetingFileRef = z.strictObject({ eventId: z.uuid(), fileId: z.uuid() });
