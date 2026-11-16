import { beforeEach, describe, expect, it } from "vitest";
import { groupsFor, linksIn } from "@/ai/tools";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  contactOrganizations,
  contacts,
  organizations,
  settings,
  tasks,
} from "@/db/schema";
import { addDays, dateIn } from "@/lib/time";
import { paymentInput } from "@/modules/payments/schema";
import { recordPayment } from "@/modules/payments/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getConversation } from "./conversations";
import { quickAnswer } from "./quick";
import {
  findRecords,
  meetingsIn,
  moneySummary,
  readContext,
  recordHistory,
  tasksDue,
  type ReadContext,
} from "./read";

describe("what the assistant can read", () => {
  let ownerId: string;
  let context: ReadContext;
  let maple: string;
  let priya: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await db.insert(settings).values({ ownerId, baseCurrency: "INR", timezone: "Asia/Kolkata" });
    context = await readContext(ownerId);
    [{ id: maple }] = await db
      .insert(organizations)
      .values({ ownerId, name: "Maple Studio", domain: "maple.example" })
      .returning({ id: organizations.id });
    [{ id: priya }] = await db
      .insert(contacts)
      .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
      .returning({ id: contacts.id });
    await db.insert(contactOrganizations).values({ ownerId, contactId: priya, organizationId: maple });
    const [{ id: call }] = await db
      .insert(activities)
      .values({
        ownerId,
        kind: "call",
        direction: "outbound",
        occurredAt: new Date("2026-10-15T09:00:00Z"),
        title: "Intro call",
        body: "Talked about the rebrand budget",
        organizationId: maple,
      })
      .returning({ id: activities.id });
    await db.insert(activityContacts).values({ ownerId, activityId: call, contactId: priya });
    await db.insert(tasks).values([
      { ownerId, title: "Chase the Maple invoice", dueOn: addDays(context.today, -2), organizationId: maple },
      { ownerId, title: "Send the proposal", dueOn: context.today },
      { ownerId, title: "Plan the workshop", dueOn: addDays(context.today, 3) },
      { ownerId, title: "Old task", status: "done", dueOn: addDays(context.today, -5) },
    ]);
  });

  it("finds records by name and links each to its own page", async () => {
    const found = await findRecords(context, "maple");
    expect(found.data.companies).toEqual([{ id: maple, name: "Maple Studio", domain: "maple.example" }]);
    expect(found.links).toContainEqual({
      href: `/people/organizations?company=${maple}`,
      label: "Maple Studio",
    });
    const person = await findRecords(context, "priya");
    expect(person.data.people).toEqual([{ id: priya, name: "Priya Sharma", companies: ["Maple Studio"] }]);
  });

  it("tells a record's history, and nothing of another owner's", async () => {
    const history = await recordHistory(context, { kind: "company", id: maple });
    expect(history.data).toMatchObject({
      name: "Maple Studio",
      history: [{ type: "call", title: "Intro call", people: ["Priya Sharma"] }],
    });
    expect(history.links).toEqual([
      { href: `/people/organizations?company=${maple}&tab=activity`, label: "Maple Studio" },
    ]);

    const other = await readContext(await createTestOwner("other@example.com"));
    expect(await recordHistory(other, { kind: "company", id: maple })).toEqual({
      data: { found: false },
      links: [],
    });
    expect((await findRecords(other, "maple")).data.companies).toEqual([]);
  });

  it("lists tasks by when they are due", async () => {
    const titles = async (scope: Parameters<typeof tasksDue>[1]) =>
      (await tasksDue(context, scope)).data.tasks.map((task) => task.title);
    expect(await titles("overdue")).toEqual(["Chase the Maple invoice"]);
    expect(await titles("today")).toEqual(["Chase the Maple invoice", "Send the proposal"]);
    expect(await titles("next_7_days")).toHaveLength(3);
    const today = await tasksDue(context, "today");
    expect(today.data.tasks[0]).toMatchObject({ overdue: true, with: "Maple Studio" });
    expect(today.links[0].href).toMatch(/^\/tasks\/[0-9a-f-]{36}$/);
  });

  it("shows no meetings without a Google connection", async () => {
    expect(await meetingsIn(context, "today")).toEqual({
      data: { calendar: "not connected" },
      links: [],
    });
  });

  it("gives money as the Money page sums it, already written out", async () => {
    const paid = await recordPayment(
      ownerId,
      paymentInput.parse({
        client: `organization:${maple}`,
        receivedOn: dateIn("Asia/Kolkata"),
        amount: "40,000",
        currency: "INR",
        rate: "",
        method: "bank_transfer",
        reference: "R-1",
        notes: "",
        idempotencyKey: crypto.randomUUID(),
        confirmDuplicate: "",
        allocations: "[]",
      }),
    );
    expect(paid.ok).toBe(true);
    const money = await moneySummary(context, "this-month");
    expect(money.data).toMatchObject({ received: "₹40,000", paymentsReceived: 1, owedToday: [] });
  });

  it("answers a one-tap question with no model and keeps it as a chat", async () => {
    const answered = await quickAnswer(ownerId, "due");
    if (!answered.ok) throw new Error(answered.reason);
    expect(answered.text).toMatch(/^2 tasks overdue or due today:\n• Chase the Maple invoice, overdue since .+ \(Maple Studio\)\n• Send the proposal$/);
    const chat = await getConversation(ownerId, answered.conversationId);
    expect(chat?.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "What's overdue or due today?" },
      { role: "assistant", text: answered.text },
    ]);
    expect(chat?.messages[1].links).toHaveLength(2);

    const other = await createTestOwner("other@example.com");
    expect(await quickAnswer(other, "due", answered.conversationId)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("which tools a message loads", () => {
  it("loads only the groups its words call for", () => {
    expect(groupsFor("Write me a haiku about rain")).toEqual([]);
    expect(groupsFor("What's overdue?")).toEqual(["tasks"]);
    expect(groupsFor("How much money came in this quarter?")).toEqual(["money"]);
    expect(groupsFor("Any meetings tomorrow?")).toEqual(["meetings"]);
    expect(groupsFor("When did I last talk to Maple Studio?")).toContain("records");
    expect(groupsFor("Has Komal replied")).toContain("records");
    expect(groupsFor("What should I focus on today?")).toEqual(["tasks", "meetings"]);
  });

  it("links only the records an answer names, once each", () => {
    const links = [
      { href: "/a", label: "Maple Studio" },
      { href: "/b", label: "Harbor Bakery" },
      { href: "/a", label: "Maple Studio" },
    ];
    expect(linksIn("Your last call with maple studio was in October.", links)).toEqual([
      { href: "/a", label: "Maple Studio" },
    ]);
  });
});
