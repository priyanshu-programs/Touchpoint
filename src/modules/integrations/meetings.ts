import { and, asc, desc, eq, exists, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
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

  const [people, company] = await Promise.all([
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
  ]);
  return { ...meeting, people, organization: company[0] ?? null };
}
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

// A record's meetings, either those still to start (soonest first) or those that have
// started (newest first, a page at a time). "Started" is the `timeline` view's own test.
export async function recordMeetings(
  ownerId: string,
  filter: { contactId: string } | { organizationId: string },
  options: { when: "upcoming" | "past"; after?: string; limit: number },
) {
  const start = sql`coalesce(${calendarEvents.startsOn}::timestamptz, ${calendarEvents.startsAt})`;
  const started = sql`(${calendarEvents.startsAt} <= now() or ${calendarEvents.startsOn} <= current_date)`;
  // Written out, since `not` over the test above is null for every timed meeting.
  const upcoming = sql`(${calendarEvents.startsAt} > now() or ${calendarEvents.startsOn} > current_date)`;
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
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
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
          : eq(calendarEvents.organizationId, filter.organizationId),
        past ? started : upcoming,
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
