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

// A brainstorm board has no stages, so of the whiteboard's own data only a
// sticky note's mark is kept: a box copied over from a workflow loses its stage
// mark rather than stopping the drawing from saving.
const INT4 = 2 ** 31;

const element = drawnElement
  .extend({
    // The whiteboard's own: a change to an element raises its version and
    // draws a new nonce, and of two copies the higher version is kept, or of
    // the same version the lower nonce.
    version: z.number().int().min(1).max(INT4 - 1),
    versionNonce: z.number().int().min(-INT4).max(INT4 - 1),
    isDeleted: z.boolean(),
  })
  .transform((drawn) => {
    const kept = { ...drawn };
    if ((drawn.customData as { sticky?: unknown } | undefined)?.sticky === true) {
      kept.customData = { sticky: true };
    } else {
      delete kept.customData;
    }
    return kept;
  })
  .refine(showsStoredPicture);

export type BrainstormElement = z.infer<typeof element>;

// What a board can hold. A save sends only what changed, so these are far past
// what one save could carry.
export const MAX_BOARD_ELEMENTS = 100_000;
export const MAX_BOARD_BYTES = 50_000_000;

// The elements changed on one device since it last saved, each named once.
export const brainstormElementsSave = z.strictObject({
  elements: z
    .array(element)
    .max(MAX_ELEMENTS)
    .refine((elements) => new Set(elements.map(({ id }) => id)).size === elements.length),
  // The board's clock as that device last saw it.
  since: z.number().int().min(0),
});
export type BrainstormElementsSave = z.infer<typeof brainstormElementsSave>;

// A device asks for what changed after the clock it last saw (0: the whole
// board), a page at a time from after the element it was given last.
export const brainstormChangesQuery = z.strictObject({
  since: z.coerce.number().int().min(0),
  after: z.string().min(1).max(100).optional(),
});
export type BrainstormChangesQuery = z.infer<typeof brainstormChangesQuery>;
