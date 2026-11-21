import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  findRecords,
  meetingsIn,
  MEETING_SPANS,
  moneySummary,
  recordHistory,
  reportsSummary,
  TASK_SCOPES,
  tasksDue,
  type Found,
  type ReadContext,
  type RecordLink,
  UNTRUSTED_NOTE,
} from "@/modules/assistant/read";
import type { AiActionTool } from "@/db/schema";
import {
  actionInputs,
  markUntrusted,
  propose,
  type ActionCard,
  type ActionContext,
} from "@/modules/assistant/actions";
import { PERIODS } from "@/modules/revenue/period";

// Each request loads only the groups its words call for, chosen here with no model call,
// so a question costs no more than it needs. Only the actions group changes anything,
// and only through src/modules/assistant/actions.ts.
export const TOOL_GROUPS = ["records", "tasks", "meetings", "money", "actions"] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

const WORDS: Record<ToolGroup, RegExp> = {
  records:
    /\b(who|whom|when|last|talk(ed)?|spoke|spoken|contact(s|ed)?|compan(y|ies)|client(s)?|customer(s)?|person|people|lead(s)?|history|activit(y|ies)|note(s)?|find|search|look up|invoice(s)?|material(s)?|proposal(s)?)\b/,
  tasks:
    /\b(task(s)?|to-?do(s)?|follow(-| )?up(s)?|due|overdue|remind(er|ers)?|focus|priorit(y|ies|ise|ize)|plan|deadline(s)?)\b/,
  meetings:
    /\b(meeting(s)?|meet|call(s)?|calendar|schedule(d)?|agenda|today|tomorrow|this week|next week|appointment(s)?)\b/,
  money:
    /\b(money|revenue|income|earn(ed|ings)?|paid|pay(ment|ments)?|invoice(s|d)?|owe(d|s)?|outstanding|receiv(e|ed)|cash|bill(ed|ing)?|report(s)?|rate|conversion|accept(ed|ance)?|repl(y|ies|ied)|best client(s)?|top client(s)?|month|quarter|year)\b/,
  actions:
    /\b(add|create|remind me|note( down)?|jot|log|schedule|book|set up|arrange|move|reschedule|postpone|push( it)? back|cancel|call off)\b/,
};

// A name typed with a capital after the first word ("When did I last see Komal?") is
// likely a record, whatever else the message says.
const NAMED = /\s[A-Z][\p{L}'-]+/u;

export function groupsFor(message: string): ToolGroup[] {
  const words = message.toLowerCase();
  const groups = TOOL_GROUPS.filter((group) => WORDS[group].test(words));
  if (!groups.includes("records") && NAMED.test(message)) groups.unshift("records");
  // An action names people and meetings by the ids the read tools give.
  if (groups.includes("actions") && !groups.includes("records")) groups.unshift("records");
  if (
    groups.includes("actions") &&
    /\b(move|reschedule|postpone|push|cancel|call off)\b/.test(words) &&
    !groups.includes("meetings")
  ) {
    groups.push("meetings");
  }
  // Planning the day reads both.
  if (groups.includes("tasks") && /\b(focus|today|plan)\b/.test(words) && !groups.includes("meetings")) {
    groups.push("meetings");
  }
  return groups;
}

export type ToolUse = { links: RecordLink[]; looked: string[]; cards: ActionCard[] };

const period = z.enum(PERIODS).describe("The period, this-month if none is named.");

const WAITS =
  "Not done yet: a card under your reply asks the owner to confirm it. Tell them what will happen and that it waits for their tap. Never say it is done.";
const DONE = "Done. The owner can undo it from the card under your reply.";

// The tools of the groups named, each reading as this owner and keeping the records it
// used, so the answer can link to them.
export function toolsFor(
  context: ReadContext,
  groups: readonly ToolGroup[],
  use: ToolUse,
  act: ActionContext,
): ToolSet {
  const kept =
    <I,>(label: string, read: (input: I) => Promise<Found<unknown>>) =>
    async (input: I) => {
      use.looked.push(label);
      const found = await read(input);
      use.links.push(...found.links);
      if ((found.data as { note?: string }).note === UNTRUSTED_NOTE && !act.untrusted) {
        act.untrusted = true;
        await markUntrusted(act.ownerId, act.conversationId);
      }
      return found.data;
    };

  const acting = (tool: AiActionTool) => async (input: unknown) => {
    const proposed = await propose(act, tool, input);
    if (!proposed.ok) return { done: false, problem: proposed.message };
    use.cards.push(proposed.card);
    const { status, summary } = proposed.card;
    return { done: status === "done", what: summary, note: status === "done" ? DONE : WAITS };
  };

  const all: Record<ToolGroup, ToolSet> = {
    records: {
      findRecords: tool({
        description:
          "Find the owner's companies, people, tasks, invoices, materials and logged activities by a name or words. Returns ids for recordHistory.",
        inputSchema: z.object({ query: z.string().trim().min(2).max(100) }),
        execute: kept("records", ({ query }) => findRecords(context, query)),
      }),
      recordHistory: tool({
        description:
          "What happened with one company or person, newest first: calls, emails logged, meetings, materials sent. Use an id from findRecords.",
        inputSchema: z.object({
          kind: z.enum(["company", "person"]),
          id: z.uuid(),
        }),
        execute: kept("a record's history", (record) => recordHistory(context, record)),
      }),
    },
    tasks: {
      tasksDue: tool({
        description: "The owner's open tasks: overdue, due today, due in the next 7 days, or all open.",
        inputSchema: z.object({ scope: z.enum(TASK_SCOPES) }),
        execute: kept("tasks", ({ scope }) => tasksDue(context, scope)),
      }),
    },
    meetings: {
      meetings: tool({
        description: "The owner's meetings from their Google Calendar.",
        inputSchema: z.object({ span: z.enum(MEETING_SPANS) }),
        execute: kept("meetings", ({ span }) => meetingsIn(context, span)),
      }),
    },
    money: {
      moneySummary: tool({
        description:
          "Money received, invoiced in a period, and what clients owe today, in the owner's currency. Quote the figures as given; never add them up yourself.",
        inputSchema: z.object({ period }),
        execute: kept("money", ({ period }) => moneySummary(context, period)),
      }),
      reports: tool({
        description:
          "Top clients by money received, days from invoice to paid, follow-ups done on time, reply rate and proposal acceptance, each with what it counts.",
        inputSchema: z.object({ period }),
        execute: kept("reports", ({ period }) => reportsSummary(context, period)),
      }),
    },
    actions: {
      addTask: tool({
        description:
          "Add a task or a reminder to the owner's list. dueDate is YYYY-MM-DD, dueTime HH:MM and remindAt YYYY-MM-DDTHH:MM, in the owner's own time. Link a person or company only by an id from findRecords.",
        inputSchema: actionInputs.addTask,
        execute: acting("addTask"),
      }),
      addNote: tool({
        description:
          "Add a note to a person's or a company's activity, by an id from findRecords. title is a short summary, body the rest.",
        inputSchema: actionInputs.addNote,
        execute: acting("addNote"),
      }),
      scheduleMeeting: tool({
        description:
          "Ask to put a meeting on the owner's Google Calendar and invite people, by ids from findRecords. Times are YYYY-MM-DDTHH:MM in the owner's own time. It waits for the owner to confirm.",
        inputSchema: actionInputs.scheduleMeeting,
        execute: acting("scheduleMeeting"),
      }),
      moveMeeting: tool({
        description:
          "Ask to move a meeting the owner organized to a new start and end, by an id from the meetings tool. It waits for the owner to confirm.",
        inputSchema: actionInputs.moveMeeting,
        execute: acting("moveMeeting"),
      }),
      cancelMeeting: tool({
        description:
          "Ask to cancel a meeting the owner organized, by an id from the meetings tool. It waits for the owner to confirm.",
        inputSchema: actionInputs.cancelMeeting,
        execute: acting("cancelMeeting"),
      }),
    },
  };
  return Object.assign({}, ...groups.map((group) => all[group]));
}

// The records an answer names, once each, in the order it used them.
export function linksIn(text: string, links: RecordLink[], max = 10) {
  const said = text.toLowerCase();
  const seen = new Set<string>();
  return links
    .filter(({ href, label }) => {
      if (seen.has(href) || !said.includes(label.toLowerCase())) return false;
      seen.add(href);
      return true;
    })
    .slice(0, max);
}
