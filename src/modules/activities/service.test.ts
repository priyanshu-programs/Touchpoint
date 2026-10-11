import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { activities, tasks } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { saveSettings } from "@/modules/settings/service";
import { getTask, listTasks } from "@/modules/tasks/queries";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getActivity, listTimeline } from "./queries";
import { activityInput, logActivityInput } from "./schema";
import { deleteActivity, logActivity, updateActivity } from "./service";

const ZONE = "Asia/Kolkata";
const editForm = {
  kind: "call",
  direction: "outbound",
  occurredAt: "2026-10-10T15:30",
  title: "Intro call",
  body: "",
  outcome: "",
  contactIds: [] as string[],
  organizationId: "",
};
const form = { ...editForm, followUpDate: "", followUpTitle: "" };
type Form = typeof form;
const input = (override: Partial<Form>) =>
  logActivityInput.parse({ ...form, ...override });

describe("logActivityInput", () => {
  const contactIds = ["7f1c2f0e-4b7a-4a0e-9d55-0d6f2f6a3c11"];

  it("stores blank fields as null and drops repeated contacts", () => {
    expect(
      input({ contactIds: [...contactIds, ...contactIds], direction: "" }),
    ).toMatchObject({
      contactIds,
      direction: null,
      body: null,
      outcome: null,
      organizationId: null,
      followUpDate: null,
      followUpTitle: null,
    });
  });

  it.each([
    ["no contact and no organization", {}],
    ["a missing summary", { contactIds, title: " " }],
    ["an unknown type", { contactIds, kind: "fax" }],
    ["a time with an offset", { contactIds, occurredAt: "2026-10-10T15:30+05:30" }],
    ["a follow-up date that does not exist", { contactIds, followUpDate: "2026-02-30" }],
    ["a follow-up task without a date", { contactIds, followUpTitle: "Send deck" }],
    ["a contact id that is not an id", { contactIds: ["priya"] }],
    ["an unexpected field", { contactIds, source: "ai" }],
  ])("rejects %s", (_label, override) => {
    expect(logActivityInput.safeParse({ ...form, ...override }).success).toBe(
      false,
    );
  });
});

describe("activities", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await saveSettings(ownerId, {
      baseCurrency: "INR",
      timezone: ZONE,
      weekStart: 1,
      fiscalYearStartMonth: 4,
    });
  });

  async function createOrg(owner = ownerId) {
    const result = await createOrganization(
      owner,
      organizationInput.parse({
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
      }),
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  async function createPerson(firstName: string, owner = ownerId) {
    const result = await createContact(
      owner,
      newContactInput.parse({
        firstName,
        lastName: "",
        email: "",
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
      }),
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  async function log(override: Partial<Form>, owner = ownerId) {
    const result = await logActivity(owner, input(override));
    if (!result.ok) throw new Error(`log failed: ${result.reason}`);
    return result;
  }

  it("stores when it happened as an instant in the owner's time zone", async () => {
    const contactId = await createPerson("Priya");
    const { id } = await log({ contactIds: [contactId] });

    const activity = await getActivity(ownerId, id);
    expect(activity).toMatchObject({
      kind: "call",
      direction: "outbound",
      source: "manual",
      contacts: [{ id: contactId, name: "Priya" }],
    });
    expect(activity!.occurredAt.toISOString()).toBe("2026-10-10T10:00:00.000Z");
  });

  it("creates the follow-up task with the activity", async () => {
    const contactId = await createPerson("Priya");
    const organizationId = await createOrg();
    const { followUpTaskId } = await log({
      contactIds: [contactId],
      organizationId,
      followUpDate: "2026-10-17",
    });

    expect(await getTask(ownerId, followUpTaskId!)).toMatchObject({
      title: "Follow up: Intro call",
      origin: "follow_up",
      dueOn: "2026-10-17",
      dueAt: null,
      contactId,
      organizationId,
    });

    const named = await log({
      contactIds: [contactId],
      followUpDate: "2026-10-18",
      followUpTitle: "Send the deck",
    });
    expect((await getTask(ownerId, named.followUpTaskId!))!.title).toBe(
      "Send the deck",
    );

    const none = await log({ contactIds: [contactId] });
    expect(none.followUpTaskId).toBeNull();
    expect((await listTasks(ownerId, { contactId })).rows).toHaveLength(2);
  });

  it("refuses a link to a record of another owner and writes nothing", async () => {
    const other = await createTestOwner("other@example.com");
    const theirContact = await createPerson("Theirs", other);
    const theirOrg = await createOrg(other);
    const mine = await createPerson("Mine");

    expect(
      await logActivity(
        ownerId,
        input({ contactIds: [mine, theirContact], followUpDate: "2026-10-17" }),
      ),
    ).toEqual({ ok: false, reason: "unknown_contact" });
    expect(
      await logActivity(
        ownerId,
        input({ contactIds: [mine], organizationId: theirOrg }),
      ),
    ).toEqual({ ok: false, reason: "unknown_organization" });

    expect(await db.select().from(activities)).toHaveLength(0);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("shows an activity once on each linked record's timeline", async () => {
    const priya = await createPerson("Priya");
    const arjun = await createPerson("Arjun");
    const bystander = await createPerson("Meera");
    const organizationId = await createOrg();
    const { id } = await log({
      kind: "meeting",
      direction: "",
      contactIds: [priya, arjun],
      organizationId,
      outcome: "Wants a proposal",
    });

    for (const filter of [
      { contactId: priya },
      { contactId: arjun },
      { organizationId },
    ]) {
      const { rows } = await listTimeline(ownerId, filter);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventType: "activity",
        eventId: id,
        kind: "meeting",
        outcome: "Wants a proposal",
        contacts: [
          { id: arjun, name: "Arjun" },
          { id: priya, name: "Priya" },
        ],
      });
    }
    expect((await listTimeline(ownerId, { contactId: bystander })).rows).toEqual(
      [],
    );
  });

  it("keeps one owner's timeline from another", async () => {
    const other = await createTestOwner("other@example.com");
    const theirContact = await createPerson("Theirs", other);
    const { id } = await log({ contactIds: [theirContact] }, other);

    expect(
      (await listTimeline(ownerId, { contactId: theirContact })).rows,
    ).toEqual([]);
    expect(await getActivity(ownerId, id)).toBeNull();
    expect(
      await updateActivity(
        ownerId,
        id,
        activityInput.parse({ ...editForm, contactIds: [theirContact] }),
      ),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteActivity(ownerId, id)).toBeNull();
    expect(await getActivity(other, id)).not.toBeNull();
  });

  it("pages through a timeline newest first", async () => {
    const contactId = await createPerson("Priya");
    for (const day of ["06", "07", "08", "09", "10"]) {
      await log({
        contactIds: [contactId],
        title: `Call on the ${day}th`,
        occurredAt: `2026-10-${day}T09:00`,
      });
    }

    const first = await listTimeline(ownerId, { contactId, limit: 2 });
    expect(first.rows.map((row) => row.title)).toEqual([
      "Call on the 10th",
      "Call on the 09th",
    ]);
    const second = await listTimeline(ownerId, {
      contactId,
      limit: 2,
      after: first.nextAfter!,
    });
    expect(second.rows.map((row) => row.title)).toEqual([
      "Call on the 08th",
      "Call on the 07th",
    ]);
    const last = await listTimeline(ownerId, {
      contactId,
      limit: 2,
      after: second.nextAfter!,
    });
    expect(last.rows.map((row) => row.title)).toEqual(["Call on the 06th"]);
    expect(last.nextAfter).toBeNull();
  });

  it("updates an activity and the contacts it involves", async () => {
    const priya = await createPerson("Priya");
    const arjun = await createPerson("Arjun");
    const { id } = await log({ contactIds: [priya] });

    expect(
      await updateActivity(
        ownerId,
        id,
        activityInput.parse({
          ...editForm,
          title: "Discovery call",
          outcome: "Budget confirmed",
          contactIds: [arjun],
        }),
      ),
    ).toMatchObject({ ok: true });

    expect(await getActivity(ownerId, id)).toMatchObject({
      title: "Discovery call",
      outcome: "Budget confirmed",
      contacts: [{ id: arjun }],
    });
    expect((await listTimeline(ownerId, { contactId: priya })).rows).toEqual([]);

    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "activity.update",
      entityId: id,
      before: { title: "Intro call", contactIds: [priya] },
      after: { title: "Discovery call", contactIds: [arjun] },
    });
  });

  it("deletes an activity and keeps what it said in the audit log", async () => {
    const contactId = await createPerson("Priya");
    const { id } = await log({ contactIds: [contactId], body: "Logged twice" });

    expect(await deleteActivity(ownerId, id)).toEqual({
      organizationId: null,
      contactIds: [contactId],
    });
    expect(await getActivity(ownerId, id)).toBeNull();
    expect((await listTimeline(ownerId, { contactId })).rows).toEqual([]);

    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "activity.delete",
      entityId: id,
      before: { title: "Intro call", body: "Logged twice" },
    });
  });
});
