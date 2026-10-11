import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
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
  setOrganizationArchived,
  updateOrganization,
} from "./service";

const form = {
  name: "Acme Design",
  domain: "",
  website: "",
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
      input({ domain: " https://www.Acme.com/about?x=1 ", tags: "VIP, vip, design" }),
    ).toMatchObject({
      domain: "acme.com",
      website: null,
      industry: null,
      tags: ["VIP", "design"],
    });
  });

  it.each([
    ["a missing name", { name: "  " }],
    ["a domain without a dot", { domain: "localhost" }],
    ["a script link", { website: "javascript:alert(1)" }],
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

  it("filters by name prefix and by tag", async () => {
    await create({ tags: "design" });
    await create({ name: "Borealis Labs", tags: "research" });

    const byName = await listOrganizations(ownerId, { q: "bore" });
    expect(byName.rows.map((row) => row.name)).toEqual(["Borealis Labs"]);

    const design = (await listTags(ownerId)).find((tag) => tag.name === "design");
    const byTag = await listOrganizations(ownerId, { tagId: design!.id });
    expect(byTag.rows.map((row) => row.name)).toEqual(["Acme Design"]);
  });

  it("pages by name without gaps or repeats", async () => {
    for (const name of ["delta", "Alpha", "charlie", "Bravo", "echo"]) {
      await create({ name });
    }

    const first = await listOrganizations(ownerId, { limit: 2 });
    const second = await listOrganizations(ownerId, {
      limit: 2,
      after: first.nextAfter!,
    });
    const third = await listOrganizations(ownerId, {
      limit: 2,
      after: second.nextAfter!,
    });

    expect(
      [...first.rows, ...second.rows, ...third.rows].map((row) => row.name),
    ).toEqual(["Alpha", "Bravo", "charlie", "delta", "echo"]);
    expect(third.nextAfter).toBeNull();
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
    // The same domain is free for a different owner.
    const theirs = await createOrganization(otherId, input({ domain: "acme.com" }));
    expect(theirs.ok).toBe(true);
  });
});
