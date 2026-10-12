import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getLayout, resolveLayout } from "./queries";
import { layoutInput } from "./schema";
import { saveLayout } from "./service";
import { STANDARD_FIELDS } from "./standard";

const known = [
  { key: "name", label: "Name" },
  { key: "domain", label: "Domain" },
  { key: "phone", label: "Phone" },
];

describe("resolveLayout", () => {
  it("lists every field in the built-in order when nothing is stored", () => {
    expect(resolveLayout(known, [])).toEqual([
      { key: "name", label: "Name", hidden: false },
      { key: "domain", label: "Domain", hidden: false },
      { key: "phone", label: "Phone", hidden: false },
    ]);
  });

  it("keeps the stored order and what is hidden", () => {
    expect(
      resolveLayout(known, [
        { key: "phone", hidden: false },
        { key: "name", hidden: true },
        { key: "domain", hidden: false },
      ]).map(({ key, hidden }) => [key, hidden]),
    ).toEqual([
      ["phone", false],
      ["name", true],
      ["domain", false],
    ]);
  });

  it("puts a field the stored order has never seen at the end, shown", () => {
    expect(
      resolveLayout(known, [
        { key: "phone", hidden: true },
        { key: "name", hidden: false },
      ]).map(({ key, hidden }) => [key, hidden]),
    ).toEqual([
      ["phone", true],
      ["name", false],
      ["domain", false],
    ]);
  });

  it("drops a key that no longer names a field", () => {
    expect(
      resolveLayout(known, [
        { key: "fax", hidden: false },
        { key: "domain", hidden: false },
      ]).map(({ key }) => key),
    ).toEqual(["domain", "name", "phone"]);
  });
});

describe("layoutInput", () => {
  it.each([
    ["a field listed twice", [{ key: "name", hidden: false }, { key: "name", hidden: true }]],
    ["an unexpected property", [{ key: "name", hidden: false, label: "Company" }]],
    ["a hidden flag that is not a boolean", [{ key: "name", hidden: "yes" }]],
    ["an empty key", [{ key: "", hidden: false }]],
    [
      "more entries than any record has fields",
      Array.from({ length: 101 }, (_, index) => ({ key: `f${index}`, hidden: false })),
    ],
  ])("rejects %s", (_label, fields) => {
    expect(layoutInput.safeParse(fields).success).toBe(false);
  });
});

describe("saveLayout", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("stores the order and the hidden fields for one kind of record", async () => {
    const saved = await saveLayout(ownerId, "organization", [
      { key: "industry", hidden: false },
      { key: "domain", hidden: true },
    ]);

    expect(saved).toBe(true);
    const layout = await getLayout(ownerId, "organization");
    expect(layout.slice(0, 3)).toEqual([
      { key: "industry", label: "Industry", hidden: false },
      { key: "domain", label: "Domain", hidden: true },
      { key: "name", label: "Name", hidden: false },
    ]);
    expect(layout).toHaveLength(STANDARD_FIELDS.organization.length);
    // A person's fields are arranged apart from a company's.
    expect((await getLayout(ownerId, "contact")).map(({ key }) => key)).toEqual(
      STANDARD_FIELDS.contact.map(({ key }) => key),
    );
  });

  it("replaces the earlier layout and records both in the audit log", async () => {
    const first = [{ key: "domain", hidden: true }];
    const second = [
      { key: "domain", hidden: false },
      { key: "name", hidden: false },
    ];
    await saveLayout(ownerId, "organization", first);
    await saveLayout(ownerId, "organization", second);

    expect((await getLayout(ownerId, "organization"))[0]).toMatchObject({
      key: "domain",
      hidden: false,
    });
    const { rows } = await listAudit(ownerId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      action: "fields.layout",
      actor: "user",
      entityType: "field_layout",
      entityId: "organization",
      before: first,
      after: second,
    });
  });

  it("refuses a field the record does not have and stores nothing", async () => {
    // A person's field, sent for a company.
    const saved = await saveLayout(ownerId, "organization", [
      { key: "name", hidden: true },
      { key: "firstName", hidden: false },
    ]);

    expect(saved).toBe(false);
    expect((await getLayout(ownerId, "organization"))[0]).toMatchObject({
      key: "name",
      hidden: false,
    });
    expect((await listAudit(ownerId)).rows).toHaveLength(0);
  });

  it("keeps each owner's layout apart", async () => {
    const otherId = await createTestOwner("other@example.com");
    await saveLayout(ownerId, "contact", [{ key: "department", hidden: true }]);

    expect(
      (await getLayout(otherId, "contact")).some(({ hidden }) => hidden),
    ).toBe(false);
    expect((await listAudit(otherId)).rows).toHaveLength(0);
  });
});
