import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  contacts,
  enrichmentRuns,
  fieldProvenance,
  organizationLogos,
  organizationTags,
  tasks,
} from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { listTags } from "@/modules/tags/queries";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  countOrganizations,
  getOrganization,
  listOrganizations,
} from "./queries";
import { normalizeDomain, organizationInput } from "./schema";
import {
  createOrganization,
  deleteOrganization,
  setOrganizationArchived,
  setOrganizationStatus,
  updateOrganization,
} from "./service";

const form = {
  name: "Acme Design",
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
const input = (override: Partial<typeof form> = {}) =>
  organizationInput.parse({ ...form, ...override });

describe("organizationInput", () => {
  it("stores blank fields as null and normalises the domain", () => {
    expect(
      input({
        domain: " https://www.Acme.com/about?x=1 ",
        phone: " +91 (20) 5550-1234 ",
        email: " Hello@Acme.com ",
        tags: "VIP, vip, design",
      }),
    ).toMatchObject({
      domain: "acme.com",
      phone: "+91 (20) 5550-1234",
      email: "hello@acme.com",
      website: null,
      industry: null,
      tags: ["VIP", "design"],
    });
  });

  it.each([
    ["a missing name", { name: "  " }],
    ["a domain without a dot", { domain: "localhost" }],
    ["a script link", { website: "javascript:alert(1)" }],
    ["a phone number with letters in it", { phone: "call 555 0000" }],
    ["a phone number too short to dial", { phone: "12345" }],
    ["an email without a domain", { email: "hello@" }],
    ["an unknown status", { status: "enemy" }],
    ["an unexpected field", { ownerId: "x" }],
  ])("rejects %s", (_label, override) => {
    expect(organizationInput.safeParse({ ...form, ...override }).success).toBe(
      false,
    );
  });

  it("reduces any address form to the bare domain", () => {
    expect(normalizeDomain("HTTP://WWW.Example.co.in:8080/path")).toBe(
      "example.co.in",
    );
  });
});

describe("organizations", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  async function create(override: Partial<typeof form> = {}) {
    const result = await createOrganization(ownerId, input(override), {
      confirmSimilar: true,
    });
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  it("creates an organization with tags and an audit row", async () => {
    const id = await create({ domain: "acme.com", tags: "design, vip" });

    expect(await getOrganization(ownerId, id)).toMatchObject({
      name: "Acme Design",
      domain: "acme.com",
      tags: ["design", "vip"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "organization.create",
      entityId: id,
      after: { name: "Acme Design", tags: ["design", "vip"] },
    });
  });

  it("refuses a second organization with the same domain", async () => {
    const id = await create({ domain: "acme.com" });

    const result = await createOrganization(
      ownerId,
      input({ name: "Completely Different", domain: "www.acme.com" }),
    );

    expect(result).toEqual({
      ok: false,
      reason: "duplicate",
      existing: { id, name: "Acme Design" },
    });
  });

  it("warns about a similar name until the owner confirms", async () => {
    const id = await create();

    const warned = await createOrganization(
      ownerId,
      input({ name: "Acme Designs" }),
    );
    expect(warned).toEqual({
      ok: false,
      reason: "similar",
      candidates: [{ id, name: "Acme Design" }],
    });

    const confirmed = await createOrganization(
      ownerId,
      input({ name: "Acme Designs" }),
      { confirmSimilar: true },
    );
    expect(confirmed.ok).toBe(true);
  });

  it("does not warn about an unrelated name", async () => {
    await create();
    const result = await createOrganization(ownerId, input({ name: "Borealis" }));
    expect(result.ok).toBe(true);
  });

  it("updates fields and tags and records before and after", async () => {
    const id = await create({ tags: "design" });

    const result = await updateOrganization(
      ownerId,
      id,
      input({ name: "Acme Studio", status: "client", tags: "vip" }),
    );

    expect(result).toEqual({ ok: true, id });
    expect(await getOrganization(ownerId, id)).toMatchObject({
      name: "Acme Studio",
      status: "client",
      tags: ["vip"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "organization.update",
      before: { name: "Acme Design", tags: ["design"] },
      after: { name: "Acme Studio", tags: ["vip"] },
    });
  });

  it("will not move an organization onto another one's domain", async () => {
    const first = await create({ domain: "acme.com" });
    const second = await create({ name: "Borealis", domain: "borealis.io" });

    const result = await updateOrganization(
      ownerId,
      second,
      input({ name: "Borealis", domain: "acme.com" }),
    );

    expect(result).toMatchObject({ reason: "duplicate", existing: { id: first } });
  });

  it("archives and restores, and lists each state separately", async () => {
    const id = await create();

    expect(await setOrganizationArchived(ownerId, id, true)).toBe(true);
    expect((await listOrganizations(ownerId)).rows).toHaveLength(0);
    expect((await listOrganizations(ownerId, { archived: true })).rows).toHaveLength(1);
    expect(await countOrganizations(ownerId)).toBe(0);

    await setOrganizationArchived(ownerId, id, false);
    expect((await listOrganizations(ownerId)).rows).toHaveLength(1);
    expect(await countOrganizations(ownerId)).toBe(1);
  });

  it("switches the status from the panel and records it", async () => {
    const id = await create({ city: "Pune" });

    expect(await setOrganizationStatus(ownerId, id, "client")).toBe(true);

    expect(await getOrganization(ownerId, id)).toMatchObject({
      status: "client",
      city: "Pune",
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "organization.set_status",
      entityId: id,
      before: { status: "prospect" },
      after: { status: "client" },
    });
  });

  it("filters by name prefix and by tag", async () => {
    await create({ tags: "design" });
    await create({ name: "Borealis Labs", tags: "research" });

    const byName = await listOrganizations(ownerId, { q: "bore" });
    expect(byName.rows.map((row) => row.name)).toEqual(["Borealis Labs"]);

    await create({ name: "Cobalt Works", domain: "cobalt.example.com" });
    const byDomain = await listOrganizations(ownerId, {
      q: "Cobalt.Example.com",
    });
    expect(byDomain.rows.map((row) => row.name)).toEqual(["Cobalt Works"]);

    const design = (await listTags(ownerId)).find((tag) => tag.name === "design");
    const byTag = await listOrganizations(ownerId, { tagId: design!.id });
    expect(byTag.rows.map((row) => row.name)).toEqual(["Acme Design"]);
  });

  it("pages by name without gaps or repeats", async () => {
    for (const name of ["delta", "Alpha", "charlie", "Bravo", "echo"]) {
      await create({ name });
    }

    const pages = await Promise.all(
      [0, 2, 4].map((offset) =>
        listOrganizations(ownerId, { limit: 2, offset }),
      ),
    );

    expect(pages.flatMap((page) => page.rows.map((row) => row.name))).toEqual([
      "Alpha",
      "Bravo",
      "charlie",
      "delta",
      "echo",
    ]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
  });

  it("filters by status", async () => {
    await create();
    await create({ name: "Borealis Labs", status: "client" });

    const clients = await listOrganizations(ownerId, { status: "client" });
    expect(clients.rows.map((row) => row.name)).toEqual(["Borealis Labs"]);
  });

  it("sorts by contacts and by last activity, with untouched companies last", async () => {
    const acme = await create({ industry: "Design" });
    const borealis = await create({ name: "Borealis Labs" });
    await create({ name: "Cobalt Works" });
    const contact = (organizationId: string, firstName: string) =>
      createContact(
        ownerId,
        newContactInput.parse({
          email: "",
          firstName,
          lastName: "",
          organizationId,
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
        }),
      );
    await contact(acme, "Asha");
    await contact(borealis, "Bilal");
    await contact(borealis, "Chitra");
    const earlier = new Date("2026-10-01T09:00:00Z");
    const later = new Date("2026-10-05T09:00:00Z");
    await db.insert(activities).values([
      { ownerId, kind: "call", title: "First call", occurredAt: earlier, organizationId: acme },
      { ownerId, kind: "call", title: "Second call", occurredAt: later, organizationId: acme },
      { ownerId, kind: "note", title: "Intro", occurredAt: earlier, organizationId: borealis },
    ]);
    const names = async (
      options: Parameters<typeof listOrganizations>[1],
    ) => (await listOrganizations(ownerId, options)).rows.map((row) => row.name);

    expect(await names({ sort: "contacts", dir: "desc" })).toEqual([
      "Borealis Labs",
      "Acme Design",
      "Cobalt Works",
    ]);
    expect(await names({ sort: "contacts", dir: "asc" })).toEqual([
      "Cobalt Works",
      "Acme Design",
      "Borealis Labs",
    ]);
    expect(await names({ sort: "activity", dir: "desc" })).toEqual([
      "Acme Design",
      "Borealis Labs",
      "Cobalt Works",
    ]);
    expect(await names({ sort: "activity", dir: "asc" })).toEqual([
      "Borealis Labs",
      "Acme Design",
      "Cobalt Works",
    ]);
    expect(await names({ sort: "name", dir: "desc" })).toEqual([
      "Cobalt Works",
      "Borealis Labs",
      "Acme Design",
    ]);

    const { rows } = await listOrganizations(ownerId);
    expect(rows[0]).toMatchObject({
      name: "Acme Design",
      industry: "Design",
      contactCount: 1,
      lastActivityAt: later,
    });
    expect(rows[2].lastActivityAt).toBeNull();
  });

  it("deletes a company and what belongs to it, and keeps its people and history", async () => {
    const id = await create({ domain: "acme.test", tags: "design" });
    await updateOrganization(
      ownerId,
      id,
      input({ domain: "acme.test", tags: "design", city: "Pune" }),
    );
    await db.insert(organizationLogos).values({
      organizationId: id,
      ownerId,
      contentType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
      sha256: "abc",
      sourceUrl: "https://acme.test/icon.png",
    });
    const [contact] = await db
      .insert(contacts)
      .values({ ownerId, firstName: "Asha", organizationId: id })
      .returning({ id: contacts.id });
    const [task] = await db
      .insert(tasks)
      .values({ ownerId, title: "Send proposal", organizationId: id })
      .returning({ id: tasks.id });
    const [activity] = await db
      .insert(activities)
      .values({
        ownerId,
        kind: "call",
        title: "Intro call",
        occurredAt: new Date("2026-10-01T09:00:00Z"),
        organizationId: id,
      })
      .returning({ id: activities.id });

    expect(await deleteOrganization(ownerId, id)).toBe(true);

    expect(await getOrganization(ownerId, id)).toBeNull();
    for (const table of [
      organizationTags,
      organizationLogos,
      enrichmentRuns,
      fieldProvenance,
    ]) {
      expect(await db.$count(table)).toBe(0);
    }
    const kept = async (
      table: typeof contacts | typeof tasks | typeof activities,
      rowId: string,
    ) =>
      db
        .select({ organizationId: table.organizationId })
        .from(table)
        .where(eq(table.id, rowId));
    expect(await kept(contacts, contact.id)).toEqual([{ organizationId: null }]);
    expect(await kept(tasks, task.id)).toEqual([{ organizationId: null }]);
    expect(await kept(activities, activity.id)).toEqual([
      { organizationId: null },
    ]);
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "organization.delete",
      entityId: id,
      before: { name: "Acme Design", domain: "acme.test", tags: ["design"] },
    });
    // The domain is free again.
    await create({ domain: "acme.test" });
    expect(await deleteOrganization(ownerId, id)).toBe(false);
  });

  it("keeps another owner's organizations out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const id = await create({ domain: "acme.com" });

    expect(await getOrganization(otherId, id)).toBeNull();
    expect((await listOrganizations(otherId)).rows).toHaveLength(0);
    expect(await countOrganizations(otherId)).toBe(0);
    expect(await updateOrganization(otherId, id, input())).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setOrganizationArchived(otherId, id, true)).toBe(false);
    expect(await setOrganizationStatus(otherId, id, "client")).toBe(false);
    expect(await deleteOrganization(otherId, id)).toBe(false);
    expect(await getOrganization(ownerId, id)).not.toBeNull();
    // The same domain is free for a different owner.
    const theirs = await createOrganization(otherId, input({ domain: "acme.com" }));
    expect(theirs.ok).toBe(true);
  });
});
