import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityContacts,
  contacts,
  organizations,
  timeline,
} from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { activityFileList, countEndedMeetings } from "@/modules/integrations/meetings";

const contactNames = async (ownerId: string, ids: string[]) =>
  ids.length === 0
    ? []
    : db
        .select({ id: contacts.id, name: contacts.fullName, photoVersion })
        .from(contacts)
        .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.id, ids)))
        .orderBy(asc(contacts.fullName));

// A meeting's own notes show inside the meeting while its copy is there.
const meetingNoteIds = (ownerId: string) => sql`(
  select ${activities.id} from ${activities}
  where ${activities.ownerId} = ${ownerId} and ${activities.calendarEventId} is not null
)`;

// What happened to one record, or to all of them when none is named, newest first.
// Asked for activities alone, the notes kept inside a meeting are left out.
export async function listTimeline(
  ownerId: string,
  options: (
    | { contactId: string; organizationId?: undefined }
    | { organizationId: string; contactId?: undefined }
    | { contactId?: undefined; organizationId?: undefined }
  ) & {
    after?: string;
    limit?: number;
    withoutMeetings?: boolean;
    eventType?: "activity" | "material_send";
  } = {},
) {
  const limit = Math.min(options.limit ?? 30, 100);
  const events = await db
    .select()
    .from(timeline)
    .where(
      and(
        eq(timeline.ownerId, ownerId),
        options.withoutMeetings ? ne(timeline.eventType, "calendar_event") : undefined,
        options.eventType ? eq(timeline.eventType, options.eventType) : undefined,
        options.eventType === "activity"
          ? sql`${timeline.eventId} not in ${meetingNoteIds(ownerId)}`
          : undefined,
        options.contactId
          ? sql`${options.contactId} = any(${timeline.contactIds})`
          : options.organizationId
            ? eq(timeline.organizationId, options.organizationId)
            : undefined,
        // Comparing against the stored row keeps microsecond precision that a JS Date would lose.
        options.after
          ? sql`(${timeline.occurredAt}, ${timeline.eventId}) < (
              select occurred_at, event_id from timeline
              where event_id = ${options.after} and owner_id = ${ownerId}
            )`
          : undefined,
      ),
    )
    .orderBy(desc(timeline.occurredAt), desc(timeline.eventId))
    .limit(limit + 1);

  const page = events.slice(0, limit);
  const names = await contactNames(ownerId, [
    ...new Set(page.flatMap((event) => event.contactIds)),
  ]);
  return {
    rows: page.map((event) => ({
      ...event,
      contacts: names.filter((contact) => event.contactIds.includes(contact.id)),
    })),
    nextAfter: events.length > limit ? page[page.length - 1].eventId : null,
  };
}

// How many of each kind of entry one record's Activity tab holds: meetings once ended,
// and activities but for the notes kept inside a meeting.
export async function countRecordEvents(
  ownerId: string,
  filter: { contactId: string } | { organizationId: string },
) {
  const [rows, meetings] = await Promise.all([
    db
      .select({ eventType: timeline.eventType, count: sql<number>`count(*)::int` })
      .from(timeline)
      .where(
        and(
          eq(timeline.ownerId, ownerId),
          ne(timeline.eventType, "calendar_event"),
          sql`${timeline.eventId} not in ${meetingNoteIds(ownerId)}`,
          "contactId" in filter
            ? sql`${filter.contactId} = any(${timeline.contactIds})`
            : eq(timeline.organizationId, filter.organizationId),
        ),
      )
      .groupBy(timeline.eventType),
    countEndedMeetings(ownerId, filter),
  ]);
  const count = (type: string) =>
    rows.find((row) => row.eventType === type)?.count ?? 0;
  return {
    meetings,
    sends: count("material_send"),
    activities: count("activity"),
  };
}

export type TimelineRow = Awaited<
  ReturnType<typeof listTimeline>
>["rows"][number];

export async function getActivity(ownerId: string, id: string) {
  const [row] = await db
    .select({ activity: activities, organizationName: organizations.name })
    .from(activities)
    .leftJoin(organizations, eq(organizations.id, activities.organizationId))
    .where(and(eq(activities.ownerId, ownerId), eq(activities.id, id)));
  if (!row) return null;

  const [linked, files] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.fullName })
      .from(activityContacts)
      .innerJoin(contacts, eq(contacts.id, activityContacts.contactId))
      .where(
        and(
          eq(activityContacts.ownerId, ownerId),
          eq(activityContacts.activityId, id),
        ),
      )
      .orderBy(asc(contacts.fullName)),
    activityFileList(ownerId, id),
  ]);
  return {
    ...row.activity,
    organizationName: row.organizationName,
    contacts: linked,
    files,
  };
}
