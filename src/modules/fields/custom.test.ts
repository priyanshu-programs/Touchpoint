import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { customFieldDefs } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { getContact } from "@/modules/contacts/queries";
import { contactInput, newContactInput } from "@/modules/contacts/schema";
import { createContact, updateContact } from "@/modules/contacts/service";
import { getOrganization } from "@/modules/organizations/queries";
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  updateOrganization,
} from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { formatCustomValue } from "./format";
import { getLayout, listCustomFields, optionUse } from "./queries";
import {
  customFieldChange,
  customFieldInput,
  customValuesInput,
  MAX_CUSTOM_FIELDS,
} from "./schema";
import {
  addSuggestedField,
  createCustomField,
  deleteCustomField,
  removeCustomFieldOption,
  saveLayout,
  setCustomValue,
  updateCustomField,
} from "./service";
import { STANDARD_FIELDS } from "./standard";

const text = (label: string) =>
  customFieldInput.parse({ label, type: "text", options: [] });
const select = (label: string, options: string[]) =>
  customFieldInput.parse({ label, type: "select", options });

const company = organizationInput.parse({
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
});
const person = {
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

async function created(result: Promise<{ ok: boolean; id?: string }>) {
  const outcome = await result;
  expect(outcome.ok).toBe(true);
  return outcome.id!;
}

describe("customFieldInput", () => {
  it("trims the name and the options", () => {
    expect(
      customFieldInput.parse({
        label: " Segment ",
        type: "select",
        options: [" Enterprise ", "SMB"],
      }),
    ).toEqual({ label: "Segment", type: "select", options: ["Enterprise", "SMB"] });
  });

  it.each([
    ["no name", { label: "  ", type: "text", options: [] }],
    ["a name over 60 characters", { label: "x".repeat(61), type: "text", options: [] }],
    ["a kind this app does not have", { label: "Owner", type: "user", options: [] }],
    ["a dropdown with nothing to choose", { label: "Tier", type: "select", options: [] }],
    ["options on a field that is not a dropdown", { label: "Tier", type: "text", options: ["A"] }],
    ["an option listed twice", { label: "Tier", type: "select", options: ["Gold", "gold"] }],
    ["an empty option", { label: "Tier", type: "select", options: ["Gold", " "] }],
    [
      "more than 30 options",
      {
        label: "Tier",
        type: "select",
        options: Array.from({ length: 31 }, (_, index) => `Option ${index}`),
      },
    ],
    ["an unexpected property", { label: "Tier", type: "text", options: [], key: "name" }],
  ])("rejects %s", (_label, field) => {
    expect(customFieldInput.safeParse(field).success).toBe(false);
  });
});

describe("customValuesInput", () => {
  const values = customValuesInput([
    { key: "notes", label: "Notes", type: "text", options: [] },
    { key: "score", label: "Score", type: "number", options: [] },
    { key: "tier", label: "Tier", type: "select", options: ["Gold", "Silver"] },
    { key: "renewal", label: "Renewal", type: "date", options: [] },
  ]);
  const blank = { notes: "", score: "", tier: "", renewal: "" };

  it("takes each value in its field's own kind and leaves blank fields out", () => {
    expect(
      values.parse({
        notes: " Met at the fair ",
        score: " 7.5 ",
        tier: "Gold",
        renewal: "2027-03-31",
      }),
    ).toEqual({
      notes: "Met at the fair",
      score: 7.5,
      tier: "Gold",
      renewal: "2027-03-31",
    });
    expect(values.parse({ ...blank, score: "0" })).toEqual({ score: 0 });
    expect(values.parse(blank)).toEqual({});
  });

  it.each([
    ["words where a number goes", { score: "seven" }, "Score takes a number"],
    ["an option the field does not offer", { tier: "Bronze" }, "Choose one of the options for Tier"],
    ["a date that is not one", { renewal: "31/03/2027" }, "Renewal takes a date"],
    ["a day that does not exist", { renewal: "2027-02-30" }, "Renewal takes a date"],
    ["text over 500 characters", { notes: "x".repeat(501) }, undefined],
  ])("rejects %s", (_label, change, message) => {
    const parsed = values.safeParse({ ...blank, ...change });
    expect(parsed.success).toBe(false);
    if (message) expect(parsed.error!.issues[0].message).toBe(message);
  });

  it("rejects a value for a field the owner does not have", () => {
    expect(values.safeParse({ ...blank, secret: "x" }).success).toBe(false);
  });
});

describe("formatCustomValue", () => {
  it("shows a number grouped, a date written out and the rest as kept", () => {
    expect(formatCustomValue("number", 12500.5)).toBe("12,500.5");
    expect(formatCustomValue("number", 0)).toBe("0");
    expect(formatCustomValue("date", "2027-03-31")).toBe("Wed, 31 Mar 2027");
    expect(formatCustomValue("select", "Gold")).toBe("Gold");
    expect(formatCustomValue("text", undefined)).toBeNull();
  });
});

describe("custom fields", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("adds a field to one kind of record, keyed from its name", async () => {
    await created(createCustomField(ownerId, "organization", text("Lead source")));
    await created(createCustomField(ownerId, "organization", text("Lead-source")));
    await created(createCustomField(ownerId, "organization", text("नाम")));

    expect(
      (await listCustomFields(ownerId, "organization")).map(({ key, label }) => [
        key,
        label,
      ]),
    ).toEqual([
      ["lead_source", "Lead source"],
      ["lead_source_2", "Lead-source"],
      ["field", "नाम"],
    ]);
    expect(await listCustomFields(ownerId, "contact")).toEqual([]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "field.create",
      entityType: "custom_field",
      after: { entityType: "organization", key: "field", type: "text" },
    });
  });

  it("refuses a name a standard field or another custom field has", async () => {
    await created(createCustomField(ownerId, "organization", text("Tier")));

    expect(
      await createCustomField(ownerId, "organization", text("phone")),
    ).toEqual({ ok: false, reason: "label_taken" });
    expect(
      await createCustomField(ownerId, "organization", text("TIER")),
    ).toEqual({ ok: false, reason: "label_taken" });
    // A person has no field called Tier or Domain.
    await created(createCustomField(ownerId, "contact", text("Tier")));
    await created(createCustomField(ownerId, "contact", text("Domain")));
  });

  it("stops at fifty fields for a kind of record", async () => {
    await db.insert(customFieldDefs).values(
      Array.from({ length: MAX_CUSTOM_FIELDS }, (_, index) => ({
        ownerId,
        entityType: "organization" as const,
        key: `f${index}`,
        label: `Field ${index}`,
        type: "text" as const,
      })),
    );

    expect(
      await createCustomField(ownerId, "organization", text("One more")),
    ).toEqual({ ok: false, reason: "limit" });
    await created(createCustomField(ownerId, "contact", text("One more")));
  });

  it("adds a suggested field as this app defines it, once", async () => {
    await created(addSuggestedField(ownerId, "organization", "segment"));

    expect(await listCustomFields(ownerId, "organization")).toMatchObject([
      {
        key: "segment",
        label: "Segment",
        type: "select",
        options: ["Enterprise", "Mid-Market", "SMB"],
      },
    ]);
    expect(await addSuggestedField(ownerId, "organization", "segment")).toEqual({
      ok: false,
      reason: "label_taken",
    });
    expect(await addSuggestedField(ownerId, "organization", "owner")).toEqual({
      ok: false,
      reason: "not_found",
    });
    // Nothing is suggested for a person.
    expect(await addSuggestedField(ownerId, "contact", "segment")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("renames a field and adds options without losing the ones it has", async () => {
    const id = await created(
      createCustomField(ownerId, "organization", select("Tier", ["Gold", "Silver"])),
    );
    await created(createCustomField(ownerId, "organization", text("Notes")));

    expect(
      await updateCustomField(
        ownerId,
        id,
        customFieldChange.parse({ label: "Level", options: ["gold", "Bronze"] }),
      ),
    ).toEqual({ ok: true, id });
    expect((await listCustomFields(ownerId, "organization"))[0]).toMatchObject({
      key: "tier",
      label: "Level",
      options: ["Gold", "Silver", "Bronze"],
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "field.update",
      before: { label: "Tier", options: ["Gold", "Silver"] },
      after: { label: "Level", options: ["Gold", "Silver", "Bronze"] },
    });

    expect(
      await updateCustomField(
        ownerId,
        id,
        customFieldChange.parse({ label: "Notes", options: [] }),
      ),
    ).toEqual({ ok: false, reason: "label_taken" });
    expect(
      await updateCustomField(
        ownerId,
        id,
        customFieldChange.parse({
          label: "Level",
          options: Array.from({ length: 28 }, (_, index) => `Extra ${index}`),
        }),
      ),
    ).toEqual({ ok: false, reason: "too_many_options" });
  });

  it("keeps options off a field that is not a dropdown", async () => {
    const id = await created(
      createCustomField(ownerId, "organization", text("Notes")),
    );

    await updateCustomField(
      ownerId,
      id,
      customFieldChange.parse({ label: "Notes", options: ["A"] }),
    );
    expect((await listCustomFields(ownerId, "organization"))[0].options).toEqual(
      [],
    );
  });

  it("lists custom fields after the standard ones and arranges the two apart", async () => {
    await created(createCustomField(ownerId, "organization", text("Tier")));
    await created(createCustomField(ownerId, "organization", text("Notes")));
    const keys = async () =>
      (await getLayout(ownerId, "organization")).map(({ key }) => key);
    const standard = STANDARD_FIELDS.organization.map(({ key }) => key);

    expect(await keys()).toEqual([...standard, "custom.tier", "custom.notes"]);

    // The owner's own fields are put in order, then the standard ones.
    expect(
      await saveLayout(ownerId, "organization", [
        { key: "custom.notes", hidden: true },
        { key: "custom.tier", hidden: false },
      ]),
    ).toBe(true);
    expect(
      await saveLayout(ownerId, "organization", [
        { key: "domain", hidden: false },
        { key: "name", hidden: false },
      ]),
    ).toBe(true);

    const layout = await getLayout(ownerId, "organization");
    expect(layout.slice(0, 2).map(({ key }) => key)).toEqual(["domain", "name"]);
    expect(layout.slice(-2)).toEqual([
      { key: "custom.notes", label: "Notes", hidden: true },
      { key: "custom.tier", label: "Tier", hidden: false },
    ]);
  });

  it("refuses a layout naming a custom field the record does not have", async () => {
    await created(createCustomField(ownerId, "contact", text("Tier")));

    expect(
      await saveLayout(ownerId, "organization", [
        { key: "custom.tier", hidden: false },
      ]),
    ).toBe(false);
  });

  it("keeps a company's and a person's values, and leaves them alone when none are sent", async () => {
    const organization = await createOrganization(ownerId, company);
    const contact = await createContact(ownerId, newContactInput.parse({
      ...person,
      organizationId: "",
      email: "",
    }));
    if (!organization.ok || !contact.ok) throw new Error("not created");

    await updateOrganization(ownerId, organization.id, company, {
      tier: "Gold",
      score: 7,
    });
    await updateContact(ownerId, contact.id, contactInput.parse(person), {
      notes: "Met at the fair",
    });
    expect((await listAudit(ownerId)).rows[1]).toMatchObject({
      action: "organization.update",
      before: { custom: {} },
      after: { custom: { tier: "Gold", score: 7 } },
    });

    // An edit from somewhere that knows nothing of custom fields.
    await updateOrganization(ownerId, organization.id, {
      ...company,
      city: "Pune",
    });
    await updateContact(ownerId, contact.id, contactInput.parse(person));

    expect(await getOrganization(ownerId, organization.id)).toMatchObject({
      city: "Pune",
      custom: { tier: "Gold", score: 7 },
    });
    expect((await getContact(ownerId, contact.id))!.custom).toEqual({
      notes: "Met at the fair",
    });
  });

  it("deletes a field with its values and its place in Details", async () => {
    const tier = await created(
      createCustomField(ownerId, "organization", text("Tier")),
    );
    await created(createCustomField(ownerId, "organization", text("Notes")));
    // A person's field of the same name is another field.
    await created(createCustomField(ownerId, "contact", text("Tier")));
    const organization = await createOrganization(ownerId, company);
    const contact = await createContact(ownerId, newContactInput.parse({
      ...person,
      organizationId: "",
      email: "",
    }));
    if (!organization.ok || !contact.ok) throw new Error("not created");
    await updateOrganization(ownerId, organization.id, company, {
      tier: "Gold",
      notes: "Keep",
    });
    await updateContact(ownerId, contact.id, contactInput.parse(person), {
      tier: "Silver",
    });
    await saveLayout(ownerId, "organization", [
      { key: "custom.tier", hidden: true },
      { key: "custom.notes", hidden: false },
    ]);

    expect(await deleteCustomField(ownerId, tier)).toBe(true);

    expect((await getOrganization(ownerId, organization.id))!.custom).toEqual({
      notes: "Keep",
    });
    expect((await getContact(ownerId, contact.id))!.custom).toEqual({
      tier: "Silver",
    });
    expect(
      (await getLayout(ownerId, "organization")).slice(-1).map(({ key }) => key),
    ).toEqual(["custom.notes"]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "field.delete",
      before: { key: "tier", label: "Tier" },
    });

    // The name is free again, and the field starts out shown and empty.
    await created(createCustomField(ownerId, "organization", text("Tier")));
    expect((await getLayout(ownerId, "organization")).slice(-1)).toEqual([
      { key: "custom.tier", label: "Tier", hidden: false },
    ]);
  });

  it("creates a company and a person with values of the owner's fields", async () => {
    const organization = await createOrganization(ownerId, company, {
      custom: { tier: "Gold" },
    });
    const contact = await createContact(
      ownerId,
      newContactInput.parse({ ...person, organizationId: "", email: "" }),
      { custom: { score: 7 } },
    );
    if (!organization.ok || !contact.ok) throw new Error("not created");

    expect((await getOrganization(ownerId, organization.id))!.custom).toEqual({
      tier: "Gold",
    });
    expect((await getContact(ownerId, contact.id))!.custom).toEqual({ score: 7 });
    expect((await listAudit(ownerId)).rows[1]).toMatchObject({
      action: "organization.create",
      after: { custom: { tier: "Gold" } },
    });
  });

  it("removes a dropdown's option and clears it where it was held", async () => {
    const tier = await created(
      createCustomField(
        ownerId,
        "organization",
        select("Tier", ["Gold", "Silver", "Bronze"]),
      ),
    );
    // A person's field of the same name keeps its own values.
    await created(createCustomField(ownerId, "contact", select("Tier", ["Gold"])));
    const ids: string[] = [];
    for (const [name, value] of [
      ["Acme Design", "Gold"],
      ["Bolt Labs", "Gold"],
      ["Cove Studio", "Silver"],
    ]) {
      ids.push(
        await created(
          createOrganization(
            ownerId,
            { ...company, name },
            { confirmSimilar: true, custom: { tier: value, notes: name } },
          ),
        ),
      );
    }
    const contact = await createContact(
      ownerId,
      newContactInput.parse({ ...person, organizationId: "", email: "" }),
      { custom: { tier: "Gold" } },
    );
    if (!contact.ok) throw new Error("not created");
    expect(await optionUse(ownerId, "organization")).toEqual({
      tier: { Gold: 2, Silver: 1 },
    });

    expect(await removeCustomFieldOption(ownerId, tier, "Gold")).toEqual({
      ok: true,
      cleared: 2,
    });

    expect(
      (await listCustomFields(ownerId, "organization"))[0].options,
    ).toEqual(["Silver", "Bronze"]);
    expect((await getOrganization(ownerId, ids[0]))!.custom).toEqual({
      notes: "Acme Design",
    });
    expect((await getOrganization(ownerId, ids[2]))!.custom).toEqual({
      tier: "Silver",
      notes: "Cove Studio",
    });
    expect((await getContact(ownerId, contact.id))!.custom).toEqual({
      tier: "Gold",
    });
    expect(await optionUse(ownerId, "organization")).toEqual({
      tier: { Silver: 1 },
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "field.option_remove",
      before: { options: ["Gold", "Silver", "Bronze"] },
      after: { options: ["Silver", "Bronze"], removed: "Gold", cleared: 2 },
    });
  });

  it("refuses to remove an option it does not offer, or the last one", async () => {
    const tier = await created(
      createCustomField(ownerId, "organization", select("Tier", ["Gold"])),
    );
    const notes = await created(
      createCustomField(ownerId, "organization", text("Notes")),
    );

    expect(await removeCustomFieldOption(ownerId, tier, "gold")).toEqual({
      ok: false,
      reason: "unknown_option",
    });
    expect(await removeCustomFieldOption(ownerId, tier, "Gold")).toEqual({
      ok: false,
      reason: "last_option",
    });
    expect(await removeCustomFieldOption(ownerId, notes, "Gold")).toEqual({
      ok: false,
      reason: "unknown_option",
    });
    expect((await listCustomFields(ownerId, "organization"))[0].options).toEqual([
      "Gold",
    ]);
  });

  it("keeps another owner's fields and values out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const theirs = await created(
      createCustomField(otherId, "organization", select("Tier", ["Gold"])),
    );
    const organization = await createOrganization(otherId, company);
    if (!organization.ok) throw new Error("not created");
    await updateOrganization(otherId, organization.id, company, { tier: "Gold" });

    expect(await listCustomFields(ownerId, "organization")).toEqual([]);
    expect(
      await updateCustomField(
        ownerId,
        theirs,
        customFieldChange.parse({ label: "Mine", options: [] }),
      ),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteCustomField(ownerId, theirs)).toBe(false);
    expect(await removeCustomFieldOption(ownerId, theirs, "Gold")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await optionUse(ownerId, "organization")).toEqual({});
    expect(
      await saveLayout(ownerId, "organization", [
        { key: "custom.tier", hidden: true },
      ]),
    ).toBe(false);

    expect((await listCustomFields(otherId, "organization"))[0].label).toBe(
      "Tier",
    );
    expect((await getOrganization(otherId, organization.id))!.custom).toEqual({
      tier: "Gold",
    });
    expect(
      await setCustomValue(ownerId, "organization", organization.id, "tier", ""),
    ).toEqual({ ok: false, reason: "not_found" });
    // Not even through a field of the same key that is the owner's own.
    await created(createCustomField(ownerId, "organization", select("Tier", ["Gold"])));
    expect(
      await setCustomValue(ownerId, "organization", organization.id, "tier", ""),
    ).toEqual({ ok: false, reason: "not_found" });
    expect((await getOrganization(otherId, organization.id))!.custom).toEqual({
      tier: "Gold",
    });
  });

  it("sets one value in place, in its field's own kind, leaving the others", async () => {
    await created(createCustomField(ownerId, "organization", text("Notes")));
    await created(createCustomField(ownerId, "organization", select("Tier", ["Gold", "Silver"])));
    await created(
      createCustomField(
        ownerId,
        "organization",
        customFieldInput.parse({ label: "Score", type: "number", options: [] }),
      ),
    );
    await created(
      createCustomField(
        ownerId,
        "contact",
        customFieldInput.parse({ label: "Met on", type: "date", options: [] }),
      ),
    );
    const organization = await createOrganization(ownerId, company, {
      custom: { notes: "Keep" },
    });
    const contact = await createContact(
      ownerId,
      newContactInput.parse({ ...person, organizationId: "", email: "" }),
    );
    if (!organization.ok || !contact.ok) throw new Error("not created");

    expect(
      await setCustomValue(ownerId, "organization", organization.id, "tier", "Gold"),
    ).toEqual({ ok: true });
    expect(
      await setCustomValue(ownerId, "organization", organization.id, "score", " 7.5 "),
    ).toEqual({ ok: true });
    expect(
      await setCustomValue(ownerId, "contact", contact.id, "met_on", "2026-10-20"),
    ).toEqual({ ok: true });
    expect((await getOrganization(ownerId, organization.id))!.custom).toEqual({
      notes: "Keep",
      tier: "Gold",
      score: 7.5,
    });
    expect((await getContact(ownerId, contact.id))!.custom).toEqual({
      met_on: "2026-10-20",
    });
    expect((await listAudit(ownerId)).rows[1]).toMatchObject({
      action: "organization.update",
      entityType: "organization",
      entityId: organization.id,
      before: { custom: { score: null } },
      after: { custom: { score: 7.5 } },
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "contact.update",
      entityType: "contact",
      after: { custom: { met_on: "2026-10-20" } },
    });

    // A blank clears the value; the same value again writes nothing.
    const audited = (await listAudit(ownerId)).rows.length;
    await setCustomValue(ownerId, "organization", organization.id, "tier", "");
    await setCustomValue(ownerId, "organization", organization.id, "score", "7.5");
    expect((await getOrganization(ownerId, organization.id))!.custom).toEqual({
      notes: "Keep",
      score: 7.5,
    });
    expect((await listAudit(ownerId)).rows).toHaveLength(audited + 1);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      before: { custom: { tier: "Gold" } },
      after: { custom: { tier: null } },
    });
  });

  it("refuses a value its field does not take, and a field or record it does not know", async () => {
    await created(createCustomField(ownerId, "organization", select("Tier", ["Gold"])));
    await created(
      createCustomField(
        ownerId,
        "organization",
        customFieldInput.parse({ label: "Score", type: "number", options: [] }),
      ),
    );
    const organization = await createOrganization(ownerId, company);
    const contact = await createContact(
      ownerId,
      newContactInput.parse({ ...person, organizationId: "", email: "" }),
    );
    if (!organization.ok || !contact.ok) throw new Error("not created");

    expect(
      await setCustomValue(ownerId, "organization", organization.id, "tier", "Bronze"),
    ).toEqual({
      ok: false,
      reason: "invalid",
      message: "Choose one of the options for Tier",
    });
    expect(
      await setCustomValue(ownerId, "organization", organization.id, "score", "lots"),
    ).toEqual({ ok: false, reason: "invalid", message: "Score takes a number" });
    expect(
      await setCustomValue(ownerId, "organization", organization.id, "missing", "x"),
    ).toEqual({ ok: false, reason: "not_found" });
    // A company's field is not a person's, and a person's id is not a company's.
    expect(
      await setCustomValue(ownerId, "contact", contact.id, "tier", "Gold"),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await setCustomValue(ownerId, "organization", contact.id, "tier", "Gold"),
    ).toEqual({ ok: false, reason: "not_found" });
    expect((await getOrganization(ownerId, organization.id))!.custom).toEqual({});
  });
});
