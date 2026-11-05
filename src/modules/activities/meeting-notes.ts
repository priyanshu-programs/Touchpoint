import { and, eq, gt, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  activities,
  activityContacts,
  activityFiles,
  auditLog,
  calendarEventContacts,
  calendarEvents,
  files,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { fileType } from "@/modules/files/sniff";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import {
  MAX_MEETING_FILE_TITLE,
  MAX_MEETING_FILES,
  MEETING_UPLOADS_PER_MINUTE,
  type MeetingNotesInput,
} from "./meeting-notes-schema";

// The activity that holds a meeting's notes and files, made the first time something is
// written inside the meeting: the meeting's title, start, company and people, so that it
// stands as an ordinary meeting activity once the meeting's copy is gone. Null when the
// meeting isn't the owner's. The meeting is locked, so two first writes make one.
async function meetingActivity(tx: Tx, ownerId: string, eventId: string) {
  const [meeting] = await tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.ownerId, ownerId), eq(calendarEvents.id, eventId)))
    .for("update");
  if (!meeting) return null;

  const [existing] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.ownerId, ownerId), eq(activities.calendarEventId, eventId)))
    .for("update");
  if (existing) return existing;

  const [made] = await tx
    .insert(activities)
    .values({
      ownerId,
      kind: "meeting",
      source: "calendar",
      title: meeting.title,
      // As the `timeline` view places an all-day meeting.
      occurredAt: meeting.allDay
        ? new Date(`${meeting.startsOn}T12:00:00Z`)
        : meeting.startsAt!,
      organizationId: meeting.organizationId,
      calendarEventId: eventId,
    })
    .returning();
  const people = await tx
    .select({ contactId: calendarEventContacts.contactId })
    .from(calendarEventContacts)
    .where(
      and(
        eq(calendarEventContacts.ownerId, ownerId),
        eq(calendarEventContacts.eventId, eventId),
      ),
    );
  if (people.length > 0) {
    await tx
      .insert(activityContacts)
      .values(people.map(({ contactId }) => ({ activityId: made.id, contactId, ownerId })));
  }
  return made;
}

export async function saveMeetingNotes(ownerId: string, input: MeetingNotesInput) {
  return db.transaction(async (tx) => {
    const before = await meetingActivity(tx, ownerId, input.eventId);
    if (!before) return false;
    const body = input.body || null;
    if (body === before.body && JSON.stringify(input.marks) === JSON.stringify(before.marks)) {
      return true;
    }
    await tx
      .update(activities)
      .set({ body, marks: input.marks })
      .where(and(eq(activities.ownerId, ownerId), eq(activities.id, before.id)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "meeting.notes_save",
      entityType: "activity",
      entityId: before.id,
      before: { calendarEventId: input.eventId, body: before.body, marks: before.marks },
      after: { calendarEventId: input.eventId, body, marks: input.marks },
    });
    return true;
  });
}

export type MeetingFileResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "too_large" | "kind" | "full" | "rate" | "limit" };

// A file goes by the name it was uploaded under, without what a name cannot hold.
const fileTitle = (name: string) =>
  name
    .replace(/[\p{Cc}\\/]+/gu, " ")
    .trim()
    .slice(0, MAX_MEETING_FILE_TITLE) || "Untitled file";

// Uploads are counted from the audit log, where each stored file is recorded.
const uploadsInLastMinute = (tx: Tx, ownerId: string) =>
  tx.$count(
    auditLog,
    and(
      eq(auditLog.ownerId, ownerId),
      eq(auditLog.action, "meeting.file_add"),
      gt(auditLog.createdAt, sql`now() - interval '1 minute'`),
    ),
  );

// A file kept inside a meeting's notes, of the kinds a box on a workflow takes, told by
// its bytes alone.
export async function addMeetingFile(
  ownerId: string,
  eventId: string,
  { name, bytes }: { name: string; bytes: Buffer },
): Promise<MeetingFileResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = fileType(bytes);
  if (!contentType) return { ok: false, reason: "kind" };

  return db.transaction(async (tx) => {
    const activity = await meetingActivity(tx, ownerId, eventId);
    if (!activity) return { ok: false, reason: "not_found" };
    const held = await tx.$count(
      activityFiles,
      and(eq(activityFiles.ownerId, ownerId), eq(activityFiles.activityId, activity.id)),
    );
    if (held >= MAX_MEETING_FILES) return { ok: false, reason: "limit" };
    if ((await uploadsInLastMinute(tx, ownerId)) >= MEETING_UPLOADS_PER_MINUTE) {
      return { ok: false, reason: "rate" };
    }
    const fileId = await storeFile(tx, ownerId, bytes, contentType);
    if (!fileId) return { ok: false, reason: "full" };

    const title = fileTitle(name);
    await tx.insert(activityFiles).values({
      ownerId,
      activityId: activity.id,
      fileId,
      title,
      contentType,
      size: bytes.length,
    });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "meeting.file_add",
      entityType: "activity",
      entityId: activity.id,
      after: { calendarEventId: eventId, title, contentType, size: bytes.length },
    });
    return { ok: true };
  });
}

// Taken off by the meeting and the file together, so an id from another meeting does nothing.
export async function removeMeetingFile(ownerId: string, eventId: string, fileId: string) {
  return db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(activityFiles)
      .where(
        and(
          eq(activityFiles.ownerId, ownerId),
          eq(activityFiles.id, fileId),
          sql`${activityFiles.activityId} = (
            select ${activities.id} from ${activities}
            where ${activities.ownerId} = ${ownerId} and ${activities.calendarEventId} = ${eventId}
          )`,
        ),
      )
      .returning();
    if (!gone) return false;
    await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "meeting.file_remove",
      entityType: "activity",
      entityId: gone.activityId,
      before: {
        calendarEventId: eventId,
        title: gone.title,
        contentType: gone.contentType,
        size: gone.size,
      },
    });
    return true;
  });
}

// A stored file kept with an activity, to its owner only, found by activity and file together.
export async function getActivityFile(ownerId: string, activityId: string, id: string) {
  const [row] = await db
    .select({ title: activityFiles.title, contentType: files.contentType, bytes: files.bytes })
    .from(activityFiles)
    .innerJoin(files, eq(files.id, activityFiles.fileId))
    .where(
      and(
        eq(activityFiles.ownerId, ownerId),
        eq(activityFiles.activityId, activityId),
        eq(activityFiles.id, id),
      ),
    );
  return row ?? null;
}
