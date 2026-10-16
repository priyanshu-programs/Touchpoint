import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contacts, engagements, organizations } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  countCompanyEngagements,
  getEngagement,
  listCompanyEngagements,
  listEngagements,
} from "./queries";
import {
  engagementContactInput,
  engagementInput,
  MAX_ENGAGEMENT_CONTACTS,
  MAX_ENGAGEMENTS,
} from "./schema";
import {
  addEngagementContact,
  createEngagement,
  deleteEngagement,
  removeEngagementContact,
  setEngagementStatus,
  updateEngagement,
} from "./service";

const form = {
  organizationId: "",
  title: "Website redesign",
  status: "planned",
  currency: "INR",
  value: "",
  paymentTerms: "",
  startDate: "",
  targetEndDate: "",
  scope: "",
  objectives: "",
};
const input = (override: Partial<typeof form> = {}) =>
  engagementInput.parse({ ...form, ...override });

describe("engagementInput", () => {
  it("reads the value in the engagement's currency", () => {
    const id = crypto.randomUUID();
    expect(input({ organizationId: id })).toMatchObject({
      valueMinor: null,
      startDate: null,
      scope: null,
    });
    expect(input({ organizationId: id, value: "1,50,000" }).valueMinor).toBe(
      15_000_000,
    );
    expect(
      input({ organizationId: id, value: "2500", currency: "JPY" }).valueMinor,
    ).toBe(2500);
  });

  it.each([
    ["no company", {}],
    ["a missing title", { title: " " }],
    ["an unknown status", { status: "won" }],
    ["an unknown currency", { currency: "ABC" }],
    ["a value that is not an amount", { value: "lots" }],
    ["a negative value", { value: "-10" }],
    ["too many decimals for the currency", { value: "10.5", currency: "JPY" }],
    ["an end before the start", { startDate: "2026-11-02", targetEndDate: "2026-11-01" }],
    ["a date that does not exist", { startDate: "2026-02-30" }],
    ["an unexpected field", { valueMinor: "100" }],
  ])("rejects %s", (label, override) => {
    const organizationId = label === "no company" ? "" : crypto.randomUUID();
    expect(
      engagementInput.safeParse({ ...form, organizationId, ...override }).success,
    ).toBe(false);
  });

  it("takes a person and an optional role", () => {
    const contactId = crypto.randomUUID();
    expect(engagementContactInput.parse({ contactId, role: "" })).toEqual({
      contactId,
      role: null,
    });
    expect(
      engagementContactInput.safeParse({ contactId: "x", role: "" }).success,
    ).toBe(false);
  });
});

describe("engagements", () => {
  let ownerId: string;
  let organizationId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    [{ id: organizationId }] = await db
      .insert(organizations)
      .values({ ownerId, name: "Acme Design" })
      .returning({ id: organizations.id });
  });

  async function create(override: Partial<typeof form> = {}) {
    const result = await createEngagement(
      ownerId,
      input({ organizationId, ...override }),
    );
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  }

  it("creates, reads and audits an engagement", async () => {
    const id = await create({
      value: "150000",
      startDate: "2026-11-01",
      targetEndDate: "2027-01-20",
      scope: "Five pages and a blog",
    });
    const engagement = await getEngagement(ownerId, id);
    expect(engagement).toMatchObject({
      title: "Website redesign",
      organizationName: "Acme Design",
      status: "planned",
      valueMinor: 15_000_000,
      currency: "INR",
      startDate: "2026-11-01",
      targetEndDate: "2027-01-20",
      scope: "Five pages and a blog",
      contacts: [],
    });
    const entries = await listAudit(ownerId, { limit: 10 });
    expect(entries.rows.map((row) => row.action)).toContain("engagement.create");
  });

  it("refuses another owner's company", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    expect(
      await createEngagement(stranger, input({ organizationId })),
    ).toEqual({ ok: false, reason: "unknown_organization" });
    const id = await create();
    expect(
      await updateEngagement(stranger, id, input({ organizationId })),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await getEngagement(stranger, id)).toBeNull();
  });

  it("stops at the limit", async () => {
    await db.insert(engagements).values(
      Array.from({ length: MAX_ENGAGEMENTS }, (_, index) => ({
        ownerId,
        organizationId,
        title: `Job ${index}`,
        currency: "INR",
      })),
    );
    expect(await createEngagement(ownerId, input({ organizationId }))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("updates every field and moves it to another of the owner's companies", async () => {
    const id = await create();
    const [{ id: other }] = await db
      .insert(organizations)
      .values({ ownerId, name: "Inoya Rouge" })
      .returning({ id: organizations.id });
    expect(
      await updateEngagement(
        ownerId,
        id,
        input({
          organizationId: other,
          title: "Brand refresh",
          status: "active",
          currency: "USD",
          value: "4000.50",
          paymentTerms: "Net 15",
        }),
      ),
    ).toEqual({ ok: true, id });
    expect(await getEngagement(ownerId, id)).toMatchObject({
      title: "Brand refresh",
      organizationName: "Inoya Rouge",
      status: "active",
      currency: "USD",
      valueMinor: 400_050,
      paymentTerms: "Net 15",
    });
  });

  it("changes the status and audits only a real change", async () => {
    const id = await create();
    expect(await setEngagementStatus(ownerId, id, "active")).toBe(true);
    expect(await setEngagementStatus(ownerId, id, "active")).toBe(true);
    expect((await getEngagement(ownerId, id))?.status).toBe("active");
    const entries = await listAudit(ownerId, { limit: 10 });
    expect(
      entries.rows.filter((row) => row.action === "engagement.status"),
    ).toHaveLength(1);
    const stranger = await createTestOwner("stranger@example.com");
    expect(await setEngagementStatus(stranger, id, "paused")).toBe(false);
  });

  describe("people on an engagement", () => {
    let id: string;
    let contactId: string;

    beforeEach(async () => {
      id = await create();
      [{ id: contactId }] = await db
        .insert(contacts)
        .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
        .returning({ id: contacts.id });
    });

    it("adds a person with a role once, and removes them", async () => {
      expect(
        await addEngagementContact(ownerId, id, { contactId, role: "Sponsor" }),
      ).toEqual({ ok: true });
      expect(
        await addEngagementContact(ownerId, id, { contactId, role: null }),
      ).toEqual({ ok: false, reason: "already_added" });
      expect((await getEngagement(ownerId, id))?.contacts).toMatchObject([
        { id: contactId, fullName: "Priya Sharma", role: "Sponsor" },
      ]);

      expect(await removeEngagementContact(ownerId, id, contactId)).toBe(true);
      expect(await removeEngagementContact(ownerId, id, contactId)).toBe(false);
      expect((await getEngagement(ownerId, id))?.contacts).toEqual([]);
    });

    it("refuses another owner's person or engagement", async () => {
      const stranger = await createTestOwner("stranger@example.com");
      const [{ id: theirs }] = await db
        .insert(contacts)
        .values({ ownerId: stranger, firstName: "Sam", lastName: "Other" })
        .returning({ id: contacts.id });
      expect(
        await addEngagementContact(ownerId, id, { contactId: theirs, role: null }),
      ).toEqual({ ok: false, reason: "unknown_contact" });
      expect(
        await addEngagementContact(stranger, id, { contactId: theirs, role: null }),
      ).toEqual({ ok: false, reason: "not_found" });
      expect(await removeEngagementContact(stranger, id, contactId)).toBe(false);
    });

    it("holds at most the limit", async () => {
      const people = await db
        .insert(contacts)
        .values(
          Array.from({ length: MAX_ENGAGEMENT_CONTACTS }, (_, index) => ({
            ownerId,
            firstName: "Person",
            lastName: String(index),
          })),
        )
        .returning({ id: contacts.id });
      for (const person of people) {
        await addEngagementContact(ownerId, id, { contactId: person.id, role: null });
      }
      expect(
        await addEngagementContact(ownerId, id, { contactId, role: null }),
      ).toEqual({ ok: false, reason: "limit" });
    });

    it("goes when the person is deleted", async () => {
      await addEngagementContact(ownerId, id, { contactId, role: null });
      await db.delete(contacts).where(eq(contacts.id, contactId));
      expect((await getEngagement(ownerId, id))?.contacts).toEqual([]);
    });
  });

  it("deletes an engagement and keeps its company and people", async () => {
    const id = await create();
    const [{ id: contactId }] = await db
      .insert(contacts)
      .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
      .returning({ id: contacts.id });
    await addEngagementContact(ownerId, id, { contactId, role: null });

    const stranger = await createTestOwner("stranger@example.com");
    expect(await deleteEngagement(stranger, id)).toBe(false);
    expect(await deleteEngagement(ownerId, id)).toBe(true);
    expect(await getEngagement(ownerId, id)).toBeNull();
    expect(await db.$count(organizations)).toBe(1);
    expect(await db.$count(contacts)).toBe(1);
  });

  it("goes with its company", async () => {
    await create();
    expect(await countCompanyEngagements(ownerId, organizationId)).toBe(1);
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    expect(await db.$count(engagements)).toBe(0);
  });

  describe("the list", () => {
    let other: string;

    beforeEach(async () => {
      [{ id: other }] = await db
        .insert(organizations)
        .values({ ownerId, name: "Inoya Rouge" })
        .returning({ id: organizations.id });
      await create({ title: "Website redesign", status: "active", startDate: "2026-11-01" });
      await create({ title: "Logo set", status: "completed", startDate: "2026-09-01" });
      await create({ title: "Retainer 100%_done", status: "planned" });
      await create({ organizationId: other, title: "Brand book", status: "active" });
    });

    const titles = (page: Awaited<ReturnType<typeof listEngagements>>) =>
      page.rows.map((row) => row.title);

    it("puts active work first by default, then by title", async () => {
      expect(titles(await listEngagements(ownerId))).toEqual([
        "Brand book",
        "Website redesign",
        "Retainer 100%_done",
        "Logo set",
      ]);
    });

    it("searches titles, with % and _ taken literally", async () => {
      expect(titles(await listEngagements(ownerId, { q: "web" }))).toEqual([
        "Website redesign",
      ]);
      expect(titles(await listEngagements(ownerId, { q: "%_" }))).toEqual([
        "Retainer 100%_done",
      ]);
      expect(titles(await listEngagements(ownerId, { q: "_" }))).toEqual([
        "Retainer 100%_done",
      ]);
    });

    it("narrows by status and company, and sorts by start with undated last", async () => {
      expect(
        titles(await listEngagements(ownerId, { status: "active" })),
      ).toEqual(["Brand book", "Website redesign"]);
      expect(await listCompanyEngagements(ownerId, other)).toMatchObject([
        { title: "Brand book", organizationName: "Inoya Rouge" },
      ]);
      expect(
        titles(await listEngagements(ownerId, { sort: "start", dir: "desc" })),
      ).toEqual(["Website redesign", "Logo set", "Brand book", "Retainer 100%_done"]);
    });

    it("pages and counts, and shows another owner nothing", async () => {
      const first = await listEngagements(ownerId, { limit: 3 });
      expect(first).toMatchObject({ hasMore: true, total: 4 });
      expect(titles(await listEngagements(ownerId, { limit: 3, offset: 3 }))).toEqual([
        "Logo set",
      ]);
      const stranger = await createTestOwner("stranger@example.com");
      expect(await listEngagements(stranger)).toMatchObject({ rows: [], total: 0 });
    });
  });
});
