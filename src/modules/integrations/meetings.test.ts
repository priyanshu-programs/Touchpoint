import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  calendarEventContacts,
  calendarEvents,
  integrationConnections,
} from "@/db/schema";
import { countRecordEvents, listTimeline } from "@/modules/activities/queries";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getMeeting, meetingsBetween, recordMeetings } from "./meetings";
import { disconnectGoogle } from "./service";

const HOUR = 60 * 60_000;
const fromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

async function connect(ownerId: string) {
  const [row] = await db
    .insert(integrationConnections)
    .values({
      ownerId,
      provider: "google",
      accountEmail: "owner@gmail.test",
      scopes: [],
      status: "connected",
      keyVersion: 1,
      connectedAt: new Date(),
    })
    .returning({ id: integrationConnections.id });
  return row.id;
}

type Seed = Partial<typeof calendarEvents.$inferInsert> & { title: string };

async function seed(ownerId: string, connectionId: string, values: Seed) {
  const [row] = await db
    .insert(calendarEvents)
    .values({
      ownerId,
      connectionId,
      externalId: crypto.randomUUID(),
      allDay: false,
      startsAt: fromNow(-1),
      endsAt: fromNow(0),
      attendees: [],
      ...values,
    })
    .returning({ id: calendarEvents.id });
  return row.id;
}

const allDay = (startsOn: string, endsOn: string) => ({
  allDay: true,
  startsAt: null,
  endsAt: null,
  startsOn,
  endsOn,
});

async function person(ownerId: string, firstName: string) {
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
      email: `${firstName.toLowerCase()}@maple.test`,
      organizationId: "",
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function company(ownerId: string, name: string) {
  const result = await createOrganization(
    ownerId,
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
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

describe("meetings", () => {
  let ownerId: string;
  let connectionId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    connectionId = await connect(ownerId);
  });

  describe("on a record's timeline", () => {
    it("shows a meeting that has started on its person and company, and not one to come", async () => {
      const ava = await person(ownerId, "Ava");
      const maple = await company(ownerId, "Maple");
      const started = await seed(ownerId, connectionId, {
        title: "Kickoff",
        location: "Room 4",
        organizationId: maple,
      });
      const later = await seed(ownerId, connectionId, {
        title: "Review",
        startsAt: fromNow(2),
        endsAt: fromNow(3),
        organizationId: maple,
      });
      await db.insert(calendarEventContacts).values([
        { eventId: started, contactId: ava, ownerId },
        { eventId: later, contactId: ava, ownerId },
      ]);

      for (const filter of [{ contactId: ava }, { organizationId: maple }]) {
        const { rows } = await listTimeline(ownerId, filter);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          eventType: "calendar_event",
          eventId: started,
          kind: "meeting",
          title: "Kickoff",
          body: "Room 4",
        });
      }
      const { rows } = await listTimeline(ownerId, { contactId: ava });
      expect(rows[0].contacts.map((contact) => contact.name)).toEqual(["Ava"]);
    });

    it("puts an all-day meeting at noon UTC on its date, once that date has come", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, {
        title: "Offsite",
        organizationId: maple,
        ...allDay("2026-01-05", "2026-01-06"),
      });
      await seed(ownerId, connectionId, {
        title: "Far off",
        organizationId: maple,
        ...allDay("2099-01-05", "2099-01-06"),
      });
      const { rows } = await listTimeline(ownerId, { organizationId: maple });
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe("all_day");
      expect(rows[0].occurredAt).toEqual(new Date("2026-01-05T12:00:00Z"));
    });

    it("pages through meetings and activities together", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, {
        title: "Meeting 3h ago",
        organizationId: maple,
        startsAt: fromNow(-3),
        endsAt: fromNow(-2),
      });
      await db.insert(activities).values({
        ownerId,
        kind: "note",
        occurredAt: fromNow(-2),
        title: "Note 2h ago",
        organizationId: maple,
      });
      await seed(ownerId, connectionId, {
        title: "Meeting 1h ago",
        organizationId: maple,
      });

      const first = await listTimeline(ownerId, { organizationId: maple, limit: 2 });
      expect(first.rows.map((row) => row.title)).toEqual(["Meeting 1h ago", "Note 2h ago"]);
      const second = await listTimeline(ownerId, {
        organizationId: maple,
        limit: 2,
        after: first.nextAfter!,
      });
      expect(second.rows.map((row) => row.title)).toEqual(["Meeting 3h ago"]);
      expect(second.nextAfter).toBeNull();
    });

    it("can leave meetings out", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, { title: "Kickoff", organizationId: maple });
      await db.insert(activities).values({
        ownerId,
        kind: "note",
        occurredAt: fromNow(-2),
        title: "A note",
        organizationId: maple,
      });
      const { rows } = await listTimeline(ownerId, { limit: 5, withoutMeetings: true });
      expect(rows.map((row) => row.title)).toEqual(["A note"]);
    });

    it("loses its meetings when Google is disconnected", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, { title: "Kickoff", organizationId: maple });
      await disconnectGoogle(ownerId);
      expect((await listTimeline(ownerId, { organizationId: maple })).rows).toEqual([]);
    });
  });

  describe("on a record's Activity tab", () => {
    it("splits a record's meetings into those to come, soonest first, and those started, newest first", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, { title: "Started", organizationId: maple });
      await seed(ownerId, connectionId, {
        title: "In 5h",
        startsAt: fromNow(5),
        endsAt: fromNow(6),
        organizationId: maple,
      });
      await seed(ownerId, connectionId, {
        title: "In 2h",
        startsAt: fromNow(2),
        endsAt: fromNow(3),
        organizationId: maple,
      });
      await seed(ownerId, connectionId, {
        title: "Long ago",
        organizationId: maple,
        ...allDay("2026-01-05", "2026-01-06"),
      });
      await seed(ownerId, connectionId, {
        title: "Far off",
        organizationId: maple,
        ...allDay("2099-01-05", "2099-01-06"),
      });
      await seed(ownerId, connectionId, { title: "Elsewhere" });

      const filter = { organizationId: maple };
      const upcoming = await recordMeetings(ownerId, filter, { when: "upcoming", limit: 10 });
      expect(upcoming.rows.map((row) => row.title)).toEqual(["In 2h", "In 5h", "Far off"]);
      expect(upcoming.nextAfter).toBeNull();
      const past = await recordMeetings(ownerId, filter, { when: "past", limit: 10 });
      expect(past.rows.map((row) => row.title)).toEqual(["Started", "Long ago"]);
      expect(past.rows[0].endsAt).toBeInstanceOf(Date);
    });

    it("finds a person's meetings through their attendance, with everyone who came", async () => {
      const ava = await person(ownerId, "Ava");
      const ben = await person(ownerId, "Ben");
      const met = await seed(ownerId, connectionId, { title: "Both" });
      const without = await seed(ownerId, connectionId, { title: "Ben alone" });
      await db.insert(calendarEventContacts).values([
        { eventId: met, contactId: ben, ownerId },
        { eventId: met, contactId: ava, ownerId },
        { eventId: without, contactId: ben, ownerId },
      ]);

      const { rows } = await recordMeetings(ownerId, { contactId: ava }, { when: "past", limit: 10 });
      expect(rows.map((row) => row.title)).toEqual(["Both"]);
      expect(rows[0].people.map((who) => who.name)).toEqual(["Ava", "Ben"]);
      expect(rows[0].people[0]).toHaveProperty("photoVersion", null);
    });

    it("pages through past meetings", async () => {
      const maple = await company(ownerId, "Maple");
      for (const hours of [1, 2, 3]) {
        await seed(ownerId, connectionId, {
          title: `${hours}h ago`,
          startsAt: fromNow(-hours),
          endsAt: fromNow(-hours + 0.5),
          organizationId: maple,
        });
      }
      const filter = { organizationId: maple };
      const first = await recordMeetings(ownerId, filter, { when: "past", limit: 2 });
      expect(first.rows.map((row) => row.title)).toEqual(["1h ago", "2h ago"]);
      const second = await recordMeetings(ownerId, filter, {
        when: "past",
        limit: 2,
        after: first.nextAfter!,
      });
      expect(second.rows.map((row) => row.title)).toEqual(["3h ago"]);
      expect(second.nextAfter).toBeNull();
    });

    it("never shows another owner's meeting", async () => {
      const maple = await company(ownerId, "Maple");
      const otherOwner = await createTestOwner("other@example.com");
      const otherConnection = await connect(otherOwner);
      await seed(otherOwner, otherConnection, { title: "Theirs", organizationId: maple });

      for (const when of ["upcoming", "past"] as const) {
        const { rows } = await recordMeetings(ownerId, { organizationId: maple }, { when, limit: 10 });
        expect(rows).toEqual([]);
      }
    });

    it("counts a record's started meetings, sends and activities", async () => {
      const maple = await company(ownerId, "Maple");
      await seed(ownerId, connectionId, { title: "Started", organizationId: maple });
      await seed(ownerId, connectionId, {
        title: "To come",
        startsAt: fromNow(2),
        endsAt: fromNow(3),
        organizationId: maple,
      });
      await db.insert(activities).values(
        ["One", "Two"].map((title) => ({
          ownerId,
          kind: "note" as const,
          occurredAt: fromNow(-1),
          title,
          organizationId: maple,
        })),
      );

      expect(await countRecordEvents(ownerId, { organizationId: maple })).toEqual({
        meetings: 1,
        sends: 0,
        activities: 2,
      });
      const { rows } = await listTimeline(ownerId, {
        organizationId: maple,
        eventType: "activity",
      });
      expect(rows.map((row) => row.eventType)).toEqual(["activity", "activity"]);
    });
  });

  describe("one meeting", () => {
    it("comes with its people and company", async () => {
      const ava = await person(ownerId, "Ava");
      const maple = await company(ownerId, "Maple");
      const id = await seed(ownerId, connectionId, {
        title: "Kickoff",
        organizationId: maple,
      });
      await db.insert(calendarEventContacts).values({ eventId: id, contactId: ava, ownerId });

      expect(await getMeeting(ownerId, id)).toMatchObject({
        title: "Kickoff",
        people: [{ id: ava, name: "Ava" }],
        organization: { id: maple, name: "Maple" },
      });
    });

    it("is only ever its owner's", async () => {
      const id = await seed(ownerId, connectionId, { title: "Kickoff" });
      const other = await createTestOwner("other@example.com");
      expect(await getMeeting(other, id)).toBeNull();
      expect(
        await meetingsBetween(other, "2000-01-01", "2099-01-01", "UTC"),
      ).toEqual([]);
      expect((await listTimeline(other)).rows).toEqual([]);
    });
  });

  describe("between two days", () => {
    const titles = async (from: string, through: string, zone: string) =>
      (await meetingsBetween(ownerId, from, through, zone)).map((row) => row.title);

    it("goes by the owner's days, not UTC's", async () => {
      // 20:00 UTC on the 4th is already 01:30 on the 5th in Kolkata.
      await seed(ownerId, connectionId, {
        title: "Late",
        startsAt: new Date("2026-03-04T20:00:00Z"),
        endsAt: new Date("2026-03-04T21:00:00Z"),
      });
      expect(await titles("2026-03-05", "2026-03-05", "Asia/Kolkata")).toEqual(["Late"]);
      expect(await titles("2026-03-04", "2026-03-04", "Asia/Kolkata")).toEqual([]);
      expect(await titles("2026-03-04", "2026-03-04", "UTC")).toEqual(["Late"]);
    });

    it("finds an all-day meeting on each of its days, and not the day it ends", async () => {
      await seed(ownerId, connectionId, {
        title: "Offsite",
        ...allDay("2026-03-04", "2026-03-06"),
      });
      expect(await titles("2026-03-04", "2026-03-04", "UTC")).toEqual(["Offsite"]);
      expect(await titles("2026-03-05", "2026-03-05", "UTC")).toEqual(["Offsite"]);
      expect(await titles("2026-03-06", "2026-03-06", "UTC")).toEqual([]);
    });

    it("lists at most twenty", async () => {
      for (let hour = 0; hour < 21; hour++) {
        await seed(ownerId, connectionId, {
          title: `Meeting ${hour}`,
          startsAt: new Date(`2026-03-04T${String(hour).padStart(2, "0")}:00:00Z`),
          endsAt: new Date(`2026-03-04T${String(hour).padStart(2, "0")}:30:00Z`),
        });
      }
      expect(await meetingsBetween(ownerId, "2026-03-04", "2026-03-04", "UTC")).toHaveLength(20);
      expect(
        await meetingsBetween(ownerId, "2026-03-04", "2026-03-04", "UTC", 21),
      ).toHaveLength(21);
    });

    it("says when an all-day meeting ends, for a meeting begun before the range", async () => {
      await seed(ownerId, connectionId, {
        title: "Offsite",
        ...allDay("2026-03-04", "2026-03-06"),
      });
      const [meeting] = await meetingsBetween(ownerId, "2026-03-05", "2026-03-11", "UTC");
      expect(meeting).toMatchObject({ startsOn: "2026-03-04", endsOn: "2026-03-06" });
    });
  });
});
