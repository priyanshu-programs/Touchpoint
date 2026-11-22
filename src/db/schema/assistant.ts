import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, ownerId, tsvector, updatedAt } from "./columns";
import { contacts, organizations } from "./people";

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
  // Answers anything holding Google data (calendar, later Gmail): Google forbids letting a
  // provider train on it, so those requests only go to providers that keep nothing. Any
  // model, paid ones too, since free ones rarely qualify. Null: the main model, which
  // usually means such requests can't be answered.
  privateModel: text("private_model"),
  // When the nightly tidy last merged duplicate memories; it runs again only after 10 more.
  memoriesTidiedAt: timestamp("memories_tidied_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    ownerId: ownerId(),
    title: text("title").notNull(),
    // Set once a tool in this chat has read text a stranger could have written (a
    // calendar invite). From then on, even a task or a note waits for the owner's tap.
    readUntrustedAt: timestamp("read_untrusted_at", { withTimezone: true }),
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

// Links are built by the server from the records the tools read, never by a model.
export type AiMessagePart =
  | { type: "text"; text: string }
  | { type: "links"; links: { href: string; label: string }[] }
  | { type: "actions"; ids: string[] };

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

export const AI_ACTION_TOOLS = [
  "addTask",
  "addNote",
  "saveMemory",
  "scheduleMeeting",
  "moveMeeting",
  "cancelMeeting",
] as const;
export type AiActionTool = (typeof AI_ACTION_TOOLS)[number];

// undo: runs at once and shows a card with Undo. confirm: waits for the owner's tap.
export const AI_ACTION_TIERS = ["undo", "confirm"] as const;
export type AiActionTier = (typeof AI_ACTION_TIERS)[number];

export const AI_ACTION_STATUSES = ["waiting", "running", "done", "declined", "undone"] as const;
export type AiActionStatus = (typeof AI_ACTION_STATUSES)[number];

// Every change the assistant asks for. A model can only add a row: whether it runs is
// decided here by its tier, and a waiting row runs only from the owner's press.
export const aiToolExecutions = pgTable(
  "ai_tool_executions",
  {
    id: id(),
    ownerId: ownerId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    tool: text("tool").$type<AiActionTool>().notNull(),
    tier: text("tier").$type<AiActionTier>().notNull(),
    status: text("status").$type<AiActionStatus>().notNull(),
    // The input as checked by the server, run as is on the owner's press.
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    // What will happen, or happened, written by the server, never by the model.
    summary: text("summary").notNull(),
    // The record it made, for Open and Undo.
    resultId: uuid("result_id"),
    // Why the last press didn't go through, in this app's words.
    problem: text("problem"),
    createdAt,
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    check("ai_tool_executions_tool_check", oneOf(table.tool, AI_ACTION_TOOLS)),
    check("ai_tool_executions_tier_check", oneOf(table.tier, AI_ACTION_TIERS)),
    check("ai_tool_executions_status_check", oneOf(table.status, AI_ACTION_STATUSES)),
    index("ai_tool_executions_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

// you: the owner and how their business runs, always given to the model. person and
// company: given when a message names that record, and deleted with it.
export const AI_MEMORY_SCOPES = ["you", "person", "company"] as const;
export type AiMemoryScope = (typeof AI_MEMORY_SCOPES)[number];

export const AI_MEMORY_SOURCES = ["ai", "user"] as const;
export type AiMemorySource = (typeof AI_MEMORY_SOURCES)[number];

export const MEMORY_MAX_LENGTH = 500;
export const MEMORY_TERMS_MAX_LENGTH = 200;

export const aiMemories = pgTable(
  "ai_memories",
  {
    id: id(),
    ownerId: ownerId(),
    scope: text("scope").$type<AiMemoryScope>().notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull(),
    // Other words the owner might use to ask about it, saved by the model with it.
    terms: text("terms"),
    source: text("source").$type<AiMemorySource>().notNull(),
    // English stems the memory's own words; simple keeps the extra terms as typed.
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('english', "ai_memories"."content") || to_tsvector('simple', coalesce("ai_memories"."terms", ''))`,
    ),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("ai_memories_scope_check", oneOf(table.scope, AI_MEMORY_SCOPES)),
    check("ai_memories_source_check", oneOf(table.source, AI_MEMORY_SOURCES)),
    check(
      "ai_memories_record_check",
      sql`(${table.scope} = 'you' and ${table.contactId} is null and ${table.organizationId} is null)
        or (${table.scope} = 'person' and ${table.contactId} is not null and ${table.organizationId} is null)
        or (${table.scope} = 'company' and ${table.organizationId} is not null and ${table.contactId} is null)`,
    ),
    check(
      "ai_memories_length_check",
      sql`char_length(${table.content}) between 1 and ${sql.raw(String(MEMORY_MAX_LENGTH))}
        and char_length(coalesce(${table.terms}, '')) <= ${sql.raw(String(MEMORY_TERMS_MAX_LENGTH))}`,
    ),
    index("ai_memories_owner_scope_idx").on(table.ownerId, table.scope, table.createdAt),
    index("ai_memories_contact_idx").on(table.contactId),
    index("ai_memories_organization_idx").on(table.organizationId),
    index("ai_memories_search_idx").using("gin", table.search),
    index("ai_memories_content_trgm_idx").using("gin", table.content.op("gin_trgm_ops")),
  ],
);
