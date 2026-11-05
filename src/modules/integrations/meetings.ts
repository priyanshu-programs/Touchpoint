import { and, asc, desc, eq, exists, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityFiles,
  calendarEventContacts,
  calendarEvents,
  contacts,
  organizations,
} from "@/db/schema";
import { addDays, fromLocalInput } from "@/lib/time";
import { photoVersion } from "@/modules/contacts/queries";

const MAX_LISTED = 20;

export async function getMeeting(ownerId: string, id: string) {
  const [meeting] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.ownerId, ownerId), eq(calendarEvents.id, id)));
  if (!meeting) return null;

  const [people, company, notes] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.fullName })
      .from(calendarEventContacts)
      .innerJoin(contacts, eq(contacts.id, calendarEventContacts.contactId))
      .where(
        and(
          eq(calendarEventContacts.ownerId, ownerId),
          eq(calendarEventContacts.eventId, id),
        ),
      )
      .orderBy(asc(contacts.fullName)),
    meeting.organizationId
      ? db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(
            and(
              eq(organizations.ownerId, ownerId),
              eq(organizations.id, meeting.organizationId),
            ),
          )
      : [],
    meetingNotes(ownerId, id),
  ]);
  return { ...meeting, people, organization: company[0] ?? null, notes };
}

// What the owner wrote and uploaded inside a meeting, kept on its activity. Null until
// something is.
export async function meetingNotes(ownerId: string, eventId: string) {
  const [activity] = await db
    .select({ id: activities.id, body: activities.body, marks: activities.marks })
    .from(activities)
    .where(and(eq(activities.ownerId, ownerId), eq(activities.calendarEventId, eventId)));
  if (!activity) return null;
  return { ...activity, files: await activityFileList(ownerId, activity.id) };
}

export const activityFileList = (ownerId: string, activityId: string) =>
  db
    .select({
      id: activityFiles.id,
      title: activityFiles.title,
      contentType: activityFiles.contentType,
      size: activityFiles.size,
    })
    .from(activityFiles)
    .where(and(eq(activityFiles.ownerId, ownerId), eq(activityFiles.activityId, activityId)))
    .orderBy(asc(activityFiles.createdAt), asc(activityFiles.id));
export type ActivityFile = Awaited<ReturnType<typeof activityFileList>>[number];
export type Meeting = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

// Meetings touching these days of the owner's. Days are worked out here, so no zone name
// reaches the database. An all-day meeting's end date is the day after its last.
export async function meetingsBetween(
  ownerId: string,
  from: string,
  through: string,
  timezone: string,
  limit = MAX_LISTED,
) {
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      allDay: calendarEvents.allDay,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      startsOn: calendarEvents.startsOn,
      endsOn: calendarEvents.endsOn,
      meetingUrl: calendarEvents.meetingUrl,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        or(
          and(
            gte(calendarEvents.startsAt, fromLocalInput(`${from}T00:00`, timezone)),
            lt(
              calendarEvents.startsAt,
              fromLocalInput(`${addDays(through, 1)}T00:00`, timezone),
            ),
          ),
          and(lte(calendarEvents.startsOn, through), gt(calendarEvents.endsOn, from)),
        ),
      ),
    )
    .orderBy(
      sql`coalesce(${calendarEvents.startsOn}::timestamptz, ${calendarEvents.startsAt})`,
      asc(calendarEvents.id),
    )
    .limit(limit);
}
export type ListedMeeting = Awaited<ReturnType<typeof meetingsBetween>>[number];

// Meetings on one record: a person's through the people matched to it, a company's by its own.
const onRecord = (ownerId: string, filter: { contactId: string } | { organizationId: string }) =>
  "contactId" in filter
    ? exists(
        db
          .select({ one: sql`1` })
          .from(calendarEventContacts)
          .where(
            and(
              eq(calendarEventContacts.eventId, calendarEvents.id),
              eq(calendarEventContacts.ownerId, ownerId),
              eq(calendarEventContacts.contactId, filter.contactId),
            ),
          ),
      )
    : eq(calendarEvents.organizationId, filter.organizationId);

// Each test is written out in full: `not` over another is null for every timed meeting,
// since its day columns are null. An all-day meeting's end is the day after its last.
const WHEN = {
  upcoming: sql`(${calendarEvents.startsAt} > now() or ${calendarEvents.startsOn} > current_date)`,
  live: sql`((${calendarEvents.startsAt} <= now() and ${calendarEvents.endsAt} > now()) or (${calendarEvents.startsOn} <= current_date and ${calendarEvents.endsOn} > current_date))`,
  past: sql`(${calendarEvents.endsAt} <= now() or ${calendarEvents.endsOn} <= current_date)`,
};

export async function countEndedMeetings(
  ownerId: string,
  filter: { contactId: string } | { organizationId: string },
) {
  return db.$count(
    calendarEvents,
    and(eq(calendarEvents.ownerId, ownerId), onRecord(ownerId, filter), WHEN.past),
  );
}

// A record's meetings: those still to start or under way (soonest first), or those that
// have ended (newest first, a page at a time), each with whether it holds notes and files.
export async function recordMeetings(
  ownerId: string,
  filter: { contactId: string } | { organizationId: string },
  options: { when: "upcoming" | "live" | "past"; after?: string; limit: number },
) {
  const start = sql`coalesce(${calendarEvents.startsOn}::timestamptz, ${calendarEvents.startsAt})`;
  const past = options.when === "past";
  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      allDay: calendarEvents.allDay,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      startsOn: calendarEvents.startsOn,
      endsOn: calendarEvents.endsOn,
      location: calendarEvents.location,
      meetingUrl: calendarEvents.meetingUrl,
      hasNotes: sql<boolean>`coalesce(${activities.body} <> '', false)`,
      fileCount: sql<number>`(
        select count(*)::int from ${activityFiles}
        where ${activityFiles.activityId} = ${activities.id}
      )`,
    })
    .from(calendarEvents)
    .leftJoin(
      activities,
      and(
        eq(activities.calendarEventId, calendarEvents.id),
        eq(activities.ownerId, ownerId),
      ),
    )
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        onRecord(ownerId, filter),
        WHEN[options.when],
        past && options.after
          ? sql`(${start}, ${calendarEvents.id}) < (
              select coalesce(starts_on::timestamptz, starts_at), id from calendar_events
              where id = ${options.after} and owner_id = ${ownerId}
            )`
          : undefined,
      ),
    )
    .orderBy(
      past ? desc(start) : asc(start),
      past ? desc(calendarEvents.id) : asc(calendarEvents.id),
    )
    .limit(options.limit + 1);

  const page = rows.slice(0, options.limit);
  const people =
    page.length === 0
      ? []
      : await db
          .select({
            eventId: calendarEventContacts.eventId,
            id: contacts.id,
            name: contacts.fullName,
            photoVersion,
          })
          .from(calendarEventContacts)
          .innerJoin(contacts, eq(contacts.id, calendarEventContacts.contactId))
          .where(
            and(
              eq(calendarEventContacts.ownerId, ownerId),
              inArray(
                calendarEventContacts.eventId,
                page.map((row) => row.id),
              ),
            ),
          )
          .orderBy(asc(contacts.fullName));
  return {
    rows: page.map((row) => ({
      ...row,
      people: people
        .filter((person) => person.eventId === row.id)
        .map(({ id, name, photoVersion }) => ({ id, name, photoVersion })),
    })),
    nextAfter: past && rows.length > options.limit ? page.at(-1)!.id : null,
  };
}
export type RecordMeeting = Awaited<ReturnType<typeof recordMeetings>>["rows"][number];
