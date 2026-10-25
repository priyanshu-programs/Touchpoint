import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  contactLinks,
  contactOrganizations,
  contactPhotos,
  contacts,
  fieldProvenance,
  materialSendRecipients,
  materialSends,
  materials,
  materialVersions,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { mergeContacts } from "./merge";
import { getContact } from "./queries";
import { contactMerge, newContactInput, type ContactMerge } from "./schema";
import {
  addContactCompany,
  addContactEmail,
  addContactLink,
  createContact,
  setPrimaryContact,
} from "./service";

const blank = {
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
};

let ownerId: string;

async function person(firstName: string, override: Partial<typeof blank> = {}) {
  const result = await createContact(
    ownerId,
    newContactInput.parse({ ...blank, firstName, ...override }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function company(name: string, domain: string) {
  const result = await createOrganization(
    ownerId,
    organizationInput.parse({
      name,
      domain,
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
    }),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

const merge = (keep: string, other: string, change: Partial<ContactMerge> = {}) =>
  mergeContacts(ownerId, { keep, other, picks: {}, custom: {}, ...change });

async function photo(contactId: string, sha256: string) {
  await db.insert(contactPhotos).values({
    contactId,
    ownerId,
    contentType: "image/webp",
    bytes: Buffer.from(sha256),
    sha256,
    sourceUrl: "https://example.com/photo.webp",
  });
}

beforeEach(async () => {
  await resetDatabase();
  ownerId = await createTestOwner();
});

describe("contactMerge", () => {
  const ids = {
    keep: "7f8c4f0e-5f43-4a3c-9a43-0d6b2d8f1a11",
    other: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  };

  it("takes sides, never values", () => {
    expect(
      contactMerge.safeParse({ ...ids, picks: { lastName: "other" }, custom: {} })
        .success,
    ).toBe(true);
    expect(
      contactMerge.safeParse({ ...ids, picks: { lastName: "Smith" }, custom: {} })
        .success,
    ).toBe(false);
  });

  it.each([
    ["an unknown field", { ...ids, picks: { ownerId: "other" }, custom: {} }],
    ["the same person twice", { keep: ids.keep, other: ids.keep, picks: {}, custom: {} }],
    ["an id that is not a uuid", { keep: "1", other: ids.other, picks: {}, custom: {} }],
    ["an extra field", { ...ids, picks: {}, custom: {}, archived: true }],
  ])("refuses %s", (_label, value) => {
    expect(contactMerge.safeParse(value).success).toBe(false);
  });
});

describe("mergeContacts", () => {
  it("keeps the chosen values, fills what the kept person lacks and deletes the other", async () => {
    const keep = await person("Komal", { lastName: "Bhotika", city: "Kolkata" });
    const other = await person("Komal", {
      lastName: "Bajaj Bhotika",
      jobTitle: "Partner",
      city: "Mumbai",
      country: "India",
      relationshipType: "client",
    });

    expect(
      await merge(keep, other, { picks: { lastName: "other", relationshipType: "keep" } }),
    ).toEqual({ ok: true });

    const merged = await getContact(ownerId, keep);
    expect(merged).toMatchObject({
      lastName: "Bajaj Bhotika",
      jobTitle: "Partner",
      // Location goes as one: the kept city and no country, as the kept person had.
      city: "Kolkata",
      country: null,
      relationshipType: "prospect",
    });
    expect(await getContact(ownerId, other)).toBeNull();

    const {
      rows: [entry],
    } = await listAudit(ownerId, { limit: 1 });
    expect(entry).toMatchObject({
      action: "contact.merge",
      entityId: keep,
      before: { merged: { id: other, lastName: "Bajaj Bhotika" } },
      after: { lastName: "Bajaj Bhotika" },
    });
  });

  it("brings custom values over and takes the picked one where both have one", async () => {
    const keep = await person("Ravi");
    const other = await person("Ravi K");
    await db.update(contacts).set({ custom: { segment: "A", size: 3 } }).where(eq(contacts.id, keep));
    await db.update(contacts).set({ custom: { segment: "B", source: "Referral" } }).where(eq(contacts.id, other));

    await merge(keep, other, { custom: { segment: "other", source: "keep" } });

    expect((await getContact(ownerId, keep))?.custom).toEqual({
      segment: "B",
      size: 3,
      source: "Referral",
    });
  });

  it("joins emails with one primary, and links without repeats", async () => {
    const keep = await person("Asha", { email: "asha@old.com" });
    const other = await person("Asha", { email: "asha@new.com" });
    await addContactEmail(ownerId, other, { email: "asha@home.com", label: null });
    await addContactLink(ownerId, keep, { kind: "linkedin", url: "https://linkedin.com/in/asha" });
    await addContactLink(ownerId, other, { kind: "linkedin", url: "https://linkedin.com/in/asha" });
    await addContactLink(ownerId, other, { kind: "github", url: "https://github.com/asha" });

    await merge(keep, other, { picks: { primaryEmail: "other" } });

    const merged = await getContact(ownerId, keep);
    expect(merged?.emails.map(({ email, isPrimary }) => [email, isPrimary])).toEqual(
      expect.arrayContaining([
        ["asha@new.com", true],
        ["asha@old.com", false],
        ["asha@home.com", false],
      ]),
    );
    expect(merged?.emails.filter((email) => email.isPrimary)).toHaveLength(1);
    expect(merged?.links.map((link) => link.kind).sort()).toEqual(["github", "linkedin"]);
    expect(await db.select().from(contactLinks)).toHaveLength(2);
  });

  it("joins tags and companies, keeping the star and filling the title", async () => {
    const acme = await company("Acme", "acme.com");
    const globex = await company("Globex", "globex.com");
    const keep = await person("Dev", { tags: "lead, design" });
    const other = await person("Dev", { tags: "Design, vip" });
    await addContactCompany(ownerId, keep, acme, { jobTitle: null });
    await addContactCompany(ownerId, other, acme, { jobTitle: "CTO" });
    await addContactCompany(ownerId, other, globex, { jobTitle: "Advisor" });
    await setPrimaryContact(ownerId, other, acme, true);

    await merge(keep, other);

    const merged = await getContact(ownerId, keep);
    expect(merged?.tags.map((tag) => tag.toLowerCase()).sort()).toEqual([
      "design",
      "lead",
      "vip",
    ]);
    expect(
      merged?.companies.map(({ name, jobTitle, isPrimary }) => [name, jobTitle, isPrimary]),
    ).toEqual(
      expect.arrayContaining([
        ["Acme", "CTO", true],
        // The first person at a company holds its star, and it comes over with them.
        ["Globex", "Advisor", true],
      ]),
    );
    expect(
      await db
        .select()
        .from(contactOrganizations)
        .where(eq(contactOrganizations.organizationId, acme)),
    ).toHaveLength(1);
  });

  it("puts the kept person on activities and sends once, and moves tasks and workflows", async () => {
    const keep = await person("Mira");
    const other = await person("Mira");
    const [both, theirs] = await db
      .insert(activities)
      .values([
        { ownerId, kind: "call", title: "Both", occurredAt: new Date() },
        { ownerId, kind: "note", title: "Theirs", occurredAt: new Date() },
      ])
      .returning();
    await db.insert(activityContacts).values([
      { activityId: both.id, contactId: keep, ownerId },
      { activityId: both.id, contactId: other, ownerId },
      { activityId: theirs.id, contactId: other, ownerId },
    ]);
    const [material] = await db
      .insert(materials)
      .values({ ownerId, name: "Deck", type: "deck" })
      .returning();
    const [version] = await db
      .insert(materialVersions)
      .values({ ownerId, materialId: material.id, label: "v1", url: "https://example.com" })
      .returning();
    const [send] = await db
      .insert(materialSends)
      .values({ ownerId, versionId: version.id, sentAt: new Date(), channel: "email" })
      .returning();
    await db.insert(materialSendRecipients).values([
      { sendId: send.id, contactId: keep, ownerId },
      { sendId: send.id, contactId: other, ownerId },
    ]);
    await db.insert(tasks).values({ ownerId, title: "Call Mira", contactId: other });
    await db.insert(workflowBoards).values([
      { ownerId, name: "Kept", contactId: keep, starred: true },
      { ownerId, name: "Theirs", contactId: other, starred: true },
    ]);

    await merge(keep, other);

    expect(
      (await db.select().from(activityContacts)).map((row) => [row.activityId, row.contactId]),
    ).toEqual(
      expect.arrayContaining([
        [both.id, keep],
        [theirs.id, keep],
      ]),
    );
    expect(await db.select().from(activityContacts)).toHaveLength(2);
    expect(await db.select().from(materialSendRecipients)).toEqual([
      expect.objectContaining({ sendId: send.id, contactId: keep }),
    ]);
    expect((await db.select().from(tasks))[0].contactId).toBe(keep);
    const boards = await db.select().from(workflowBoards);
    expect(boards.every((board) => board.contactId === keep)).toBe(true);
    expect(boards.filter((board) => board.starred).map((board) => board.name)).toEqual([
      "Kept",
    ]);
  });

  it("keeps the picked photo with its provenance", async () => {
    const keep = await person("Neel");
    const other = await person("Neel");
    await photo(keep, "kept");
    await photo(other, "theirs");
    await db.insert(fieldProvenance).values({
      ownerId,
      entityType: "contact",
      entityId: other,
      field: "photo",
      source: "website",
      confidence: "inferred",
    });

    await merge(keep, other, { picks: { photo: "other" } });

    expect(await db.select({ contactId: contactPhotos.contactId, sha256: contactPhotos.sha256 }).from(contactPhotos)).toEqual([
      { contactId: keep, sha256: "theirs" },
    ]);
    expect(
      (await db.select().from(fieldProvenance)).map((row) => [row.entityId, row.field]),
    ).toEqual([[keep, "photo"]]);
  });

  it("refuses more than 20 tags or workflows together, writing nothing", async () => {
    const tags = (from: number) =>
      Array.from({ length: 12 }, (_, index) => `tag${from + index}`).join(",");
    const keep = await person("Ola", { tags: tags(0) });
    const other = await person("Ola", { tags: tags(100) });
    expect(await merge(keep, other)).toEqual({ ok: false, reason: "tags", count: 24 });
    expect(await getContact(ownerId, other)).not.toBeNull();

    const a = await person("Pia");
    const b = await person("Pia");
    await db.insert(workflowBoards).values(
      Array.from({ length: MAX_RECORD_BOARDS }, (_, index) => ({
        ownerId,
        name: `Board ${index}`,
        contactId: index % 2 ? a : b,
      })),
    );
    await db.insert(workflowBoards).values({ ownerId, name: "One more", contactId: b });
    expect(await merge(a, b)).toEqual({ ok: false, reason: "boards", count: 21 });
    expect(await getContact(ownerId, b)).not.toBeNull();
  });

  it("changes nothing for a person who is not the owner's", async () => {
    const keep = await person("Sam");
    const otherOwner = await createTestOwner("other@example.com");
    const theirs = await createContact(
      otherOwner,
      newContactInput.parse({ ...blank, firstName: "Sam" }),
    );
    if (!theirs.ok) throw new Error(theirs.reason);

    expect(await merge(keep, theirs.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await getContact(otherOwner, theirs.id)).not.toBeNull();
  });

  it("leaves the merged person archived only if both were", async () => {
    const keep = await person("Uma");
    const other = await person("Uma");
    await db.update(contacts).set({ archivedAt: new Date() }).where(eq(contacts.id, keep));

    await merge(keep, other);

    expect((await getContact(ownerId, keep))?.archivedAt).toBeNull();
  });
});
