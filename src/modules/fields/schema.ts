import { z } from "zod";
import { FIELD_ENTITY_TYPES } from "@/db/schema";

export { FIELD_ENTITY_TYPES };
export type EntityType = (typeof FIELD_ENTITY_TYPES)[number];

export const layoutInput = z
  .array(
    z.strictObject({ key: z.string().min(1).max(60), hidden: z.boolean() }),
  )
  .max(100)
  .refine(
    (fields) => new Set(fields.map(({ key }) => key)).size === fields.length,
    { message: "A field is listed twice" },
  );

export type LayoutInput = z.infer<typeof layoutInput>;
