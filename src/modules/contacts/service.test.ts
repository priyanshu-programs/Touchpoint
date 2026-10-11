import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { listTags } from "@/modules/tags/queries";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { countContacts, getContact, listContacts } from "./queries";
import {
  contactEmailInput,
  contactInput,
  contactLinkInput,
  newContactInput,
} from "./schema";
import {
  addContactEmail,
  addContactLink,
  createContact,
  removeContactEmail,
  removeContactLink,
  setContactArchived,
  setPrimaryEmail,
  updateContact,
} from "./service";

const form = {
  firstName: "Priya",
  lastName: "Sharma",
  organizationId: "",
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
type Form = typeof form & { email: string };
const input = (override: Partial<Form> = {}) =>
  newContactInput.parse({ ...form, email: "", ...override });

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
      newContactInput.safeParse({ ...form, email: "", ...override }).success,
    ).toBe(false);
  });

  it("does not accept an email on the edit form", () => {
    expect(contactInput.safeParse({ ...form, email: "a@b.co" }).success).toBe(
      false,
    );
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
      organizationName: "Acme Design",
      emails: [{ email: "priya@acme.com", isPrimary: true }],
      tags: ["vip"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "contact.create",
      entityId: id,
      after: { firstName: "Priya", email: "priya@acme.com", tags: ["vip"] },
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
      existing: { id, name: "Priya Sharma" },
    });
  });

  it("warns about a similar name until the owner confirms", async () => {
    const id = await create();

    const warned = await createContact(ownerId, input({ lastName: "Sharmaa" }));
    expect(warned).toEqual({
      ok: false,
      reason: "similar",
      candidates: [{ id, name: "Priya Sharma" }],
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
      candidates: [{ name: "Priya Sharma" }],
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
      existing: { id: first, name: "Priya Sharma" },
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

    const contact = await getContact(ownerId, id);
    expect(contact!.links).toMatchObject([{ kind: "linkedin" }]);

    expect(await removeContactLink(ownerId, id, contact!.links[0].id)).toBe(true);
    expect((await getContact(ownerId, id))!.links).toEqual([]);
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
      { organizationName: "Acme Design", primaryEmail: "priya@acme.com" },
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
