import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  brainstormBoards,
  contactEmails,
  contactOrganizations,
  contacts,
  contactTags,
  materials,
  organizations,
  tags,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { PER_KIND, searchEverything } from "./queries";

const names = (rows: { name: string }[]) => rows.map((row) => row.name);
const titles = (rows: { title: string }[]) => rows.map((row) => row.title);

describe("searchEverything", () => {
  let ownerId: string;
  let acme: string;
  let priya: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    [{ id: acme }] = await db
      .insert(organizations)
      .values([
        { ownerId, name: "Acme Design", domain: "acme.example" },
        { ownerId, name: "Old Acme Works", archivedAt: new Date() },
        { ownerId, name: "Northwind Traders", domain: "northwind.example" },
      ])
      .returning({ id: organizations.id });
    [{ id: priya }] = await db
      .insert(contacts)
      .values([
        { ownerId, firstName: "Priya", lastName: "Sharma", jobTitle: "Founder" },
        { ownerId, firstName: "Arjun", lastName: "Rao" },
        { ownerId, firstName: "Priyanka", lastName: "Gone", archivedAt: new Date() },
      ])
      .returning({ id: contacts.id });
    await db
      .insert(contactOrganizations)
      .values({ ownerId, contactId: priya, organizationId: acme });
    await db
      .insert(contactEmails)
      .values({ ownerId, contactId: priya, email: "priya@studio.example", isPrimary: true });
    const [{ id: tag }] = await db
      .insert(tags)
      .values({ ownerId, name: "Referral" })
      .returning({ id: tags.id });
    await db.insert(contactTags).values({ ownerId, contactId: priya, tagId: tag });
    await db.insert(materials).values([
      { ownerId, name: "Brand Proposal", type: "proposal" },
      { ownerId, name: "Case Studies", type: "portfolio" },
    ]);
    await db.insert(workflowBoards).values([
      { ownerId, name: "Website Project" },
      { ownerId, name: "Website Project", organizationId: acme },
    ]);
    const [{ id: call }] = await db
      .insert(activities)
      .values({
        ownerId,
        kind: "call",
        occurredAt: new Date("2026-10-15T09:00:00Z"),
        title: "Intro call",
        body: "Talked about the rebrand budget",
      })
      .returning({ id: activities.id });
    await db
      .insert(activityContacts)
      .values({ ownerId, activityId: call, contactId: priya });
    await db.insert(tasks).values([
      { ownerId, title: "Send rebrand quote", status: "done" },
      { ownerId, title: "Chase rebrand invoice", dueOn: "2026-10-20" },
      { ownerId, title: "Rebrand kickoff", status: "cancelled" },
    ]);
  });

  it("finds a company by the start of its name or its domain", async () => {
    expect(names((await searchEverything(ownerId, "acm"))!.companies)).toEqual([
      "Acme Design",
    ]);
    expect(names((await searchEverything(ownerId, "northwind.ex"))!.companies)).toEqual([
      "Northwind Traders",
    ]);
  });

  it("finds a person by name, email, title or tag, with their companies", async () => {
    const found = (await searchEverything(ownerId, "priya"))!;
    expect(found.people).toEqual([
      { id: priya, name: "Priya Sharma", companies: [{ id: acme, name: "Acme Design" }] },
    ]);
    for (const q of ["priya@stu", "founder", "referr"]) {
      expect(names((await searchEverything(ownerId, q))!.people)).toEqual(["Priya Sharma"]);
    }
  });

  it("still finds a company or a person whose name is mistyped", async () => {
    expect(names((await searchEverything(ownerId, "Pryia"))!.people)).toEqual([
      "Priya Sharma",
    ]);
    expect(names((await searchEverything(ownerId, "Northwnd"))!.companies)).toEqual([
      "Northwind Traders",
    ]);
  });

  it("leaves archived companies and people out", async () => {
    const found = (await searchEverything(ownerId, "priyanka"))!;
    expect(names(found.people)).not.toContain("Priyanka Gone");
    expect(names((await searchEverything(ownerId, "works"))!.companies)).toEqual([]);
  });

  it("finds materials and workflows by name, the owner's workflows first", async () => {
    const found = (await searchEverything(ownerId, "proposal"))!;
    expect(found.materials).toMatchObject([{ name: "Brand Proposal", type: "proposal" }]);
    const boards = (await searchEverything(ownerId, "website"))!.workflows;
    expect(boards).toMatchObject([
      { name: "Website Project", company: null, person: null },
      { name: "Website Project", company: "Acme Design", person: null },
    ]);
  });

  it("finds brainstorm boards by any part of their name", async () => {
    await db.insert(brainstormBoards).values([
      { ownerId, name: "Website ideas" },
      { ownerId, name: "Garden" },
    ]);
    expect(names((await searchEverything(ownerId, "ideas"))!.brainstorms)).toEqual([
      "Website ideas",
    ]);
  });

  it("finds activities by their notes and tasks by their title, leaving cancelled tasks out", async () => {
    const found = (await searchEverything(ownerId, "rebrand"))!;
    expect(titles(found.activities)).toEqual(["Intro call"]);
    expect(titles(found.tasks)).toEqual(["Chase rebrand invoice", "Send rebrand quote"]);
  });

  it("returns at most five of each kind", async () => {
    await db.insert(materials).values(
      Array.from({ length: PER_KIND + 3 }, (_, i) => ({
        ownerId,
        name: `Deck ${i}`,
        type: "deck" as const,
      })),
    );
    expect((await searchEverything(ownerId, "deck"))!.materials).toHaveLength(PER_KIND);
  });

  it("never shows another owner's records", async () => {
    const other = await createTestOwner("other@example.com");
    expect(await searchEverything(other, "acme")).toEqual({
      companies: [],
      people: [],
      materials: [],
      workflows: [],
      brainstorms: [],
      activities: [],
      tasks: [],
    });
  });

  it.each(["a", "  ", "!!", "'&|:*"])("searches nothing for %j", async (q) => {
    expect(await searchEverything(ownerId, q)).toBeNull();
  });
});
