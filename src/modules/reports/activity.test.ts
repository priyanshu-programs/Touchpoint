import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  contacts,
  materials,
  materialSendRecipients,
  materialSends,
  materialVersions,
  organizations,
  tasks,
} from "@/db/schema";
import type { SendStatus } from "@/db/schema/materials";
import { periodRange } from "@/modules/revenue/period";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  followUpCompliance,
  followUpRows,
  proposalAcceptance,
  proposalRows,
  replyRate,
  replyRows,
} from "./activity";

const TODAY = "2026-10-27";
const OCTOBER = periodRange("this-month", TODAY);
// Nine hours ahead of UTC all year, so a day's edge falls mid-afternoon UTC.
const ZONE = { today: TODAY, timezone: "Asia/Tokyo" };

describe("activity reports", () => {
  let ownerId: string;
  let otherId: string;

  const person = async (firstName: string, owner = ownerId) => {
    const [row] = await db.insert(contacts).values({ ownerId: owner, firstName }).returning({ id: contacts.id });
    return row.id;
  };

  const followUp = (dueOn: string, change: Partial<typeof tasks.$inferInsert> = {}) =>
    db.insert(tasks).values({ ownerId, title: `Follow up ${dueOn}`, dueOn, origin: "follow_up", ...change });

  const activity = async (
    contactId: string,
    direction: "inbound" | "outbound" | null,
    occurredAt: string,
    owner = ownerId,
  ) => {
    const [row] = await db
      .insert(activities)
      .values({ ownerId: owner, kind: "email", direction, occurredAt: new Date(occurredAt), title: "Email" })
      .returning({ id: activities.id });
    await db.insert(activityContacts).values({ activityId: row.id, contactId, ownerId: owner });
  };

  const material = async (type: "proposal" | "deck", owner = ownerId) => {
    const [made] = await db
      .insert(materials)
      .values({ ownerId: owner, name: `${type} ${crypto.randomUUID().slice(0, 6)}`, type })
      .returning({ id: materials.id });
    const [version] = await db
      .insert(materialVersions)
      .values({ ownerId: owner, materialId: made.id, label: "v1", url: "https://example.com/p" })
      .returning({ id: materialVersions.id });
    return version.id;
  };

  const send = async (versionId: string, status: SendStatus, sentAt: string, people: string[] = [], owner = ownerId) => {
    const [row] = await db
      .insert(materialSends)
      .values({ ownerId: owner, versionId, status, sentAt: new Date(sentAt), channel: "email" })
      .returning({ id: materialSends.id });
    for (const contactId of people) {
      await db.insert(materialSendRecipients).values({ sendId: row.id, contactId, ownerId: owner });
    }
  };

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    otherId = await createTestOwner("other@example.com");
  });

  describe("follow-up compliance", () => {
    it("counts follow-ups done by their due date in the owner's zone", async () => {
      // 01:00 in Tokyo on the 10th, still the 9th in UTC: on time.
      await followUp("2026-10-10", { status: "done", completedAt: new Date("2026-10-09T16:00:00Z") });
      // 01:00 in Tokyo on the 11th, still the 10th in UTC: a day late.
      await followUp("2026-10-10", { status: "done", completedAt: new Date("2026-10-10T16:00:00Z") });
      await followUp("2026-10-12");
      // Left out: cancelled, a task of another kind, due today and still open, outside the
      // period, another owner's.
      await followUp("2026-10-13", { status: "cancelled" });
      await followUp("2026-10-14", { origin: "manual" });
      await followUp(TODAY);
      await followUp("2026-09-30");
      await db.insert(tasks).values({ ownerId: otherId, title: "Theirs", dueOn: "2026-10-10", origin: "follow_up" });

      expect(await followUpCompliance(ownerId, OCTOBER, ZONE)).toEqual({ count: 3, onTime: 1, rate: 1 / 3 });
      const { rows, total } = await followUpRows(ownerId, OCTOBER, ZONE);
      expect(total).toBe(3);
      expect(rows.map((row) => row.outcome)).toEqual(
        expect.arrayContaining([{ done: "on-time" }, { done: "late", days: 1 }, { done: false }]),
      );
      expect(rows[0].dueOn).toBe("2026-10-12");
    });

    it("counts a follow-up due today once it is done", async () => {
      await followUp(TODAY, { status: "done", completedAt: new Date("2026-10-27T01:00:00Z") });
      expect(await followUpCompliance(ownerId, OCTOBER, ZONE)).toEqual({ count: 1, onTime: 1, rate: 1 });
    });

    it("has no rate when nothing was due", async () => {
      await followUp(TODAY);
      expect(await followUpCompliance(ownerId, OCTOBER, ZONE)).toEqual({ count: 0, onTime: 0, rate: null });
      expect((await followUpRows(ownerId, OCTOBER, ZONE)).total).toBe(0);
    });
  });

  describe("reply rate", () => {
    it("counts people who answered after the first outbound of the period", async () => {
      const ava = await person("Ava");
      const ben = await person("Ben");
      const cleo = await person("Cleo");
      const dev = await person("Dev");
      // Ava: reached on 1 October in Tokyo (30 September in UTC), answered in November.
      await activity(ava, "outbound", "2026-09-30T15:30:00Z");
      await activity(ava, "inbound", "2026-11-02T09:00:00Z");
      // Ben wrote first, then was reached and never answered.
      await activity(ben, "inbound", "2026-10-03T09:00:00Z");
      await activity(ben, "outbound", "2026-10-04T09:00:00Z");
      // Cleo was reached on 30 September in Tokyo, before the period.
      await activity(cleo, "outbound", "2026-09-30T14:30:00Z");
      await activity(cleo, "inbound", "2026-10-05T09:00:00Z");
      // A note with no direction reaches nobody.
      await activity(dev, null, "2026-10-06T09:00:00Z");
      const theirs = await person("Eli", otherId);
      await activity(theirs, "outbound", "2026-10-06T09:00:00Z", otherId);
      await activity(theirs, "inbound", "2026-10-07T09:00:00Z", otherId);

      expect(await replyRate(ownerId, OCTOBER, ZONE)).toEqual({ count: 2, replied: 1, rate: 0.5 });
      const { rows, total } = await replyRows(ownerId, OCTOBER, ZONE);
      expect(total).toBe(2);
      expect(rows.map((row) => [row.name, row.replyAt?.toISOString() ?? null])).toEqual([
        ["Ben", null],
        ["Ava", "2026-11-02T09:00:00.000Z"],
      ]);
    });

    it("has no rate when nobody was reached", async () => {
      const ava = await person("Ava");
      await activity(ava, "inbound", "2026-10-03T09:00:00Z");
      expect(await replyRate(ownerId, OCTOBER, ZONE)).toEqual({ count: 0, replied: 0, rate: null });
    });

    it("reads All time without bounds", async () => {
      const ava = await person("Ava");
      await activity(ava, "outbound", "2020-01-01T09:00:00Z");
      expect((await replyRate(ownerId, {}, ZONE)).count).toBe(1);
    });
  });

  describe("proposal acceptance", () => {
    it("counts accepted over answered proposals sent in the period", async () => {
      const ava = await person("Ava");
      const ben = await person("Ben");
      const proposal = await material("proposal");
      await send(proposal, "accepted", "2026-10-02T09:00:00Z", [ava, ben]);
      await send(proposal, "rejected", "2026-10-03T09:00:00Z");
      await send(proposal, "accepted", "2026-10-04T09:00:00Z");
      await send(proposal, "viewed", "2026-10-05T09:00:00Z");
      await send(proposal, "superseded", "2026-10-06T09:00:00Z");
      // Before the period in Tokyo; a deck; another owner's.
      await send(proposal, "accepted", "2026-09-30T14:30:00Z");
      await send(await material("deck"), "rejected", "2026-10-07T09:00:00Z");
      await send(await material("proposal", otherId), "rejected", "2026-10-07T09:00:00Z", [], otherId);

      expect(await proposalAcceptance(ownerId, OCTOBER, ZONE)).toEqual({
        accepted: 2,
        answered: 3,
        waiting: 1,
        superseded: 1,
        rate: 2 / 3,
      });
      const { rows, total } = await proposalRows(ownerId, OCTOBER, ZONE);
      expect(total).toBe(5);
      expect(rows.at(-1)).toMatchObject({ status: "accepted", people: "Ava, Ben", version: "v1" });
    });

    it("has no rate until a proposal is answered", async () => {
      await send(await material("proposal"), "sent", "2026-10-02T09:00:00Z");
      expect(await proposalAcceptance(ownerId, OCTOBER, ZONE)).toMatchObject({ answered: 0, waiting: 1, rate: null });
    });
  });

  it("names a follow-up's person and company", async () => {
    const ava = await person("Ava");
    const [org] = await db.insert(organizations).values({ ownerId, name: "Maple Studio" }).returning({ id: organizations.id });
    await followUp("2026-10-10", { contactId: ava, organizationId: org.id });
    const { rows } = await followUpRows(ownerId, OCTOBER, ZONE);
    expect(rows[0]).toMatchObject({ contactName: "Ava", organizationName: "Maple Studio" });
  });
});
