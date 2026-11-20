import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { ModelMessage } from "ai";
import {
  keyStatus,
  replyProblem,
  streamReply,
  type DailyUse,
  type ReplyProblem,
} from "@/ai/openrouter";
import { instructionsFor } from "@/ai/prompt";
import { groupsFor, linksIn, toolsFor, type ToolGroup, type ToolUse } from "@/ai/tools";
import { db } from "@/db/client";
import { aiConversations, aiMessages, user } from "@/db/schema";
import { callName } from "@/lib/greeting";
import { formatTime } from "@/lib/time";
import { getSettings } from "@/modules/settings/service";
import type { ActionCard } from "./actions";
import { MAX_CONVERSATIONS, MAX_MESSAGES, textOf } from "./conversations";
import type { AssistantModels, ChatInput } from "./schema";
import { readContext, type ReadContext, type RecordLink } from "./read";
import { openAssistant } from "./service";

// OpenRouter's own limit on free models.
export const MESSAGES_PER_MINUTE = 20;
// How much of a chat the model is sent with each message.
const HISTORY_MESSAGES = 20;
const TITLE_CHARS = 80;
// The message and the two questions before it choose which tools load.
const RECENT_QUESTIONS = 3;

export type ChatRefusal =
  | "no_key"
  | "unreadable"
  | "not_found"
  | "rate"
  | "too_many_chats"
  | "chat_full";

export type ChatEvent =
  | { type: "start"; conversationId: string; title: string }
  | { type: "looking"; at: string }
  | { type: "text"; text: string }
  | { type: "links"; links: RecordLink[] }
  | { type: "actions"; cards: ActionCard[] }
  | { type: "done"; daily: DailyUse | null }
  | { type: "error"; message: string; daily: DailyUse | null };

type Turn = {
  ownerId: string;
  conversationId: string;
  title: string;
  apiKey: string;
  models: AssistantModels;
  instructions: string;
  timezone: string;
  history: ModelMessage[];
  read: ReadContext;
  groups: ToolGroup[];
  // A tool in this chat has read text a stranger could have written.
  untrusted: boolean;
};

// What the panel says while a tool runs.
const LOOKING: Record<string, string> = {
  findRecords: "your records",
  recordHistory: "a record's history",
  tasksDue: "your tasks",
  meetings: "your meetings",
  moneySummary: "your money",
  reports: "your reports",
  addTask: "your tasks",
  addNote: "your records",
  scheduleMeeting: "your calendar",
  moveMeeting: "your calendar",
  cancelMeeting: "your calendar",
};

export function titleOf(message: string) {
  const line = message.replace(/\s+/g, " ").trim();
  return line.length > TITLE_CHARS ? `${line.slice(0, TITLE_CHARS - 1)}…` : line;
}

// Keeps the owner's message, in a new chat or one of their own, and gathers what the
// model call needs. Nothing is written when it is refused.
export async function beginChat(
  owner: { id: string; name: string },
  input: ChatInput,
): Promise<{ ok: false; reason: ChatRefusal } | { ok: true; turn: Turn }> {
  const assistant = await openAssistant(owner.id);
  if (assistant.state === "none") return { ok: false, reason: "no_key" };
  if (assistant.state === "unreadable") return { ok: false, reason: "unreadable" };
  const settings = await getSettings(owner.id);
  const timezone = settings?.timezone ?? "UTC";

  const kept = await db.transaction(async (tx) => {
    // Locked while counting, so two messages at once can't both slip under a limit.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner.id)).for("update");
    const recent = await tx.$count(
      aiMessages,
      and(
        eq(aiMessages.ownerId, owner.id),
        eq(aiMessages.role, "user"),
        gt(aiMessages.createdAt, sql`now() - interval '1 minute'`),
      ),
    );
    if (recent >= MESSAGES_PER_MINUTE) return "rate" as const;

    let conversation: { id: string; title: string; readUntrustedAt: Date | null };
    if (input.conversationId) {
      const [found] = await tx
        .select({
          id: aiConversations.id,
          title: aiConversations.title,
          readUntrustedAt: aiConversations.readUntrustedAt,
        })
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.ownerId, owner.id),
            eq(aiConversations.id, input.conversationId),
          ),
        );
      if (!found) return "not_found" as const;
      const held = await tx.$count(aiMessages, eq(aiMessages.conversationId, found.id));
      if (held >= MAX_MESSAGES) return "chat_full" as const;
      conversation = found;
    } else {
      const chats = await tx.$count(aiConversations, eq(aiConversations.ownerId, owner.id));
      if (chats >= MAX_CONVERSATIONS) return "too_many_chats" as const;
      [conversation] = await tx
        .insert(aiConversations)
        .values({ ownerId: owner.id, title: titleOf(input.message) })
        .returning({
          id: aiConversations.id,
          title: aiConversations.title,
          readUntrustedAt: aiConversations.readUntrustedAt,
        });
    }

    await tx.insert(aiMessages).values({
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "user",
      parts: [{ type: "text", text: input.message }],
    });
    await tx
      .update(aiConversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(aiConversations.id, conversation.id));

    const latest = await tx
      .select({ role: aiMessages.role, parts: aiMessages.parts })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(HISTORY_MESSAGES);
    return { conversation, latest: latest.reverse() };
  });
  if (typeof kept === "string") return { ok: false, reason: kept };

  // A model expects the first thing it reads to be the owner's.
  const from = kept.latest.findIndex((message) => message.role === "user");
  // A follow-up ("Try again", "and next week?") keeps what the chat was about.
  const groups = groupsFor(
    kept.latest
      .filter((message) => message.role === "user")
      .slice(-RECENT_QUESTIONS)
      .map(({ parts }) => textOf(parts))
      .join("\n"),
  );
  return {
    ok: true,
    turn: {
      ownerId: owner.id,
      conversationId: kept.conversation.id,
      title: kept.conversation.title,
      apiKey: assistant.apiKey,
      models: assistant.models,
      instructions: instructionsFor({
        name: callName(owner.name, settings?.preferredName ?? null),
        timezone,
        groups,
      }),
      timezone,
      read: await readContext(owner.id),
      groups,
      untrusted: kept.conversation.readUntrustedAt !== null,
      history: kept.latest
        .slice(from)
        .map(({ role, parts }) => ({ role, content: textOf(parts) })),
    },
  };
}

async function keepReply(
  turn: Turn,
  text: string,
  links: RecordLink[],
  cards: ActionCard[],
  answered: { model: string; inputTokens?: number; outputTokens?: number } | null,
) {
  await db.transaction(async (tx) => {
    await tx.insert(aiMessages).values({
      ownerId: turn.ownerId,
      conversationId: turn.conversationId,
      role: "assistant",
      parts: [
        { type: "text", text },
        ...(links.length ? [{ type: "links" as const, links }] : []),
        ...(cards.length ? [{ type: "actions" as const, ids: cards.map(({ id }) => id) }] : []),
      ],
      provider: "openrouter",
      model: answered?.model,
      inputTokens: answered?.inputTokens,
      outputTokens: answered?.outputTokens,
    });
    await tx
      .update(aiConversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(aiConversations.id, turn.conversationId));
  });
}

function nextUtcMidnight(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// This app's own sentence for a failure, never OpenRouter's.
export function problemMessage(
  problem: ReplyProblem | "empty",
  daily: DailyUse | null,
  timezone: string,
) {
  if (problem === "rejected") {
    return "OpenRouter didn't accept your key. Check it in Settings, under Assistant.";
  }
  if (problem === "limit" && daily?.remaining === 0) {
    return `You've used all ${daily.limit} of today's free requests. They start again at midnight UTC, ${formatTime(nextUtcMidnight(), timezone)} your time.`;
  }
  if (problem === "limit") {
    return "The free models are busy, or you've sent a lot in the last minute. Wait a minute and try again.";
  }
  if (problem === "empty") return "The model sent nothing back. Try again.";
  return "The model couldn't be reached. Try again in a moment.";
}

// The model's answer as it arrives. What has arrived is kept even when the reply is
// cut short, by a failure or by the owner closing the panel.
export async function* reply(turn: Turn, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  yield { type: "start", conversationId: turn.conversationId, title: turn.title };

  const use: ToolUse = { links: [], looked: [], cards: [] };
  const act = {
    ownerId: turn.ownerId,
    timezone: turn.timezone,
    conversationId: turn.conversationId,
    untrusted: turn.untrusted,
  };
  const result = streamReply({
    apiKey: turn.apiKey,
    mainModel: turn.models.mainModel,
    backupModel: turn.models.backupModel,
    instructions: turn.instructions,
    messages: turn.history,
    tools: turn.groups.length > 0 ? toolsFor(turn.read, turn.groups, use, act) : undefined,
    signal,
  });
  let text = "";
  let links: RecordLink[] = [];
  let problem: ReplyProblem | "empty" | null = null;
  let finished = false;
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        text += part.text;
        yield { type: "text", text: part.text };
      } else if (part.type === "tool-call") {
        yield { type: "looking", at: LOOKING[part.toolName] ?? "your records" };
      } else if (part.type === "finish") {
        finished = true;
        usage = part.totalUsage;
      } else if (part.type === "error") {
        problem = replyProblem(part.error);
        break;
      } else if (part.type === "abort") {
        problem = "unavailable";
      }
    }
  } finally {
    // An action taken is kept even when the model wrote nothing about it.
    if (text || use.cards.length > 0) {
      links = linksIn(text, use.links);
      await keepReply(
        turn,
        text,
        links,
        use.cards,
        finished ? { model: (await result.response).modelId, ...usage } : null,
      );
    }
  }
  if (!problem && !text && use.cards.length === 0) problem = "empty";
  if (links.length > 0) yield { type: "links", links };
  if (use.cards.length > 0) yield { type: "actions", cards: use.cards };

  const status = await keyStatus(turn.apiKey);
  const daily = status.ok ? status.daily : null;
  yield problem
    ? { type: "error", message: problemMessage(problem, daily, turn.timezone), daily }
    : { type: "done", daily };
}
