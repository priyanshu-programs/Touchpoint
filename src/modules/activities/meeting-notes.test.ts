import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  activityFiles,
  auditLog,
  calendarEventContacts,
  calendarEvents,
  files,
  integrationConnections,
} from "@/db/schema";
import { countRecordEvents, getActivity, listTimeline } from "@/modules/activities/queries";
import { deleteActivity } from "@/modules/activities/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { getMeeting, recordMeetings } from "@/modules/integrations/meetings";
import { disconnectGoogle } from "@/modules/integrations/service";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { pdf } from "@/test/files";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  addMeetingFile,
  getActivityFile,
  removeMeetingFile,
  saveMeetingNotes,
} from "./meeting-notes";
import { MAX_MEETING_FILES, MAX_MEETING_NOTE, meetingNotesInput } from "./meeting-notes-schema";

const HOUR = 60 * 60_000;

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

async function meeting(ownerId: string, connectionId: string, hoursFromNow = -2) {
  const [row] = await db
    .insert(calendarEvents)
    .values({
      ownerId,
      connectionId,
      externalId: crypto.randomUUID(),
      title: "Kickoff with Maple",
      allDay: false,
      startsAt: new Date(Date.now() + hoursFromNow * HOUR),
      endsAt: new Date(Date.now() + (hoursFromNow + 1) * HOUR),
      attendees: [],
    })
    .returning({ id: calendarEvents.id });
  return row.id;
}

async function person(ownerId: string) {
  const result = await createContact(
    ownerId,
    newContactInput.parse({
      firstName: "Ava",
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
      email: "ava@maple.test",
      organizationId: "",
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

const notes = (eventId: string, body: string, marks: unknown[] = []) =>
  meetingNotesInput.parse({ eventId, body, marks });

describe("meeting notes", () => {
  let ownerId: string;
  let connectionId: string;
  let eventId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    connectionId = await connect(ownerId);
    eventId = await meeting(ownerId, connectionId);
  });

  it("keeps formatted notes on one activity made from the meeting, with its people", async () => {
    const ava = await person(ownerId);
    await db.insert(calendarEventContacts).values({ eventId, contactId: ava, ownerId });

    expect(
      await saveMeetingNotes(ownerId, notes(eventId, "  Agreed on scope  ", [
        { from: 2, to: 8, style: "bold" },
      ])),
    ).toBe(true);
    expect(await saveMeetingNotes(ownerId, notes(eventId, "Agreed on scope and price"))).toBe(true);

    const rows = await db.select().from(activities).where(eq(activities.ownerId, ownerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "meeting",
      source: "calendar",
      title: "Kickoff with Maple",
      calendarEventId: eventId,
      body: "Agreed on scope and price",
      marks: [],
    });
    const linked = await db.select().from(activityContacts);
    expect(linked.map((row) => row.contactId)).toEqual([ava]);
    expect((await getMeeting(ownerId, eventId))?.notes).toMatchObject({
      body: "Agreed on scope and price",
      files: [],
    });

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "meeting.notes_save"));
    expect(audits).toHaveLength(2);
    expect(audits[0].after).toMatchObject({
      body: "Agreed on scope",
      marks: [{ from: 0, to: 6, style: "bold" }],
    });
  });

  it("refuses notes that are too long, and any meeting that isn't the owner's", async () => {
    expect(
      meetingNotesInput.safeParse({ eventId, body: "x".repeat(MAX_MEETING_NOTE + 1), marks: [] })
        .success,
    ).toBe(false);
    const other = await createTestOwner("other@example.com");
    expect(await saveMeetingNotes(other, notes(eventId, "Not mine"))).toBe(false);
    expect(await db.$count(activities)).toBe(0);
  });

  it("works on a meeting still to come", async () => {
    const later = await meeting(ownerId, connectionId, 24);
    expect(await saveMeetingNotes(ownerId, notes(later, "Agenda: pricing"))).toBe(true);
  });

  it("keeps the notes out of the Activities section while the meeting is there, and in it after", async () => {
    const ava = await person(ownerId);
    await db.insert(calendarEventContacts).values({ eventId, contactId: ava, ownerId });
    await saveMeetingNotes(ownerId, notes(eventId, "Agreed on scope"));
    await addMeetingFile(ownerId, eventId, { name: "brief.pdf", bytes: pdf("brief") });

    const filter = { contactId: ava };
    expect((await listTimeline(ownerId, { ...filter, eventType: "activity" })).rows).toEqual([]);
    expect(await countRecordEvents(ownerId, filter)).toMatchObject({ meetings: 1, activities: 0 });
    const [card] = (await recordMeetings(ownerId, filter, { when: "past", limit: 5 })).rows;
    expect(card).toMatchObject({ hasNotes: true, fileCount: 1 });

    await disconnectGoogle(ownerId);
    const { rows } = await listTimeline(ownerId, { ...filter, eventType: "activity" });
    expect(rows.map((row) => row.body)).toEqual(["Agreed on scope"]);
    const kept = await getActivity(ownerId, rows[0].eventId);
    expect(kept?.files.map((file) => file.title)).toEqual(["brief.pdf"]);
  });

  describe("files", () => {
    it("keeps a file inside the meeting, served to its owner only", async () => {
      expect(
        await addMeetingFile(ownerId, eventId, { name: "brief.pdf", bytes: pdf("brief") }),
      ).toEqual({ ok: true });
      const kept = (await getMeeting(ownerId, eventId))!.notes!;
      expect(kept.files).toMatchObject([{ title: "brief.pdf", contentType: "application/pdf" }]);
      expect(kept.body).toBeNull();

      const served = await getActivityFile(ownerId, kept.id, kept.files[0].id);
      expect(served?.bytes.toString()).toContain("brief");
      const other = await createTestOwner("other@example.com");
      expect(await getActivityFile(other, kept.id, kept.files[0].id)).toBeNull();
    });

    it("refuses what it can't keep", async () => {
      const big = Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]);
      expect(await addMeetingFile(ownerId, eventId, { name: "big.pdf", bytes: big })).toEqual({
        ok: false,
        reason: "too_large",
      });
      expect(
        await addMeetingFile(ownerId, eventId, { name: "a.svg", bytes: Buffer.from("<svg/>") }),
      ).toEqual({ ok: false, reason: "kind" });
      expect(
        await addMeetingFile(ownerId, crypto.randomUUID(), { name: "a.pdf", bytes: pdf() }),
      ).toEqual({ ok: false, reason: "not_found" });
    });

    it("holds at most twenty files a meeting", async () => {
      await addMeetingFile(ownerId, eventId, { name: "0.pdf", bytes: pdf("0") });
      const [first] = await db.select().from(activityFiles);
      await db.insert(activityFiles).values(
        Array.from({ length: MAX_MEETING_FILES - 1 }, (_, n) => ({
          ...first,
          id: undefined,
          title: `${n + 1}.pdf`,
        })),
      );
      expect(await addMeetingFile(ownerId, eventId, { name: "more.pdf", bytes: pdf("more") }))
        .toEqual({ ok: false, reason: "limit" });
    });

    it("frees a removed file's bytes, and only by the meeting it is in", async () => {
      await addMeetingFile(ownerId, eventId, { name: "brief.pdf", bytes: pdf("brief") });
      const [file] = (await getMeeting(ownerId, eventId))!.notes!.files;
      const elsewhere = await meeting(ownerId, connectionId);
      expect(await removeMeetingFile(ownerId, elsewhere, file.id)).toBe(false);
      expect(await removeMeetingFile(ownerId, eventId, file.id)).toBe(true);
      expect(await db.$count(files, eq(files.ownerId, ownerId))).toBe(0);
    });

    it("goes with its activity when that is deleted", async () => {
      await addMeetingFile(ownerId, eventId, { name: "brief.pdf", bytes: pdf("brief") });
      const { id } = (await getMeeting(ownerId, eventId))!.notes!;
      await deleteActivity(ownerId, id);
      expect(await db.$count(files, and(eq(files.ownerId, ownerId)))).toBe(0);
    });
  });
});
