import { z } from "zod";
import { AI_MEMORY_SCOPES, MEMORY_MAX_LENGTH, MEMORY_TERMS_MAX_LENGTH } from "@/db/schema";
import { text } from "@/lib/form";

const content = z
  .string()
  .trim()
  .min(1, "Write what to remember.")
  .max(MEMORY_MAX_LENGTH, `Keep it to ${MEMORY_MAX_LENGTH} characters.`);
const terms = text(MEMORY_TERMS_MAX_LENGTH);

export const memoryAddInput = z
  .strictObject({
    about: z.enum(AI_MEMORY_SCOPES),
    name: text(200),
    content,
    terms,
  })
  .refine((input) => input.about === "you" || input.name !== "", {
    message: "Type the name of the person or company it's about.",
  });

export const memoryEditInput = z.strictObject({
  id: z.uuid(),
  content,
  terms,
});

export const memoryIdInput = z.strictObject({ id: z.uuid() });

// Added from a person's or company's own Memory tab, so the record is known, not named.
export const memoryRecordAddInput = z.strictObject({
  about: z.enum(["person", "company"]),
  recordId: z.uuid(),
  content,
  terms,
});
