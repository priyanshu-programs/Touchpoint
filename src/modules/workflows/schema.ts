import { z } from "zod";
import { STAGE_STATUSES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { httpUrl } from "@/lib/url";
import { ELEMENT_TYPES } from "./drawing";

export { STAGE_STATUSES };

export const MAX_TEMPLATES = 50;
export const MAX_ELEMENTS = 10_000;
export const MAX_SCENE_BYTES = 3_000_000;
export const MAX_BOARD_STAGES = 100;

export const boardInput = z.strictObject({
  name: z.string().trim().min(1, "Give the workflow a name").max(80),
  description: blankToNull(text(1000)),
});
export type BoardInput = z.infer<typeof boardInput>;

// One element of the drawing. What the server reads or what could do harm is
// checked; the rest (where it is, how it is drawn) is the whiteboard's own and
// only ever goes back to it, so it is kept as it came.
const element = z.looseObject({
  id: z.string().min(1).max(100),
  type: z.enum(ELEMENT_TYPES),
  // A link that is not a web address is dropped, not refused: the whiteboard
  // lets one be typed, and it must not stop the rest of the drawing saving.
  link: z
    .unknown()
    .transform((link) => (httpUrl.safeParse(link).success ? (link as string) : null))
    .optional(),
  customData: z
    .strictObject({
      stage: z.strictObject({ status: z.enum(STAGE_STATUSES) }).optional(),
    })
    .optional(),
});
export type SceneElement = z.infer<typeof element>;

export const sceneSave = z.strictObject({
  // The version the drawing was loaded at.
  version: z.number().int().min(1),
  elements: z.array(element).max(MAX_ELEMENTS),
});
export type SceneSave = z.infer<typeof sceneSave>;
