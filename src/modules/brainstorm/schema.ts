import { z } from "zod";
import { workflowIcon } from "@/modules/workflows/icons";
import {
  drawnElement,
  MAX_ELEMENTS,
  showsStoredPicture,
} from "@/modules/workflows/schema";

export { MAX_SCENE_BYTES } from "@/modules/workflows/schema";

export const MAX_BRAINSTORM_BOARDS = 200;
export const BRAINSTORM_PAGE_SIZE = 50;

export const brainstormName = z.strictObject({
  name: z.string().trim().min(1, "Give the board a name").max(100),
});
export type BrainstormName = z.infer<typeof brainstormName>;

export const brainstormIcon = z.strictObject({
  boardId: z.uuid(),
  icon: workflowIcon.nullable(),
});
export type BrainstormIcon = z.infer<typeof brainstormIcon>;

export const brainstormListParams = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});
export type BrainstormListParams = z.infer<typeof brainstormListParams>;

// A brainstorm board has no stages, so nothing of the whiteboard's own data is
// kept: a box copied over from a workflow loses its stage mark rather than
// stopping the drawing from saving.
const element = drawnElement
  .transform((drawn) => {
    const kept = { ...drawn };
    delete kept.customData;
    return kept;
  })
  .refine(showsStoredPicture);

export const brainstormSceneSave = z.strictObject({
  // The version the drawing was loaded at.
  version: z.number().int().min(1),
  elements: z.array(element).max(MAX_ELEMENTS),
});
export type BrainstormSceneSave = z.infer<typeof brainstormSceneSave>;
