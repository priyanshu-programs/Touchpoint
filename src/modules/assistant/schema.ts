import { z } from "zod";

export const MAX_MESSAGE_CHARS = 4000;

export const assistantKeyInput = z.strictObject({
  apiKey: z
    .string()
    .trim()
    .regex(
      /^sk-or-[A-Za-z0-9_-]{16,200}$/,
      "That isn't an OpenRouter key. It starts with sk-or- and has no spaces.",
    ),
});

// A free model only, so a typed id can never spend money.
const modelId = z
  .string()
  .trim()
  .max(100, "That model id is too long.")
  .regex(
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*:free$/,
    "Enter a free model's id from OpenRouter, like google/gemma-4-31b-it:free.",
  );

// For anything holding Google data: any model, paid too, since few free ones keep nothing.
// Empty means the main model. Whether a provider keeps or trains on it, OpenRouter checks
// on every request (data_collection "deny"), so a wrong pick is refused, never leaked.
export const assistantPrivateModelInput = z.strictObject({
  privateModel: z
    .string()
    .trim()
    .max(100, "That model id is too long.")
    .regex(
      /^$|^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9-]+)?$/,
      "Enter a model's id from OpenRouter, like mistralai/mistral-small-3.2-24b-instruct.",
    ),
});

export const assistantModelsInput = z.strictObject({
  mainModel: modelId,
  helperModel: modelId,
  backupModel: modelId,
});
export type AssistantModels = z.infer<typeof assistantModelsInput>;

export const chatInput = z.strictObject({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  // Sent again after a reply broke off.
  retry: z.literal(true).optional(),
});
export type ChatInput = z.infer<typeof chatInput>;
