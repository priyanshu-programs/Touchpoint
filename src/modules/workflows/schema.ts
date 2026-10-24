import { z } from "zod";
import { STAGE_STATUSES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { httpUrl } from "@/lib/url";
import { ELEMENT_TYPES, MAX_NOTE_LENGTH, MAX_STAGE_NAME } from "./drawing";
import { workflowIcon } from "./icons";

export { STAGE_STATUSES };

export const MAX_TEMPLATES = 50;
export const MAX_ELEMENTS = 10_000;
export const MAX_SCENE_BYTES = 3_000_000;
export const MAX_BOARD_STAGES = 100;
// The boards one company or one person can have.
export const MAX_RECORD_BOARDS = 20;

export const boardInput = z.strictObject({
  name: z.string().trim().min(1, "Give the workflow a name").max(80),
  description: blankToNull(text(1000)),
});
export type BoardInput = z.infer<typeof boardInput>;

// The owner's templates in the order they want them, each named once.
export const boardOrder = z
  .array(z.uuid())
  .min(1)
  .max(MAX_TEMPLATES)
  .refine((ids) => new Set(ids).size === ids.length);

// The company or the person a board is started on.
export const boardSubject = z.union([
  z.strictObject({ organizationId: z.uuid() }),
  z.strictObject({ contactId: z.uuid() }),
]);
export type BoardSubject = z.infer<typeof boardSubject>;

// What a record's board starts as: a copy of a template, or empty under a name.
export const boardStart = z.union([
  z.strictObject({ templateId: z.uuid() }),
  boardInput,
]);
export type BoardStart = z.infer<typeof boardStart>;

export const boardIcon = z.strictObject({
  boardId: z.uuid(),
  icon: workflowIcon.nullable(),
});
export type BoardIcon = z.infer<typeof boardIcon>;

export const boardStar = z.strictObject({
  id: z.uuid(),
  starred: z.enum(["0", "1"]),
});

// What a box can carry: links and uploaded files.
export const MAX_BOARD_ATTACHMENTS = 50;
export const UPLOADS_PER_MINUTE = 30;
export const MAX_ATTACHMENT_TITLE = 200;

// The box of a board that a link or a file goes on.
export const boxRef = z.strictObject({
  boardId: z.uuid(),
  elementId: z.string().min(1).max(100),
});
export type BoxRef = z.infer<typeof boxRef>;

// A link left without a name goes by its site's.
export const boxLink = z.strictObject({
  title: blankToNull(text(MAX_ATTACHMENT_TITLE)),
  url: httpUrl,
});
export type BoxLink = z.infer<typeof boxLink>;

export const attachmentRef = z.strictObject({
  boardId: z.uuid(),
  attachmentId: z.uuid(),
});
export type AttachmentRef = z.infer<typeof attachmentRef>;

// Notes left on the boxes of a board, as plain text.
export const MAX_BOARD_NOTES = 200;

export const noteBody = z
  .string()
  .trim()
  .min(1, "Write something in the note first.")
  .max(MAX_NOTE_LENGTH, `A note can be at most ${MAX_NOTE_LENGTH} characters.`);

export const noteRef = z.strictObject({
  boardId: z.uuid(),
  noteId: z.uuid(),
});
export type NoteRef = z.infer<typeof noteRef>;

// Pictures drawn on a board, each kept once however many elements show it.
export const MAX_BOARD_PICTURES = 100;
export const PICTURES_PER_MINUTE = 60;

// The whiteboard's own id for a picture: a hash of the file as it was added.
const pictureKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const pictureRef = z.strictObject({ boardId: z.uuid(), key: pictureKey });
export type PictureRef = z.infer<typeof pictureRef>;

// One element of a drawing. What the server reads or what could do harm is
// checked; the rest (where it is, how it is drawn) is the whiteboard's own and
// only ever goes back to it, so it is kept as it came.
export const drawnElement = z.looseObject({
  id: z.string().min(1).max(100),
  type: z.enum(ELEMENT_TYPES),
  // The picture an element shows, looked for among its board's own and nowhere else.
  fileId: pictureKey.nullish(),
  // A link that is not a web address is dropped, not refused: the whiteboard
  // lets one be typed, and it must not stop the rest of the drawing saving.
  link: z
    .unknown()
    .transform((link) =>
      httpUrl.safeParse(link).success ? (link as string) : null,
    )
    .optional(),
});

// The whiteboard sends a picture only once its bytes are stored under its id.
export const showsStoredPicture = ({
  type,
  fileId,
}: {
  type: string;
  fileId?: string | null;
}) => type !== "image" || Boolean(fileId);

const element = drawnElement
  .extend({
    customData: z
      .strictObject({
        stage: z
          .strictObject({
            status: z.enum(STAGE_STATUSES),
            // What a stage made of handwriting is called: its box holds no text.
            name: z.string().trim().min(1).max(MAX_STAGE_NAME).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .refine(showsStoredPicture);
export type SceneElement = z.infer<typeof element>;

export const sceneSave = z.strictObject({
  // The version the drawing was loaded at.
  version: z.number().int().min(1),
  elements: z.array(element).max(MAX_ELEMENTS),
});
export type SceneSave = z.infer<typeof sceneSave>;
