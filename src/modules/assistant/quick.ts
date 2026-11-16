import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConversations, aiMessages, user } from "@/db/schema";
import { titleOf } from "./chat";
import { MAX_CONVERSATIONS, MAX_MESSAGES } from "./conversations";
import {
  meetingsIn,
  moneySummary,
  readContext,
  tasksDue,
  type ReadContext,
  type RecordLink,
} from "./read";

// One-tap questions, answered from the same reads as the tools with no model call, so
// they use none of the day's free requests.
export const QUICK_ASKS = {
  today: "What's on today?",
  due: "What's overdue or due today?",
  money: "How's money this month?",
} as const;
export type QuickAsk = keyof typeof QUICK_ASKS;

const listed = (lines: string[]) => lines.map((line) => `• ${line}`).join("\n");

async function answer(context: ReadContext, ask: QuickAsk) {
  if (ask === "today") {
    const found = await meetingsIn(context, "today");
    const { meetings } = found.data;
    if (!meetings) {
      return {
        text: "Google Calendar isn't connected, so I can't see your meetings. Connect it in Settings, under Integrations.",
        links: [],
      };
    }
    return {
      text:
        meetings.length === 0
          ? "No meetings today."
          : `${meetings.length === 1 ? "One meeting" : `${meetings.length} meetings`} today:\n${listed(
              meetings.map((meeting) => `${meeting.title}, ${meeting.when}`),
            )}`,
      links: found.links,
    };
  }
  if (ask === "due") {
    const found = await tasksDue(context, "today");
    const { tasks, count } = found.data;
    return {
      text:
        count === 0
          ? "Nothing is overdue or due today."
          : `${count === 1 ? "One task" : `${count} tasks`} overdue or due today:\n${listed(
              tasks.map(
                (task) =>
                  `${task.title}${task.overdue ? `, overdue since ${task.due}` : ""}${task.with ? ` (${task.with})` : ""}`,
              ),
            )}`,
      links: found.links,
    };
  }
  const { data, links } = await moneySummary(context, "this-month");
  const owed = data.owedToday
    .map((row) => (row.overdueInvoices > 0 ? `${row.amount}, ${row.overdue} of it overdue` : row.amount))
    .join(" and ");
  return {
    text: [
      `This month you've received ${data.received} from ${data.paymentsReceived === 1 ? "one payment" : `${data.paymentsReceived} payments`}.`,
      data.invoicedInPeriod.length > 0
        ? `You've invoiced ${data.invoicedInPeriod.map((row) => row.amount).join(" and ")}.`
        : "You haven't issued an invoice this month.",
      owed ? `Clients owe you ${owed} today.` : "Nobody owes you anything today.",
    ].join(" "),
    links,
  };
}

export type QuickRefusal = "not_found" | "too_many_chats" | "chat_full";

// The question and its answer, kept as a chat like any other.
export async function quickAnswer(
  ownerId: string,
  ask: QuickAsk,
  conversationId?: string,
): Promise<
  | { ok: false; reason: QuickRefusal }
  | { ok: true; conversationId: string; text: string; links: RecordLink[] }
> {
  const { text, links } = await answer(await readContext(ownerId), ask);
  const question = QUICK_ASKS[ask];

  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
    let id: string;
    if (conversationId) {
      const [found] = await tx
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(and(eq(aiConversations.ownerId, ownerId), eq(aiConversations.id, conversationId)));
      if (!found) return { ok: false, reason: "not_found" };
      if ((await tx.$count(aiMessages, eq(aiMessages.conversationId, found.id))) + 2 > MAX_MESSAGES) {
        return { ok: false, reason: "chat_full" };
      }
      id = found.id;
    } else {
      if ((await tx.$count(aiConversations, eq(aiConversations.ownerId, ownerId))) >= MAX_CONVERSATIONS) {
        return { ok: false, reason: "too_many_chats" };
      }
      [{ id }] = await tx
        .insert(aiConversations)
        .values({ ownerId, title: titleOf(question) })
        .returning({ id: aiConversations.id });
    }
    await tx.insert(aiMessages).values({
      ownerId,
      conversationId: id,
      role: "user",
      parts: [{ type: "text", text: question }],
    });
    // A second statement, so the answer sorts after the question.
    await tx.insert(aiMessages).values({
      ownerId,
      conversationId: id,
      role: "assistant",
      parts: [{ type: "text", text }, ...(links.length ? [{ type: "links" as const, links }] : [])],
      createdAt: sql`clock_timestamp()`,
    });
    await tx
      .update(aiConversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(aiConversations.id, id));
    return { ok: true, conversationId: id, text, links };
  });
}
