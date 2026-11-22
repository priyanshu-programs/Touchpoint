import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { instructionsFor } from "@/ai/prompt";
import { db } from "@/db/client";
import {
  aiConversations,
  aiMemories,
  aiSettings,
  auditLog,
  contactOrganizations,
  contacts,
  jobs,
  organizations,
  settings,
} from "@/db/schema";
import { confirmAction, propose, tierOf, undoAction, type ActionContext } from "@/modules/assistant/actions";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { recallMemories, recordByName } from "./recall";
import {
  ALREADY,
  addMemory,
  companyMemories,
  deleteMemory,
  FULL,
  MEMORY_LIMIT,
  personMemories,
  updateMemory,
} from "./service";
import { checkedMerges, enqueueMemoryTidies, runMemoryTidy } from "./tidy";

const model = vi.hoisted(() => ({ askOnce: vi.fn() }));
vi.mock("@/ai/openrouter", async (actual) => ({
  ...(await actual<typeof import("@/ai/openrouter")>()),
  ...model,
}));
const assistant = vi.hoisted(() => ({ openAssistant: vi.fn() }));
vi.mock("@/modules/assistant/service", async (actual) => ({
  ...(await actual<typeof import("@/modules/assistant/service")>()),
  ...assistant,
}));

const you = (content: string) => ({
  scope: "you" as const,
  contactId: null,
  organizationId: null,
  content,
  terms: null,
});

describe("memory", () => {
  let ownerId: string;
  let context: ActionContext;
  let priya: string;
  let maple: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await db.insert(settings).values({ ownerId, timezone: "Asia/Kolkata", baseCurrency: "INR" });
    const [chat] = await db
      .insert(aiConversations)
      .values({ ownerId, title: "Test" })
      .returning({ id: aiConversations.id });
    context = { ownerId, timezone: "Asia/Kolkata", conversationId: chat.id, untrusted: false };
    [{ id: priya }] = await db
      .insert(contacts)
      .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
      .returning({ id: contacts.id });
    [{ id: maple }] = await db
      .insert(organizations)
      .values({ ownerId, name: "Maple Studio" })
      .returning({ id: organizations.id });
    model.askOnce.mockReset();
    assistant.openAssistant.mockReset();
  });

  it("saves at once with Undo, or waits for a tap once stranger text was read", async () => {
    expect(tierOf("saveMemory", false)).toBe("undo");
    expect(tierOf("saveMemory", true)).toBe("confirm");

    const saved = await propose(context, "saveMemory", {
      about: "person",
      name: "Priya",
      memory: "Prefers WhatsApp to email",
    });
    if (!saved.ok) throw new Error(saved.message);
    expect(saved.card).toMatchObject({
      status: "done",
      summary: "About Priya Sharma: Prefers WhatsApp to email",
      canUndo: true,
      href: "/settings/memory",
    });
    const [row] = await db.select().from(aiMemories);
    expect(row).toMatchObject({ scope: "person", contactId: priya, source: "ai" });
    expect(await db.$count(auditLog, eq(auditLog.action, "memory.create"))).toBe(1);

    expect(await undoAction(ownerId, saved.card.id)).toMatchObject({ status: "undone" });
    expect(await db.$count(aiMemories)).toBe(0);

    const waiting = await propose({ ...context, untrusted: true }, "saveMemory", {
      about: "you",
      memory: "Doesn't take calls on Fridays",
    });
    if (!waiting.ok) throw new Error();
    expect(waiting.card.status).toBe("waiting");
    expect(await db.$count(aiMemories)).toBe(0);
    expect(await confirmAction(ownerId, waiting.card.id)).toMatchObject({ status: "done" });
    expect(await db.$count(aiMemories, eq(aiMemories.scope, "you"))).toBe(1);
  });

  it("finds the record by the name used, and asks which when several match", async () => {
    expect(await recordByName(ownerId, "company", "maple studio")).toMatchObject({ ok: true, id: maple });
    expect(await recordByName(ownerId, "person", "Nobody Here")).toEqual({
      ok: false,
      message: 'No person called "Nobody Here" is in Touchpoint.',
    });
    await db.insert(contacts).values({ ownerId, firstName: "Priya", lastName: "Nair" });
    const several = await recordByName(ownerId, "person", "Priya");
    expect(several.ok).toBe(false);
    if (!several.ok) expect(several.message).toMatch(/^Several match "Priya": Priya (Nair|Sharma), Priya/);
    expect(await recordByName(ownerId, "person", "Priya Sharma")).toMatchObject({ ok: true, id: priya });

    const refused = await propose(context, "saveMemory", { about: "company", memory: "Pays late" });
    expect(refused).toEqual({ ok: false, message: "Give the company's name." });
  });

  it("refuses the same memory twice and more than the limit", async () => {
    expect(await addMemory(ownerId, you("Works from Pune"), "user")).toMatchObject({ ok: true });
    expect(await addMemory(ownerId, you("works  from pune"), "ai")).toEqual({ ok: false, message: ALREADY });
    expect(
      await propose(context, "saveMemory", { about: "you", memory: "Works from Pune" }),
    ).toEqual({ ok: false, message: ALREADY });

    await db.insert(aiMemories).values(
      Array.from({ length: MEMORY_LIMIT - 1 }, (_, index) => ({
        ownerId,
        ...you(`Fact ${index}`),
        source: "user" as const,
      })),
    );
    expect(await addMemory(ownerId, you("One more"), "user")).toEqual({ ok: false, message: FULL });
  });

  it("is deleted with its person or company", async () => {
    await addMemory(ownerId, { ...you("Pays late"), scope: "company", organizationId: maple }, "user");
    await addMemory(ownerId, { ...you("Likes calls"), scope: "person", contactId: priya }, "user");
    await db.delete(contacts).where(eq(contacts.id, priya));
    await db.delete(organizations).where(eq(organizations.id, maple));
    expect(await db.$count(aiMemories)).toBe(0);
  });

  it("gives a company its own memories, those about the people at it, and everyone at it", async () => {
    const people = await db
      .insert(contacts)
      .values([
        { ownerId, firstName: "Leo", lastName: "Park" },
        { ownerId, firstName: "Ana", lastName: "Gray", archivedAt: new Date() },
        { ownerId, firstName: "Kim", lastName: "Lee", archivedAt: new Date() },
        { ownerId, firstName: "Sam", lastName: "Elsewhere" },
      ])
      .returning({ id: contacts.id });
    const [leo, ana, kim, sam] = people.map(({ id }) => id);
    await db.insert(contactOrganizations).values(
      [priya, leo, ana, kim].map((contactId) => ({ ownerId, contactId, organizationId: maple })),
    );
    await addMemory(ownerId, { ...you("Pays late"), scope: "company", organizationId: maple }, "user");
    await addMemory(ownerId, { ...you("Likes calls"), scope: "person", contactId: priya }, "user");
    await addMemory(ownerId, { ...you("Left for a while"), scope: "person", contactId: ana }, "user");
    await addMemory(ownerId, { ...you("Not at Maple"), scope: "person", contactId: sam }, "user");
    await addMemory(ownerId, you("Works mornings"), "user");

    const { memories, people: shown } = await companyMemories(ownerId, maple);
    expect(memories.map(({ content }) => content).sort()).toEqual(["Left for a while", "Likes calls", "Pays late"]);
    // Kim is archived with nothing remembered, so isn't shown; Leo is, with nothing remembered.
    expect(shown.map(({ name }) => name)).toEqual(["Ana Gray", "Leo Park", "Priya Sharma"]);
    expect((await personMemories(ownerId, priya)).map(({ content }) => content)).toEqual(["Likes calls"]);

    const other = await createTestOwner("someone@example.com");
    expect(await companyMemories(other, maple)).toEqual({ memories: [], people: [] });
  });

  it("edits and deletes with an audit row each", async () => {
    const added = await addMemory(ownerId, you("Works from Pune"), "user");
    if (!added.ok) throw new Error();
    expect(await updateMemory(ownerId, added.id, { content: "Works from Mumbai", terms: "city" })).toEqual({
      ok: true,
    });
    expect(await deleteMemory(ownerId, added.id)).toBe(true);
    const actions = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.ownerId, ownerId));
    expect(actions.map(({ action }) => action).sort()).toEqual(["memory.create", "memory.delete", "memory.update"]);
  });

  it("recalls the owner's own, those on records named, and those sharing words or a near spelling", async () => {
    await addMemory(ownerId, you("Doesn't take calls on Fridays"), "user");
    await addMemory(ownerId, { ...you("Prefers WhatsApp to email"), scope: "person", contactId: priya }, "user");
    await addMemory(
      ownerId,
      { ...you("Their invoices go to the finance team"), scope: "company", organizationId: maple, terms: "billing" },
      "user",
    );

    const named = await recallMemories(ownerId, "What should I know before I call priya?");
    expect(named.map(({ content }) => content)).toEqual([
      "Doesn't take calls on Fridays",
      "Prefers WhatsApp to email",
    ]);
    expect(named[1]).toMatchObject({ scope: "person", name: "Priya Sharma" });

    expect((await recallMemories(ownerId, "who handles billing?")).map(({ content }) => content)).toContain(
      "Their invoices go to the finance team",
    );
    expect((await recallMemories(ownerId, "invoice question")).map(({ content }) => content)).toContain(
      "Their invoices go to the finance team",
    );
    expect((await recallMemories(ownerId, "who uses whatsap")).map(({ content }) => content)).toContain(
      "Prefers WhatsApp to email",
    );
    expect(await recallMemories(ownerId, "hello")).toHaveLength(1);

    const instructions = instructionsFor({
      name: "Asha",
      timezone: "Asia/Kolkata",
      groups: [],
      memories: named,
    });
    expect(instructions).toContain("- About Asha: Doesn't take calls on Fridays");
    expect(instructions).toContain("- About Priya Sharma (person): Prefers WhatsApp to email");
  });

  it("takes only merges inside one group, each note once", () => {
    const memories = [
      { id: "a", key: "you:1", content: "Works from Pune" },
      { id: "b", key: "you:1", content: "Based in Pune" },
      { id: "c", key: "person:2", content: "Lives in Pune" },
      { id: "d", key: "you:1", content: "Works in Pune" },
    ];
    const merges = checkedMerges(
      `Here you go: {"merges":[{"keep":1,"remove":[2],"text":"Works from Pune"},{"keep":4,"remove":[1],"text":"x"},{"keep":4,"remove":[3],"text":"y"},{"keep":9,"remove":[4],"text":"z"}]}`,
      memories,
    );
    expect(merges).toEqual([{ keep: memories[0], remove: [memories[1]], text: "Works from Pune" }]);
    expect(checkedMerges("no json here", memories)).toBeNull();
  });

  it("tidies at night once 10 are new: one request, merges logged, and not again the same night", async () => {
    await db.insert(aiSettings).values({ ownerId, apiKeyEnc: "sealed", keyVersion: 1 });
    await db.insert(aiMemories).values(
      Array.from({ length: 9 }, (_, index) => ({ ownerId, ...you(`Fact ${index}`), source: "user" as const })),
    );
    const night = new Date("2030-03-04T21:30:00Z"); // 03:00 in Kolkata
    await enqueueMemoryTidies(night);
    expect(await db.$count(jobs, eq(jobs.kind, "memory.tidy"))).toBe(0);

    await addMemory(ownerId, you("Works in Pune"), "ai");
    await enqueueMemoryTidies(new Date("2030-03-04T10:30:00Z")); // 16:00 in Kolkata
    expect(await db.$count(jobs, eq(jobs.kind, "memory.tidy"))).toBe(0);
    await enqueueMemoryTidies(night);
    const [job] = await db.select().from(jobs).where(eq(jobs.kind, "memory.tidy"));
    expect(job).toBeDefined();

    const [fact0] = await db.select().from(aiMemories).where(and(eq(aiMemories.ownerId, ownerId), eq(aiMemories.content, "Fact 0")));
    assistant.openAssistant.mockResolvedValue({
      state: "ready",
      apiKey: "sk-or-test",
      models: { mainModel: "m", helperModel: "h", backupModel: "b" },
    });
    model.askOnce.mockImplementation(async ({ prompt }: { prompt: string }) => {
      const number = (text: string) => prompt.split("\n").find((line) => line.endsWith(` ${text}`))!.split(".")[0];
      return JSON.stringify({
        merges: [{ keep: Number(number("Fact 0")), remove: [Number(number("Fact 1"))], text: "Facts 0 and 1" }],
      });
    });
    await runMemoryTidy({ ...job, payload: null });
    expect(model.askOnce).toHaveBeenCalledTimes(1);
    expect(model.askOnce.mock.calls[0][0]).toMatchObject({ model: "h", backupModel: "b" });
    const [kept] = await db.select().from(aiMemories).where(eq(aiMemories.id, fact0.id));
    expect(kept.content).toBe("Facts 0 and 1");
    expect(await db.$count(aiMemories)).toBe(9);
    expect(await db.$count(auditLog, eq(auditLog.action, "memory.merge"))).toBe(1);

    await db.delete(jobs);
    await enqueueMemoryTidies(night);
    expect(await db.$count(jobs, eq(jobs.kind, "memory.tidy"))).toBe(0);
  });
});
