import { APICallError } from "ai";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { aiConversations, aiMessages, settings } from "@/db/schema";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { beginChat, MESSAGES_PER_MINUTE, problemMessage, reply, titleOf } from "./chat";
import {
  deleteConversation,
  getConversation,
  listConversations,
  MAX_MESSAGES,
} from "./conversations";
import { chatInput } from "./schema";
import { saveAssistantKey } from "./service";

const openrouter = vi.hoisted(() => ({ streamReply: vi.fn(), keyStatus: vi.fn() }));
vi.mock("@/ai/openrouter", async (actual) => ({
  ...(await actual<typeof import("@/ai/openrouter")>()),
  ...openrouter,
}));

const KEY = "sk-or-v1-0123456789abcdefWXYZ";
const DAILY = { used: 1, limit: 50, remaining: 49 };

// What streamText hands back, as far as reply() reads it.
function streamed(parts: unknown[]) {
  return {
    stream: (async function* () {
      for (const part of parts) yield part;
    })(),
    response: Promise.resolve({ modelId: "google/gemma-4-31b-it:free" }),
  };
}

const finish = {
  type: "finish",
  totalUsage: { inputTokens: 40, outputTokens: 7 },
};

async function collect(events: AsyncGenerator<unknown>) {
  const all = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("chat", () => {
  let owner: { id: string; name: string };
  beforeEach(async () => {
    await resetDatabase();
    owner = { id: await createTestOwner(), name: "Test Owner" };
    await db.insert(settings).values({
      ownerId: owner.id,
      baseCurrency: "INR",
      timezone: "Asia/Kolkata",
      preferredName: "Priya",
    });
    await saveAssistantKey(owner.id, KEY);
    openrouter.streamReply.mockReset();
    openrouter.keyStatus.mockReset().mockResolvedValue({ ok: true, daily: DAILY });
  });

  it("refuses without a key and writes nothing", async () => {
    const other = await createTestOwner("other@example.com");
    expect(await beginChat({ id: other, name: "Other" }, { message: "Hi" })).toEqual({
      ok: false,
      reason: "no_key",
    });
    expect(await db.$count(aiConversations)).toBe(0);
  });

  it("keeps the question and the streamed answer in a new chat", async () => {
    openrouter.streamReply.mockReturnValue(
      streamed([
        { type: "text-delta", text: "Hello " },
        { type: "text-delta", text: "Priya." },
        finish,
      ]),
    );
    const begun = await beginChat(owner, chatInput.parse({ message: "  Say hello\n to me  " }));
    if (!begun.ok) throw new Error(begun.reason);
    expect(begun.turn.instructions).toContain("Priya");
    expect(begun.turn.history).toEqual([{ role: "user", content: "Say hello\n to me" }]);

    const events = await collect(reply(begun.turn, new AbortController().signal));
    expect(events).toEqual([
      { type: "start", conversationId: begun.turn.conversationId, title: "Say hello to me" },
      { type: "text", text: "Hello " },
      { type: "text", text: "Priya." },
      { type: "done", daily: DAILY },
    ]);
    expect(openrouter.streamReply.mock.calls[0][0]).toMatchObject({
      apiKey: KEY,
      mainModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    });

    const chat = await getConversation(owner.id, begun.turn.conversationId);
    expect(chat?.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "Say hello\n to me" },
      { role: "assistant", text: "Hello Priya." },
    ]);
    const [answer] = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.role, "assistant"));
    expect(answer).toMatchObject({
      model: "google/gemma-4-31b-it:free",
      inputTokens: 40,
      outputTokens: 7,
    });
  });

  it("lets a follow-up use the tools the chat's questions called for", async () => {
    openrouter.streamReply.mockReturnValue(
      streamed([{ type: "text-delta", text: "Done" }, finish]),
    );
    const first = await beginChat(owner, { message: "What are my tasks for today" });
    if (!first.ok) throw new Error(first.reason);
    expect(first.turn.groups).toContain("tasks");
    await collect(reply(first.turn, new AbortController().signal));

    const again = await beginChat(owner, {
      conversationId: first.turn.conversationId,
      message: "Try again",
    });
    if (!again.ok) throw new Error(again.reason);
    expect(again.turn.groups).toContain("tasks");

    const fresh = await beginChat(owner, { message: "Try again" });
    if (!fresh.ok) throw new Error(fresh.reason);
    expect(fresh.turn.groups).toEqual([]);
  });

  it("sends the chat so far with the next message", async () => {
    openrouter.streamReply.mockReturnValue(
      streamed([{ type: "text-delta", text: "First answer" }, finish]),
    );
    const first = await beginChat(owner, { message: "First" });
    if (!first.ok) throw new Error(first.reason);
    await collect(reply(first.turn, new AbortController().signal));

    const second = await beginChat(owner, {
      conversationId: first.turn.conversationId,
      message: "Second",
    });
    if (!second.ok) throw new Error(second.reason);
    expect(second.turn.history).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second" },
    ]);
  });

  it("never opens another owner's chat", async () => {
    const [theirs] = await db
      .insert(aiConversations)
      .values({ ownerId: await createTestOwner("other@example.com"), title: "Theirs" })
      .returning();
    expect(
      await beginChat(owner, { conversationId: theirs.id, message: "Hi" }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await getConversation(owner.id, theirs.id)).toBeNull();
    expect(await deleteConversation(owner.id, theirs.id)).toBe(false);
    expect((await listConversations(owner.id)).total).toBe(0);
  });

  it(`refuses past ${MESSAGES_PER_MINUTE} messages a minute`, async () => {
    const [chat] = await db
      .insert(aiConversations)
      .values({ ownerId: owner.id, title: "Busy" })
      .returning();
    await db.insert(aiMessages).values(
      Array.from({ length: MESSAGES_PER_MINUTE }, () => ({
        ownerId: owner.id,
        conversationId: chat.id,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hi" }],
      })),
    );
    expect(await beginChat(owner, { message: "One more" })).toEqual({
      ok: false,
      reason: "rate",
    });
  });

  it("refuses a message to a full chat", async () => {
    const [chat] = await db
      .insert(aiConversations)
      .values({ ownerId: owner.id, title: "Full" })
      .returning();
    await db.insert(aiMessages).values(
      Array.from({ length: MAX_MESSAGES }, (_, index) => ({
        ownerId: owner.id,
        conversationId: chat.id,
        role: index % 2 ? ("assistant" as const) : ("user" as const),
        parts: [{ type: "text" as const, text: "Hi" }],
        createdAt: new Date(Date.now() - 3_600_000),
      })),
    );
    expect(await beginChat(owner, { conversationId: chat.id, message: "More" })).toEqual({
      ok: false,
      reason: "chat_full",
    });
  });

  it("keeps what arrived before a failure and says what happened in its own words", async () => {
    openrouter.streamReply.mockReturnValue(
      streamed([
        { type: "text-delta", text: "Half an" },
        {
          type: "error",
          error: new APICallError({
            message: "Upstream secret detail",
            url: "https://openrouter.ai/api/v1/chat/completions",
            requestBodyValues: {},
            statusCode: 429,
          }),
        },
      ]),
    );
    openrouter.keyStatus.mockResolvedValue({
      ok: true,
      daily: { used: 50, limit: 50, remaining: 0 },
    });
    const begun = await beginChat(owner, { message: "Hi" });
    if (!begun.ok) throw new Error(begun.reason);
    const events = await collect(reply(begun.turn, new AbortController().signal));
    const last = events.at(-1) as { type: string; message: string };
    expect(last.type).toBe("error");
    expect(last.message).toMatch(/^You've used all 50 of today's free requests/);
    expect(last.message).not.toContain("secret");

    const chat = await getConversation(owner.id, begun.turn.conversationId);
    expect(chat?.messages.at(-1)).toMatchObject({ role: "assistant", text: "Half an" });
  });

  it("keeps only the question when nothing came back", async () => {
    openrouter.streamReply.mockReturnValue(streamed([finish]));
    const begun = await beginChat(owner, { message: "Hi" });
    if (!begun.ok) throw new Error(begun.reason);
    const events = await collect(reply(begun.turn, new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ type: "error", message: "The model sent nothing back. Try again." });
    expect(await db.$count(aiMessages)).toBe(1);
  });

  it("deletes a chat with its messages, audited", async () => {
    openrouter.streamReply.mockReturnValue(
      streamed([{ type: "text-delta", text: "Yes" }, finish]),
    );
    const begun = await beginChat(owner, { message: "Hi" });
    if (!begun.ok) throw new Error(begun.reason);
    await collect(reply(begun.turn, new AbortController().signal));
    expect(await deleteConversation(owner.id, begun.turn.conversationId)).toBe(true);
    expect(await db.$count(aiMessages)).toBe(0);
  });
});

describe("chat wording", () => {
  it("titles a chat by its first message on one line", () => {
    expect(titleOf("  What\n\nshould I   do? ")).toBe("What should I do?");
    expect(titleOf("x".repeat(200))).toHaveLength(80);
  });

  it("says when free requests start again in the owner's zone", () => {
    expect(problemMessage("rejected", null, "UTC")).toMatch(/didn't accept your key/);
    expect(problemMessage("limit", { used: 3, limit: 50, remaining: 47 }, "UTC")).toMatch(
      /busy/,
    );
    expect(problemMessage("unavailable", null, "UTC")).toMatch(/couldn't be reached/);
  });
});
