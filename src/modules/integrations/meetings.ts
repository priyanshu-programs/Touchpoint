import { and, asc, eq, gt, gte, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEventContacts,
  calendarEvents,
  contacts,
  organizations,
} from "@/db/schema";
import { addDays, fromLocalInput } from "@/lib/time";

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
) {
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      allDay: calendarEvents.allDay,
      startsAt: calendarEvents.startsAt,
      startsOn: calendarEvents.startsOn,
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
    .limit(MAX_LISTED);
}
export type ListedMeeting = Awaited<ReturnType<typeof meetingsBetween>>[number];
