// Run by the owner, by hand, to choose the assistant's models: each model named gets the
// same requests, and the script says which answered and which called a tool when it
// should. Uses the owner's own free requests (one per case per model) and no record.
//
//   OPENROUTER_API_KEY=sk-or-... pnpm models:try google/gemma-4-31b-it:free other/model:free
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { keyStatus } from "../src/ai/openrouter";

// Made-up rows: no real client data leaves this machine.
const TASKS = [
  { title: "Send the proposal to Maple Studio", due: "2030-03-04" },
  { title: "Call Harbor Bakery about the invoice", due: "2030-03-05" },
];
const PAID = { month: "February 2030", received: "₹1,20,000" };

const tools = {
  listTasks: tool({
    description: "The owner's open tasks with their due dates.",
    inputSchema: z.object({}),
    execute: async () => TASKS,
  }),
  revenueThisMonth: tool({
    description: "Money received this month, in the owner's base currency.",
    inputSchema: z.object({}),
    execute: async () => PAID,
  }),
  searchRecords: tool({
    description: "Find companies and people by name.",
    inputSchema: z.object({ query: z.string().min(2) }),
    execute: async ({ query }) =>
      query.toLowerCase().includes("maple")
        ? [{ kind: "company", name: "Maple Studio", lastActivity: "2030-02-20" }]
        : [],
  }),
};
type ToolName = keyof typeof tools;

const CASES: { ask: string; tool: ToolName | null; expect: RegExp }[] = [
  { ask: "What's on my task list?", tool: "listTasks", expect: /maple|harbor/i },
  { ask: "How much money came in this month?", tool: "revenueThisMonth", expect: /1,20,000|120,000|1\.2/ },
  { ask: "When did I last talk to Maple Studio?", tool: "searchRecords", expect: /2030-02-20|20 feb|february 20/i },
  { ask: "Write a two-line thank-you note to a client.", tool: null, expect: /thank/i },
  { ask: "Suggest one way to follow up on an unpaid invoice, in one sentence.", tool: null, expect: /\w/ },
];

const apiKey = process.env.OPENROUTER_API_KEY;
const models = process.argv.slice(2);
if (!apiKey || models.length === 0) {
  console.error("Set OPENROUTER_API_KEY and name at least one free model.");
  process.exit(1);
}
const status = await keyStatus(apiKey);
if (!status.ok) {
  console.error(`OpenRouter: ${status.reason}.`);
  process.exit(1);
}
const needed = models.length * CASES.length;
if (status.daily && status.daily.remaining < needed) {
  console.error(`${needed} requests needed, ${status.daily.remaining} left today.`);
  process.exit(1);
}

const openrouter = createOpenRouter({ apiKey, compatibility: "strict" });
for (const model of models) {
  console.log(`\n${model}`);
  let passed = 0;
  for (const { ask, tool: wanted, expect } of CASES) {
    const started = Date.now();
    try {
      const result = await generateText({
        model: openrouter.chat(model),
        instructions: "You help a solo business owner. Use a tool when the answer is in their records. Answer in plain text.",
        prompt: ask,
        tools,
        stopWhen: stepCountIs(3),
        maxRetries: 0,
        timeout: 60_000,
      });
      const called = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
      const ok = (wanted ? called.includes(wanted) : called.length === 0) && expect.test(result.text);
      if (ok) passed += 1;
      console.log(
        `  ${ok ? "pass" : "FAIL"}  ${ask}  (tools: ${called.join(", ") || "none"}, ${Date.now() - started} ms)`,
      );
      if (!ok) console.log(`        ${result.text.replace(/\s+/g, " ").slice(0, 160)}`);
    } catch (error) {
      console.log(`  FAIL  ${ask}  (${error instanceof Error ? error.name : "error"})`);
    }
  }
  console.log(`  ${passed} of ${CASES.length}`);
}
