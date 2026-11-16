import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";

// Chosen by a test of real requests and changed in Settings; free models come and go.
export const DEFAULT_ASSISTANT_MODELS = {
  mainModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
  helperModel: "google/gemma-4-31b-it:free",
  backupModel: "thinkingmachines/inkling-2-small:free",
} as const;

// The owner's OpenRouter key, sealed with APP_ENCRYPTION_KEY and opened only to call
// a model, and the models the assistant uses.
export const aiSettings = pgTable("ai_settings", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  apiKeyEnc: text("api_key_enc"),
  keyVersion: integer("key_version"),
  mainModel: text("main_model").notNull().default(DEFAULT_ASSISTANT_MODELS.mainModel),
  helperModel: text("helper_model")
    .notNull()
    .default(DEFAULT_ASSISTANT_MODELS.helperModel),
  backupModel: text("backup_model")
    .notNull()
    .default(DEFAULT_ASSISTANT_MODELS.backupModel),
  createdAt,
  updatedAt,
});

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    ownerId: ownerId(),
    title: text("title").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("ai_conversations_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const AI_MESSAGE_ROLES = ["user", "assistant"] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export type AiMessagePart = { type: "text"; text: string };

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    ownerId: ownerId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<AiMessageRole>().notNull(),
    parts: jsonb("parts").$type<AiMessagePart[]>().notNull(),
    // What answered, for an assistant's message: the provider's own name for the model.
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt,
  },
  (table) => [
    check("ai_messages_role_check", oneOf(table.role, AI_MESSAGE_ROLES)),
    index("ai_messages_conversation_idx").on(table.conversationId, table.createdAt),
    // The chat limit counts an owner's recent messages.
    index("ai_messages_owner_created_idx").on(table.ownerId, table.createdAt),
    check(
      "ai_messages_tokens_check",
      sql`(${table.inputTokens} is null or ${table.inputTokens} >= 0) and (${table.outputTokens} is null or ${table.outputTokens} >= 0)`,
    ),
  ],
);
