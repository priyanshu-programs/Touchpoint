import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  contactEmails,
  contactLinks,
  contactOrganizations,
  contactTags,
  tasks,
} from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  deleteOrganization,
} from "@/modules/organizations/service";
import { listTags } from "@/modules/tags/queries";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { countContacts, getContact, listContacts } from "./queries";
import {
  companyLinkInput,
  contactEmailInput,
  contactInput,
  contactLinkInput,
  newContactInput,
} from "./schema";
import {
  addContactCompany,
  addContactEmail,
  addContactLink,
  createContact,
  deleteContact,
  removeContactCompany,
  removeContactEmail,
  removeContactLink,
  setContactArchived,
  setContactCompanyTitle,
  setContactRelationship,
  setPrimaryContact,
  setPrimaryEmail,
  updateContact,
} from "./service";

const form = {
  firstName: "Priya",
  lastName: "Sharma",
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
};
// What only the form for a new person asks for.
const first = { email: "", organizationId: "" };
type Form = typeof form & typeof first;
const input = (override: Partial<Form> = {}) =>
  newContactInput.parse({ ...form, ...first, ...override });

describe("contact schemas", () => {
  it("stores blank fields as null and cleans the phone and email", () => {
    expect(
      input({
        phoneE164: "+91 98765-43210",
        email: " Priya@Example.COM ",
        timezone: "Asia/Kolkata",
      }),
    ).toMatchObject({
      lastName: "Sharma",
      jobTitle: null,
      organizationId: null,
      phoneE164: "+919876543210",
      email: "priya@example.com",
      timezone: "Asia/Kolkata",
    });
  });

  it.each([
    ["a missing first name", { firstName: "" }],
    ["a local phone number", { phoneE164: "98765 43210" }],
    ["a malformed email", { email: "priya@" }],
    ["an organization id that is not a UUID", { organizationId: "1" }],
    ["an unknown time zone", { timezone: "Mars/Olympus" }],
    ["an unknown relationship", { relationshipType: "rival" }],
    ["an unexpected field", { ownerId: "x" }],
  ])("rejects %s", (_label, override) => {
    expect(
      newContactInput.safeParse({ ...form, ...first, ...override }).success,
    ).toBe(false);
  });

  it("does not accept an email or a company on the edit form", () => {
    expect(contactInput.safeParse(form).success).toBe(true);
    expect(contactInput.safeParse({ ...form, email: "a@b.co" }).success).toBe(
      false,
    );
    expect(contactInput.safeParse({ ...form, organizationId: "" }).success).toBe(
      false,
    );
  });

  it("takes a title at a company, blank for none, and nothing else", () => {
    expect(companyLinkInput.parse({ jobTitle: " Partner " })).toEqual({
      jobTitle: "Partner",
    });
    expect(companyLinkInput.parse({ jobTitle: "" })).toEqual({ jobTitle: null });
    expect(
      companyLinkInput.safeParse({ jobTitle: "", isPrimary: true }).success,
    ).toBe(false);
  });

  it("only accepts web links", () => {
    expect(
      contactLinkInput.safeParse({ kind: "website", url: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      contactLinkInput.safeParse({
        kind: "linkedin",
        url: "https://www.linkedin.com/in/priya",
      }).success,
    ).toBe(true);
  });
});

describe("contacts", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  async function create(override: Partial<Form> = {}, owner = ownerId) {
    const result = await createContact(owner, input(override), {
      confirmSimilar: true,
    });
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  async function createOrg(name: string, owner = ownerId) {
    const result = await createOrganization(
      owner,
      organizationInput.parse({
        name,
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
      }),
      { confirmSimilar: true },
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  it("creates a contact with a primary email, tags and an audit row", async () => {
    const organizationId = await createOrg("Acme Design");
    const id = await create({
      organizationId,
      email: "priya@acme.com",
      tags: "vip",
    });

    expect(await getContact(ownerId, id)).toMatchObject({
      fullName: "Priya Sharma",
      companies: [
        { id: organizationId, name: "Acme Design", jobTitle: null, isPrimary: true },
      ],
      emails: [{ email: "priya@acme.com", isPrimary: true }],
      tags: ["vip"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.create",
      entityId: id,
      after: {
        firstName: "Priya",
        email: "priya@acme.com",
        tags: ["vip"],
        organizationId,
      },
    });
  });

  it("refuses a contact whose email already belongs to someone", async () => {
    const id = await create({ email: "priya@acme.com" });

    const result = await createContact(
      ownerId,
      input({ firstName: "Someone", lastName: "Else", email: "PRIYA@acme.com" }),
    );

    expect(result).toEqual({
      ok: false,
      reason: "duplicate",
      existing: { id, name: "Priya Sharma", companies: [] },
    });
  });

  it("warns about a similar name until the owner confirms", async () => {
    const id = await create();

    const warned = await createContact(ownerId, input({ lastName: "Sharmaa" }));
    expect(warned).toEqual({
      ok: false,
      reason: "similar",
      candidates: [{ id, name: "Priya Sharma", companies: [] }],
    });

    const confirmed = await createContact(ownerId, input({ lastName: "Sharmaa" }), {
      confirmSimilar: true,
    });
    expect(confirmed.ok).toBe(true);
  });

  it("warns sooner when the similar person is at the same organization", async () => {
    const organizationId = await createOrg("Acme Design");
    await create({ organizationId });

    const elsewhere = await createContact(ownerId, input({ lastName: "Shetty" }));
    expect(elsewhere.ok).toBe(true);

    const sameOrganization = await createContact(
      ownerId,
      input({ lastName: "Shenoy", organizationId }),
    );
    expect(sameOrganization).toMatchObject({
      reason: "similar",
      candidates: [
        {
          name: "Priya Sharma",
          companies: [{ id: organizationId, name: "Acme Design" }],
        },
      ],
    });
  });

  it("refuses an organization the owner does not have", async () => {
    const otherId = await createTestOwner("other@example.com");
    const theirOrganization = await createOrg("Their Co", otherId);

    expect(
      await createContact(ownerId, input({ organizationId: theirOrganization })),
    ).toEqual({ ok: false, reason: "unknown_organization" });
  });

  it("updates fields and tags and records before and after", async () => {
    const id = await create({ tags: "lead" });

    const result = await updateContact(
      ownerId,
      id,
      contactInput.parse({ ...form, jobTitle: "Founder", tags: "vip" }),
    );

    expect(result).toEqual({ ok: true, id });
    expect(await getContact(ownerId, id)).toMatchObject({
      jobTitle: "Founder",
      tags: ["vip"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.update",
      before: { jobTitle: null, tags: ["lead"] },
      after: { jobTitle: "Founder", tags: ["vip"] },
    });
  });

  it("keeps exactly one primary email as addresses come and go", async () => {
    const id = await create();
    const add = (email: string) =>
      addContactEmail(ownerId, id, contactEmailInput.parse({ email, label: "" }));

    expect(await add("first@acme.com")).toEqual({ ok: true });
    expect(await add("second@acme.com")).toEqual({ ok: true });
    let contact = await getContact(ownerId, id);
    expect(contact!.emails.map((row) => [row.email, row.isPrimary])).toEqual([
      ["first@acme.com", true],
      ["second@acme.com", false],
    ]);

    const second = contact!.emails[1].id;
    expect(await setPrimaryEmail(ownerId, id, second)).toBe(true);
    contact = await getContact(ownerId, id);
    expect(contact!.emails[0]).toMatchObject({
      email: "second@acme.com",
      isPrimary: true,
    });

    expect(await removeContactEmail(ownerId, id, second)).toBe(true);
    contact = await getContact(ownerId, id);
    expect(contact!.emails).toMatchObject([
      { email: "first@acme.com", isPrimary: true },
    ]);
  });

  it("refuses to add an email that another contact holds", async () => {
    const first = await create({ email: "shared@acme.com" });
    const second = await create({ firstName: "Arjun", lastName: "Rao" });

    expect(
      await addContactEmail(
        ownerId,
        second,
        contactEmailInput.parse({ email: "shared@acme.com", label: "" }),
      ),
    ).toEqual({
      ok: false,
      reason: "duplicate",
      existing: { id: first, name: "Priya Sharma", companies: [] },
    });
  });

  it("adds and removes links", async () => {
    const id = await create();
    await addContactLink(
      ownerId,
      id,
      contactLinkInput.parse({
        kind: "linkedin",
        url: "https://www.linkedin.com/in/priya",
      }),
    );

    await addContactLink(
      ownerId,
      id,
      contactLinkInput.parse({ kind: "github", url: "https://github.com/priya" }),
    );

    const contact = await getContact(ownerId, id);
    expect(contact!.links).toMatchObject([
      { kind: "linkedin" },
      { kind: "github" },
    ]);

    expect(await removeContactLink(ownerId, id, contact!.links[0].id)).toBe(true);
    expect((await getContact(ownerId, id))!.links).toMatchObject([
      { kind: "github" },
    ]);
  });

  it("makes the first person at a company its primary contact and lets the owner move the star", async () => {
    const organizationId = await createOrg("Acme Design");
    await create({ organizationId });
    const second = await create({
      firstName: "Arjun",
      lastName: "Rao",
      organizationId,
    });
    const alone = await create({ firstName: "Chitra", lastName: "Nair" });
    const primaries = async () =>
      (await listContacts(ownerId, { organizationId })).rows
        .filter((row) => row.isPrimary)
        .map((row) => row.fullName);

    expect(await primaries()).toEqual(["Priya Sharma"]);

    expect(await setPrimaryContact(ownerId, second, organizationId, true)).toBe(true);
    expect(await primaries()).toEqual(["Arjun Rao"]);
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.set_primary",
      entityId: second,
      before: { isPrimary: false },
      after: { isPrimary: true, organizationId },
    });

    expect(await setPrimaryContact(ownerId, second, organizationId, false)).toBe(true);
    expect(await primaries()).toEqual([]);
    // Nobody is the primary contact of a company they are not at.
    expect(await setPrimaryContact(ownerId, alone, organizationId, true)).toBe(false);
    expect(await primaries()).toEqual([]);
  });

  it("puts one person at several companies, with a title and a star at each", async () => {
    const acme = await createOrg("Acme Design");
    const borealis = await createOrg("Borealis Labs");
    const id = await create({ organizationId: acme, jobTitle: "Designer" });
    await create({ firstName: "Arjun", lastName: "Rao", organizationId: borealis });
    const at = async (organizationId: string) =>
      (await listContacts(ownerId, { organizationId })).rows.map((row) => ({
        name: row.fullName,
        title: row.jobTitle,
        star: row.isPrimary,
      }));

    expect(
      await addContactCompany(ownerId, id, borealis, { jobTitle: "Partner" }),
    ).toEqual({ ok: true });

    // Her own title where none was given, the other where one was; Arjun was there first.
    expect(await at(acme)).toEqual([
      { name: "Priya Sharma", title: "Designer", star: true },
    ]);
    expect(await at(borealis)).toEqual([
      { name: "Arjun Rao", title: null, star: true },
      { name: "Priya Sharma", title: "Partner", star: false },
    ]);
    expect((await getContact(ownerId, id))!.companies).toMatchObject([
      { id: acme, name: "Acme Design", jobTitle: null, isPrimary: true },
      { id: borealis, name: "Borealis Labs", jobTitle: "Partner", isPrimary: false },
    ]);
    // One person still: listed once, counted once, with both companies beside her.
    const everyone = (await listContacts(ownerId)).rows;
    expect(everyone.map((row) => row.fullName)).toEqual(["Arjun Rao", "Priya Sharma"]);
    expect(everyone[1]).toMatchObject({
      jobTitle: "Designer",
      isPrimary: false,
      companies: [
        { id: acme, name: "Acme Design" },
        { id: borealis, name: "Borealis Labs" },
      ],
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "contact.add_company",
      entityId: id,
      after: { organizationId: borealis, jobTitle: "Partner" },
    });

    // The star is the company's: she can hold it at both, each company still has one.
    expect(await setPrimaryContact(ownerId, id, borealis, true)).toBe(true);
    expect((await at(borealis)).map((row) => row.star)).toEqual([false, true]);
    expect((await at(acme)).map((row) => row.star)).toEqual([true]);

    expect(await setContactCompanyTitle(ownerId, id, borealis, null)).toBe(true);
    expect((await at(borealis))[1].title).toBe("Designer");
    expect(await setContactCompanyTitle(ownerId, id, acme, "Founder")).toBe(true);
    expect((await at(acme))[0].title).toBe("Founder");

    expect(
      await addContactCompany(ownerId, id, borealis, { jobTitle: "Advisor" }),
    ).toEqual({ ok: false, reason: "already" });
  });

  it("keeps the name a company's website gives someone, also for a person already there", async () => {
    const acme = await createOrg("Acme Design");
    const borealis = await createOrg("Borealis Labs");
    const id = await create({ organizationId: acme });
    const links = () =>
      db
        .select({
          organizationId: contactOrganizations.organizationId,
          jobTitle: contactOrganizations.jobTitle,
          listedAs: contactOrganizations.listedAs,
        })
        .from(contactOrganizations)
        .where(eq(contactOrganizations.contactId, id))
        .orderBy(contactOrganizations.createdAt);

    await addContactCompany(ownerId, id, borealis, {
      jobTitle: "Partner",
      listedAs: "P. Sharma",
    });
    await setContactCompanyTitle(ownerId, id, acme, "Founder");
    // Already at Acme: only the listed name is new, and the title she has there stays.
    expect(
      await addContactCompany(ownerId, id, acme, {
        jobTitle: "Owner",
        listedAs: "Priya S",
      }),
    ).toEqual({ ok: true });

    expect(await links()).toEqual([
      { organizationId: acme, jobTitle: "Founder", listedAs: "Priya S" },
      { organizationId: borealis, jobTitle: "Partner", listedAs: "P. Sharma" },
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "contact.match_company",
    });
  });

  it("takes a person off one company and leaves them at the others", async () => {
    const acme = await createOrg("Acme Design");
    const borealis = await createOrg("Borealis Labs");
    const id = await create({ organizationId: acme });
    await addContactCompany(ownerId, id, borealis, { jobTitle: "Partner" });

    expect(await removeContactCompany(ownerId, id, acme)).toBe(true);

    expect((await getContact(ownerId, id))!.companies).toMatchObject([
      { id: borealis, jobTitle: "Partner" },
    ]);
    expect((await listContacts(ownerId, { organizationId: acme })).rows).toEqual([]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "contact.remove_company",
      entityId: id,
      before: { organizationId: acme, isPrimary: true },
    });
    expect(await removeContactCompany(ownerId, id, acme)).toBe(false);
    expect(await setContactCompanyTitle(ownerId, id, acme, "Founder")).toBe(false);
  });

  it("drops the star when the contact is archived, and the link when the company is deleted", async () => {
    const acme = await createOrg("Acme Design");
    const borealis = await createOrg("Borealis Labs");
    const id = await create({ organizationId: acme });
    await addContactCompany(ownerId, id, borealis, { jobTitle: null });
    const stars = async () =>
      (await getContact(ownerId, id))!.companies.map((company) => company.isPrimary);
    const edit = (override: Partial<typeof form>) =>
      updateContact(ownerId, id, contactInput.parse({ ...form, ...override }));
    // First at each of the two, so starred at both.
    expect(await stars()).toEqual([true, true]);

    await edit({ jobTitle: "Founder" });
    expect(await stars()).toEqual([true, true]);

    await setContactArchived(ownerId, id, true);
    expect(await stars()).toEqual([false, false]);
    expect(await setPrimaryContact(ownerId, id, acme, true)).toBe(false);
    // Someone added while she is hidden away takes the star she cannot hold.
    const arjun = await create({ firstName: "Arjun", lastName: "Rao", organizationId: acme });
    expect((await getContact(ownerId, arjun))!.companies[0].isPrimary).toBe(true);

    await setContactArchived(ownerId, id, false);
    await setPrimaryContact(ownerId, id, borealis, true);
    expect(await deleteOrganization(ownerId, borealis)).toBe(true);
    expect((await getContact(ownerId, id))!.companies).toMatchObject([
      { id: acme, isPrimary: false },
    ]);
  });

  it("archives and restores, and lists each state separately", async () => {
    const id = await create();

    expect(await setContactArchived(ownerId, id, true)).toBe(true);
    expect((await listContacts(ownerId)).rows).toHaveLength(0);
    expect((await listContacts(ownerId, { archived: true })).rows).toHaveLength(1);
    expect(await countContacts(ownerId)).toBe(0);

    await setContactArchived(ownerId, id, false);
    expect((await listContacts(ownerId)).rows).toHaveLength(1);
    expect(await countContacts(ownerId)).toBe(1);
  });

  it("switches the relationship from the panel and records it", async () => {
    const id = await create();

    expect(await setContactRelationship(ownerId, id, "client")).toBe(true);

    expect(await getContact(ownerId, id)).toMatchObject({
      relationshipType: "client",
      firstName: "Priya",
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.set_relationship",
      entityId: id,
      before: { relationshipType: "prospect" },
      after: { relationshipType: "client" },
    });
  });

  it("deletes a person and what belongs to them, and keeps their tasks and activities", async () => {
    const organizationId = await createOrg("Acme Design");
    const id = await create({
      email: "priya@acme.com",
      tags: "vip",
      organizationId,
    });
    const colleague = await create({ firstName: "Arjun", lastName: "Rao", organizationId });
    await addContactLink(
      ownerId,
      id,
      contactLinkInput.parse({ kind: "linkedin", url: "https://linkedin.com/in/priya" }),
    );
    const [task] = await db
      .insert(tasks)
      .values({ ownerId, title: "Send proposal", contactId: id })
      .returning({ id: tasks.id });
    const [activity] = await db
      .insert(activities)
      .values({
        ownerId,
        kind: "call",
        title: "Intro call",
        occurredAt: new Date("2026-10-01T09:00:00Z"),
      })
      .returning({ id: activities.id });
    await db.insert(activityContacts).values([
      { ownerId, activityId: activity.id, contactId: id },
      { ownerId, activityId: activity.id, contactId: colleague },
    ]);

    expect(await deleteContact(ownerId, id)).toBe(true);

    expect(await getContact(ownerId, id)).toBeNull();
    expect(await db.$count(contactOrganizations)).toBe(1);
    expect(await db.$count(contactEmails)).toBe(0);
    expect(await db.$count(contactLinks)).toBe(0);
    expect(await db.$count(contactTags)).toBe(0);
    expect(
      await db.select({ contactId: tasks.contactId }).from(tasks).where(eq(tasks.id, task.id)),
    ).toEqual([{ contactId: null }]);
    expect(await db.$count(activities)).toBe(1);
    expect(
      await db.select({ contactId: activityContacts.contactId }).from(activityContacts),
    ).toEqual([{ contactId: colleague }]);
    expect((await listContacts(ownerId)).rows.map((row) => row.id)).toEqual([colleague]);
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.delete",
      entityId: id,
      before: {
        firstName: "Priya",
        lastName: "Sharma",
        tags: ["vip"],
        organizationIds: [organizationId],
      },
    });
    // The address is free again, and there is nobody left to delete twice.
    await create({ email: "priya@acme.com" });
    expect(await deleteContact(ownerId, id)).toBe(false);
  });

  it("filters by name prefix, email, tag and organization", async () => {
    const organizationId = await createOrg("Acme Design");
    await create({ email: "priya@acme.com", tags: "vip", organizationId });
    await create({ firstName: "Arjun", lastName: "Rao", email: "arjun@borealis.io" });
    const names = async (options: Parameters<typeof listContacts>[1]) =>
      (await listContacts(ownerId, options)).rows.map((row) => row.fullName);

    expect(await names({ q: "sha" })).toEqual(["Priya Sharma"]);
    expect(await names({ q: "arjun@bore" })).toEqual(["Arjun Rao"]);
    expect(await names({ q: "100%" })).toEqual([]);
    expect(await names({ organizationId })).toEqual(["Priya Sharma"]);
    const [vip] = await listTags(ownerId);
    expect(await names({ tagId: vip.id })).toEqual(["Priya Sharma"]);
  });

  it("lists the organization and primary email with each contact", async () => {
    const organizationId = await createOrg("Acme Design");
    const id = await create({ organizationId, email: "priya@acme.com" });
    await addContactEmail(
      ownerId,
      id,
      contactEmailInput.parse({ email: "other@acme.com", label: "personal" }),
    );

    const { rows } = await listContacts(ownerId);
    expect(rows).toMatchObject([
      {
        companies: [{ id: organizationId, name: "Acme Design" }],
        primaryEmail: "priya@acme.com",
      },
    ]);
  });

  it("pages by name without gaps or repeats", async () => {
    for (const firstName of ["Dev", "anil", "Chitra", "bela", "Esha"]) {
      await create({ firstName, lastName: "" });
    }

    const first = await listContacts(ownerId, { limit: 2 });
    const second = await listContacts(ownerId, {
      limit: 2,
      after: first.nextAfter!,
    });
    const third = await listContacts(ownerId, {
      limit: 2,
      after: second.nextAfter!,
    });

    expect(
      [...first.rows, ...second.rows, ...third.rows].map((row) => row.fullName),
    ).toEqual(["anil", "bela", "Chitra", "Dev", "Esha"]);
    expect(third.nextAfter).toBeNull();
  });

  it("keeps another owner's contacts out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const id = await create({ email: "priya@acme.com" });
    const emailId = (await getContact(ownerId, id))!.emails[0].id;

    expect(await getContact(otherId, id)).toBeNull();
    expect((await listContacts(otherId)).rows).toHaveLength(0);
    expect(await countContacts(otherId)).toBe(0);
    expect(await updateContact(otherId, id, contactInput.parse(form))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setContactArchived(otherId, id, true)).toBe(false);
    expect(await setContactRelationship(otherId, id, "client")).toBe(false);
    expect(await deleteContact(otherId, id)).toBe(false);
    expect(await getContact(ownerId, id)).toMatchObject({ relationshipType: "prospect" });
    // Neither end of a link may be someone else's: not the person, not the company.
    const mine = await createOrg("Acme Design");
    const theirs = await createOrg("Their Co", otherId);
    expect(
      await addContactCompany(otherId, id, theirs, { jobTitle: null }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await addContactCompany(ownerId, id, theirs, { jobTitle: null }),
    ).toEqual({ ok: false, reason: "unknown_organization" });
    await addContactCompany(ownerId, id, mine, { jobTitle: null });
    expect(await setPrimaryContact(otherId, id, mine, true)).toBe(false);
    expect(await setContactCompanyTitle(otherId, id, mine, "Spy")).toBe(false);
    expect(await removeContactCompany(otherId, id, mine)).toBe(false);
    expect((await getContact(ownerId, id))!.companies).toMatchObject([
      { id: mine, jobTitle: null, isPrimary: true },
    ]);
    expect(await removeContactEmail(otherId, id, emailId)).toBe(false);
    expect(await setPrimaryEmail(otherId, id, emailId)).toBe(false);
    expect(
      await addContactEmail(
        otherId,
        id,
        contactEmailInput.parse({ email: "x@y.co", label: "" }),
      ),
    ).toEqual({ ok: false, reason: "not_found" });
    // The same address is free for a different owner.
    await create({ email: "priya@acme.com" }, otherId);
  });
});
