import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  contactOrganizations,
  enrichmentRuns,
  fieldProvenance,
  materialSends,
  materials,
  materialVersions,
  organizationLogos,
  organizations,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { newContactInput } from "@/modules/contacts/schema";
import { addContactCompany, createContact } from "@/modules/contacts/service";
import { organizationTagNames } from "@/modules/tags/queries";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { mergeOrganizations } from "./merge";
import { getOrganization } from "./queries";
import {
  organizationInput,
  organizationMerge,
  type OrganizationMerge,
} from "./schema";
import { createOrganization } from "./service";

const blank = {
  domain: "",
  website: "",
  phone: "",
  email: "",
  industry: "",
  description: "",
  city: "",
  region: "",
  country: "",
  status: "prospect",
  tags: "",
};

let ownerId: string;

async function company(name: string, override: Partial<typeof blank> = {}) {
  const result = await createOrganization(
    ownerId,
    organizationInput.parse({ ...blank, name, ...override }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  // A company with a website has its first read queued; these tests take it as read.
  await db
    .update(enrichmentRuns)
    .set({ status: "done", finishedAt: new Date() })
    .where(eq(enrichmentRuns.organizationId, result.id));
  return result.id;
}

async function person(firstName: string) {
  const result = await createContact(
    ownerId,
    newContactInput.parse({
      firstName,
      lastName: "",
      jobTitle: "",
      department: "",
      phoneE164: "",
      city: "",
      region: "",
      country: "",
      timezone: "",
      preferredChannel: "",
      status: "active",
      relationshipType: "prospect",
      tags: "",
      email: "",
      organizationId: "",
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

const merge = (keep: string, other: string, change: Partial<OrganizationMerge> = {}) =>
  mergeOrganizations(ownerId, { keep, other, picks: {}, custom: {}, ...change });

async function logo(organizationId: string, sha256: string) {
  await db.insert(organizationLogos).values({
    organizationId,
    ownerId,
    contentType: "image/webp",
    bytes: Buffer.from(sha256),
    sha256,
    sourceUrl: "https://example.com/logo.webp",
  });
}

const provenance = (entityId: string, field: string, source = "website") => ({
  ownerId,
  entityType: "organization",
  entityId,
  field,
  source,
  confidence: source === "manual" ? "verified" : "guessed",
});

beforeEach(async () => {
  await resetDatabase();
  ownerId = await createTestOwner();
});

describe("organizationMerge", () => {
  const ids = {
    keep: "7f8c4f0e-5f43-4a3c-9a43-0d6b2d8f1a11",
    other: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  };

  it("takes sides, never values", () => {
    expect(
      organizationMerge.safeParse({ ...ids, picks: { name: "other" }, custom: {} }).success,
    ).toBe(true);
    expect(
      organizationMerge.safeParse({ ...ids, picks: { name: "Acme" }, custom: {} }).success,
    ).toBe(false);
  });

  it.each([
    ["an unknown field", { ...ids, picks: { ownerId: "other" }, custom: {} }],
    ["the same company twice", { keep: ids.keep, other: ids.keep, picks: {}, custom: {} }],
    ["an id that is not a uuid", { keep: "1", other: ids.other, picks: {}, custom: {} }],
  ])("refuses %s", (_, input) => {
    expect(organizationMerge.safeParse(input).success).toBe(false);
  });
});

describe("mergeOrganizations", () => {
  it("keeps the chosen values, fills what the kept company lacks and deletes the other", async () => {
    const keep = await company("KBRS", { city: "Kolkata", industry: "Accounting" });
    const other = await company("KBRS & Associates", {
      domain: "cakbrs.com",
      phone: "+913322334455",
      city: "Mumbai",
      country: "India",
      industry: "Audit",
    });

    expect(
      await merge(keep, other, { picks: { name: "other", website: "other", industry: "keep" } }),
    ).toEqual({ ok: true });

    expect(await getOrganization(ownerId, keep)).toMatchObject({
      name: "KBRS & Associates",
      // The kept one had no domain, so the other's comes over without asking.
      domain: "cakbrs.com",
      phone: "+913322334455",
      industry: "Accounting",
      // Location goes as one: the kept city and no country, as the kept company had.
      city: "Kolkata",
      country: null,
    });
    expect(await getOrganization(ownerId, other)).toBeNull();

    const {
      rows: [entry],
    } = await listAudit(ownerId, { limit: 1 });
    expect(entry).toMatchObject({
      action: "organization.merge",
      entityId: keep,
      before: { merged: { id: other, name: "KBRS & Associates" } },
      after: { name: "KBRS & Associates" },
    });
  });

  it("moves the picked domain, its reads and the provenance of each picked field", async () => {
    const keep = await company("Inoya", { domain: "inoya.in", description: "Kept" });
    const other = await company("Inoya Rouge", {
      domain: "inoyarouge.com",
      website: "https://inoyarouge.com/",
      description: "Theirs",
    });
    await db.delete(fieldProvenance);
    await db.insert(fieldProvenance).values([
      provenance(keep, "website"),
      provenance(keep, "description", "manual"),
      provenance(other, "website"),
      provenance(other, "description"),
      provenance(other, "industry"),
    ]);

    await merge(keep, other, { picks: { website: "other" } });

    expect(await getOrganization(ownerId, keep)).toMatchObject({
      domain: "inoyarouge.com",
      website: "https://inoyarouge.com/",
      description: "Kept",
    });
    const rows = await db.select().from(fieldProvenance);
    expect(rows.map((row) => [row.entityId, row.field, row.source]).sort()).toEqual(
      [
        [keep, "description", "manual"],
        [keep, "website", "website"],
      ].sort(),
    );
    expect(rows.find((row) => row.field === "website")?.confidence).toBe("guessed");
    const runs = await db.select().from(enrichmentRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      organizationId: keep,
      input: { url: "https://inoyarouge.com/" },
    });
  });

  it("keeps the kept website's reads when its website stays", async () => {
    const keep = await company("Acme", { domain: "acme.com" });
    const other = await company("Acme Inc", { domain: "acme.io" });

    await merge(keep, other);

    const runs = await db.select().from(enrichmentRuns);
    expect(runs.map((run) => run.organizationId)).toEqual([keep]);
    expect((await getOrganization(ownerId, keep))?.domain).toBe("acme.com");
  });

  it("brings custom values over and takes the picked one where both have one", async () => {
    const keep = await company("Ravi Co");
    const other = await company("Ravi Company");
    await db.update(organizations).set({ custom: { segment: "A", size: 3 } }).where(eq(organizations.id, keep));
    await db.update(organizations).set({ custom: { segment: "B", source: "Referral" } }).where(eq(organizations.id, other));

    await merge(keep, other, { custom: { segment: "other", source: "keep" } });

    expect((await getOrganization(ownerId, keep))?.custom).toEqual({
      segment: "B",
      size: 3,
      source: "Referral",
    });
  });

  it("keeps the picked logo", async () => {
    const keep = await company("Neel");
    const other = await company("Neel Ltd");
    await logo(keep, "kept");
    await logo(other, "theirs");

    await merge(keep, other, { picks: { logo: "other" } });

    expect(
      await db
        .select({ organizationId: organizationLogos.organizationId, sha256: organizationLogos.sha256 })
        .from(organizationLogos),
    ).toEqual([{ organizationId: keep, sha256: "theirs" }]);
  });

  it("joins tags and people, keeping one star and filling a shared person's title", async () => {
    const keep = await company("Mira Co", { tags: "client,india" });
    const other = await company("Mira Company", { tags: "India,retail" });
    const shared = await person("Asha");
    const theirs = await person("Bo");
    await addContactCompany(ownerId, shared, keep, { jobTitle: null });
    await addContactCompany(ownerId, shared, other, { jobTitle: "Partner" });
    await addContactCompany(ownerId, theirs, other, { jobTitle: null });
    await db
      .update(contactOrganizations)
      .set({ isPrimary: false })
      .where(eq(contactOrganizations.organizationId, other));
    await db
      .update(contactOrganizations)
      .set({ isPrimary: true })
      .where(eq(contactOrganizations.contactId, theirs));

    await merge(keep, other);

    expect(await organizationTagNames(db, ownerId, keep)).toEqual(["client", "india", "retail"]);
    const places = await db.select().from(contactOrganizations);
    expect(places.map((row) => row.organizationId)).toEqual([keep, keep]);
    expect(places.find((row) => row.contactId === shared)).toMatchObject({
      jobTitle: "Partner",
      isPrimary: true,
    });
    expect(places.find((row) => row.contactId === theirs)?.isPrimary).toBe(false);
  });

  it("gives the kept company the other's star when it had none", async () => {
    const keep = await company("Star Co");
    const other = await company("Star Company");
    const theirs = await person("Cy");
    await addContactCompany(ownerId, theirs, other, { jobTitle: null });

    await merge(keep, other);

    expect(await db.select().from(contactOrganizations)).toEqual([
      expect.objectContaining({ organizationId: keep, contactId: theirs, isPrimary: true }),
    ]);
  });

  it("moves activities, sends, tasks and workflows, with one starred workflow", async () => {
    const keep = await company("Dev Co");
    const other = await company("Dev Company");
    await db
      .insert(activities)
      .values({ ownerId, kind: "call", title: "Theirs", occurredAt: new Date(), organizationId: other });
    const [material] = await db
      .insert(materials)
      .values({ ownerId, name: "Deck", type: "deck" })
      .returning();
    const [version] = await db
      .insert(materialVersions)
      .values({ ownerId, materialId: material.id, label: "v1", url: "https://example.com" })
      .returning();
    await db
      .insert(materialSends)
      .values({ ownerId, versionId: version.id, sentAt: new Date(), channel: "email", organizationId: other });
    await db.insert(tasks).values({ ownerId, title: "Call Dev", organizationId: other });
    await db.insert(workflowBoards).values([
      { ownerId, name: "Kept", organizationId: keep, starred: true },
      { ownerId, name: "Theirs", organizationId: other, starred: true },
    ]);

    await merge(keep, other);

    expect((await db.select().from(activities))[0].organizationId).toBe(keep);
    expect((await db.select().from(materialSends))[0].organizationId).toBe(keep);
    expect((await db.select().from(tasks))[0].organizationId).toBe(keep);
    const boards = await db.select().from(workflowBoards);
    expect(boards.every((board) => board.organizationId === keep)).toBe(true);
    expect(boards.filter((board) => board.starred).map((board) => board.name)).toEqual([
      "Kept",
    ]);
  });

  it("refuses more than 20 tags or workflows together, writing nothing", async () => {
    const tags = (from: number) =>
      Array.from({ length: 12 }, (_, index) => `tag${from + index}`).join(",");
    const keep = await company("Ola", { tags: tags(0) });
    const other = await company("Ola Co", { tags: tags(100) });
    expect(await merge(keep, other)).toEqual({ ok: false, reason: "tags", count: 24 });
    expect(await getOrganization(ownerId, other)).not.toBeNull();

    const a = await company("Pia");
    const b = await company("Pia Co");
    await db.insert(workflowBoards).values(
      Array.from({ length: MAX_RECORD_BOARDS }, (_, index) => ({
        ownerId,
        name: `Board ${index}`,
        organizationId: index % 2 ? a : b,
      })),
    );
    await db.insert(workflowBoards).values({ ownerId, name: "One more", organizationId: b });
    expect(await merge(a, b)).toEqual({ ok: false, reason: "boards", count: 21 });
    expect(await getOrganization(ownerId, b)).not.toBeNull();
  });

  it("refuses while a website read is under way on either, writing nothing", async () => {
    const keep = await company("Qi");
    const other = await company("Qi Co", { domain: "qi.example" });
    await db
      .update(enrichmentRuns)
      .set({ status: "running" })
      .where(eq(enrichmentRuns.organizationId, other));

    expect(await merge(keep, other)).toEqual({ ok: false, reason: "reading" });
    expect(await getOrganization(ownerId, other)).not.toBeNull();
  });

  it("changes nothing for a company that is not the owner's", async () => {
    const keep = await company("Sam");
    const otherOwner = await createTestOwner("other@example.com");
    const theirs = await createOrganization(
      otherOwner,
      organizationInput.parse({ ...blank, name: "Sam" }),
    );
    if (!theirs.ok) throw new Error(theirs.reason);

    expect(await merge(keep, theirs.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await getOrganization(otherOwner, theirs.id)).not.toBeNull();
  });

  it("leaves the merged company archived only if both were", async () => {
    const keep = await company("Uma");
    const other = await company("Uma Co");
    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, keep));

    await merge(keep, other);

    expect((await getOrganization(ownerId, keep))?.archivedAt).toBeNull();
  });
});
