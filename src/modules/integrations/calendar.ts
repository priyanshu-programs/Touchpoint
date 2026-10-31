import { and, eq, gte, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  calendarEventContacts,
  calendarEvents,
  integrationConnections,
} from "@/db/schema";
import {
  listEvents,
  SyncTokenExpiredError,
  type ListedEvent,
  type Meeting,
} from "@/integrations/google/calendar";
import { GoogleApiError } from "@/integrations/google/oauth";
import { FREE_MAIL_DOMAINS } from "@/lib/free-mail";
import { logger } from "@/lib/logger";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import {
  ACCESS_NOT_ACCEPTED,
  ConnectionUnavailableError,
  googleAccessToken,
} from "./service";

export const CALENDAR_SYNC_JOB = "calendar.sync";
const DAY_MS = 24 * 60 * 60_000;
const WINDOW_BACK_MS = 30 * DAY_MS;
export const WINDOW_AHEAD_MS = 90 * DAY_MS;
// A sync token never reports an old recurring meeting that has just come within the
// window, so the window is read whole once a day. That also repairs a missed deletion.
const FULL_SYNC_EVERY_MS = DAY_MS;
const MAX_PAGES = 40;
const SYNC_NOW_GAP_MS = 60_000;

type Connection = typeof integrationConnections.$inferSelect;
type SyncWindow = { from: Date; to: Date };

export const ownConnection = (ownerId: string) =>
  and(
    eq(integrationConnections.ownerId, ownerId),
    eq(integrationConnections.provider, "google"),
  );

// Taken first in every write, so a disconnect during a sync can't bring meetings back.
export async function stillConnected(tx: Tx, connection: Connection) {
  const [row] = await tx
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connection.id),
        eq(integrationConnections.status, "connected"),
        eq(integrationConnections.accountEmail, connection.accountEmail),
      ),
    )
    .for("update");
  return Boolean(row);
}

// One copy per Google id, whichever of sync and scheduling gets there first.
export async function upsertMeetings(
  tx: Tx,
  connection: Connection,
  meetings: { externalId: string; meeting: Meeting }[],
) {
  if (meetings.length === 0) return [];
  return tx
    .insert(calendarEvents)
    .values(
      meetings.map(({ externalId, meeting }) => ({
        ownerId: connection.ownerId,
        connectionId: connection.id,
        externalId,
        ...meeting,
      })),
    )
    .onConflictDoUpdate({
      target: [calendarEvents.connectionId, calendarEvents.externalId],
      set: {
        title: sql`excluded.title`,
        location: sql`excluded.location`,
        meetingUrl: sql`excluded.meeting_url`,
        htmlLink: sql`excluded.html_link`,
        allDay: sql`excluded.all_day`,
        startsAt: sql`excluded.starts_at`,
        endsAt: sql`excluded.ends_at`,
        startsOn: sql`excluded.starts_on`,
        endsOn: sql`excluded.ends_on`,
        timezone: sql`excluded.timezone`,
        attendees: sql`excluded.attendees`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: calendarEvents.id });
}

async function writePage(
  connection: Connection,
  events: ListedEvent[],
  horizon: Date,
) {
  // One id twice in a page would stop the upsert, and the last answer is the newest.
  const byId = new Map(events.map((event) => [event.externalId, event]));
  const kept = [...byId.values()].flatMap(({ externalId, meeting }) => {
    if (!meeting) return [];
    // Moved past the window: it goes, and a later full read brings it back in time.
    if (meeting.startsAt ? meeting.startsAt >= horizon : meeting.startsOn! >= isoDate(horizon)) {
      return [];
    }
    return [{ externalId, meeting }];
  });
  const keptIds = new Set(kept.map((event) => event.externalId));
  const gone = [...byId.keys()].filter((externalId) => !keptIds.has(externalId));

  return db.transaction(async (tx) => {
    if (!(await stillConnected(tx, connection))) return false;
    if (gone.length > 0) {
      await tx
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.connectionId, connection.id),
            inArray(calendarEvents.externalId, gone),
          ),
        );
    }
    await upsertMeetings(tx, connection, kept);
    return true;
  });
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

// What Google's full read of the window didn't return is gone. Older meetings stay as
// history. An all-day event's date has no zone, so the window's edge days are left alone.
async function pruneWindow(tx: Tx, connectionId: string, window: SyncWindow, seen: Set<string>) {
  await tx
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.connectionId, connectionId),
        seen.size > 0 ? notInArray(calendarEvents.externalId, [...seen]) : undefined,
        or(
          and(gte(calendarEvents.startsAt, window.from), lt(calendarEvents.startsAt, window.to)),
          and(
            sql`${calendarEvents.startsOn} > ${isoDate(window.from)}`,
            sql`${calendarEvents.startsOn} < ${isoDate(window.to)}`,
          ),
        ),
      ),
    );
}

// Run over every stored meeting on each sync, so a person or a domain added since is
// picked up, and one removed since lets go.
export async function matchMeetings(tx: Tx, ownerId: string) {
  await tx.execute(sql`
    delete from calendar_event_contacts link
    using calendar_events event
    where link.event_id = event.id
      and event.owner_id = ${ownerId}
      and not exists (
        select 1 from jsonb_array_elements(event.attendees) attendee
        join contact_emails email
          on email.owner_id = event.owner_id
          and email.email = (attendee->>'email')::citext
        where email.contact_id = link.contact_id
      )
  `);
  await tx.execute(sql`
    insert into calendar_event_contacts (event_id, contact_id, owner_id)
    select distinct event.id, email.contact_id, event.owner_id
    from calendar_events event
    cross join jsonb_array_elements(event.attendees) attendee
    join contact_emails email
      on email.owner_id = event.owner_id
      and email.email = (attendee->>'email')::citext
    where event.owner_id = ${ownerId}
    on conflict do nothing
  `);
  const freeMail = sql.join(
    FREE_MAIL_DOMAINS.map((domain) => sql`${domain}`),
    sql`, `,
  );
  // The first matched person's company, or else the first attendee's work domain.
  await tx.execute(sql`
    update calendar_events target
    set organization_id = matched.organization_id
    from (
      select event.id, coalesce(
        (
          select place.organization_id
          from jsonb_array_elements(event.attendees) with ordinality attendee(value, position)
          join contact_emails email
            on email.owner_id = event.owner_id
            and email.email = (attendee.value->>'email')::citext
          join contact_organizations place
            on place.contact_id = email.contact_id
            and place.owner_id = event.owner_id
          order by attendee.position, place.created_at, place.organization_id
          limit 1
        ),
        (
          select company.id
          from jsonb_array_elements(event.attendees) with ordinality attendee(value, position)
          join organizations company
            on company.owner_id = event.owner_id
            and company.domain = split_part(attendee.value->>'email', '@', 2)
          where split_part(attendee.value->>'email', '@', 2) not in (${freeMail})
          order by attendee.position
          limit 1
        )
      ) as organization_id
      from calendar_events event
      where event.owner_id = ${ownerId}
    ) matched
    where target.id = matched.id
      and target.organization_id is distinct from matched.organization_id
  `);
}

async function runSync(connection: Connection, token: string, full: boolean) {
  const now = Date.now();
  const window = { from: new Date(now - WINDOW_BACK_MS), to: new Date(now + WINDOW_AHEAD_MS) };
  const query =
    full || !connection.syncCursor
      ? { timeMin: window.from, timeMax: window.to }
      : { syncToken: connection.syncCursor };
  const isFull = "timeMin" in query;
  const seen = new Set<string>();

  let pageToken: string | undefined;
  let syncToken: string | undefined;
  for (let pages = 0; ; pages++) {
    if (pages === MAX_PAGES) throw new Error("The calendar answered with too many pages");
    const answer = await listEvents(token, query, pageToken);
    if (!(await writePage(connection, answer.events, window.to))) return;
    for (const { externalId, meeting } of answer.events) {
      if (meeting) seen.add(externalId);
      else seen.delete(externalId);
    }
    pageToken = answer.nextPageToken;
    if (!pageToken) {
      syncToken = answer.nextSyncToken;
      break;
    }
  }

  await db.transaction(async (tx) => {
    if (!(await stillConnected(tx, connection))) return;
    if (isFull) await pruneWindow(tx, connection.id, window, seen);
    await matchMeetings(tx, connection.ownerId);
    await tx
      .update(integrationConnections)
      .set({
        syncCursor: syncToken ?? null,
        lastSyncAt: new Date(),
        lastFullSyncAt: isFull ? new Date() : connection.lastFullSyncAt,
        lastError: null,
      })
      .where(eq(integrationConnections.id, connection.id));
  });
}

function problemWith(error: unknown) {
  if (error instanceof GoogleApiError && error.status === 403) {
    return "Google refused to show your calendar. Check that the Google Calendar API is enabled in your Google Cloud project.";
  }
  if (error instanceof GoogleApiError && error.status === 401) return ACCESS_NOT_ACCEPTED;
  return "Google could not be reached on the last try.";
}

async function readCalendar(connection: Connection, token: string, full: boolean) {
  try {
    await runSync(connection, token, full);
  } catch (error) {
    if (!(error instanceof SyncTokenExpiredError)) throw error;
    await runSync(connection, token, true);
  }
}

// Throws what can be tried again; a connection the owner has to fix just stops here,
// already marked, with a banner asking them to reconnect.
export async function syncCalendar(ownerId: string) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(ownConnection(ownerId));
  if (connection?.status !== "connected") return false;

  try {
    const token = await googleAccessToken(ownerId);
    const dueFull =
      !connection.lastFullSyncAt ||
      Date.now() - connection.lastFullSyncAt.getTime() >= FULL_SYNC_EVERY_MS;
    try {
      await readCalendar(connection, token, dueFull);
    } catch (error) {
      if (!(error instanceof GoogleApiError && error.status === 401)) throw error;
      // Google has turned down a token it issued seconds earlier, so its expiry date
      // doesn't settle it: ask for a new one, once.
      await readCalendar(
        connection,
        await googleAccessToken(ownerId, { force: true }),
        dueFull,
      );
    }
    return true;
  } catch (error) {
    if (error instanceof ConnectionUnavailableError) return false;
    await db
      .update(integrationConnections)
      .set({ lastError: problemWith(error) })
      .where(eq(integrationConnections.id, connection.id));
    throw error;
  }
}

export async function enqueueCalendarSyncs() {
  const due = await db
    .select({ ownerId: integrationConnections.ownerId })
    .from(integrationConnections)
    .where(eq(integrationConnections.status, "connected"));
  for (const { ownerId } of due) {
    await enqueue({
      kind: CALENDAR_SYNC_JOB,
      ownerId,
      dedupeKey: `${CALENDAR_SYNC_JOB}:${ownerId}`,
    });
  }
}

export async function runCalendarSync(job: ClaimedJob) {
  if (job.ownerId) await syncCalendar(job.ownerId);
}

// "Sync now" reaches Google at most once a minute, whatever the last try's outcome.
export async function syncCalendarNow(ownerId: string) {
  const now = new Date();
  const [claimed] = await db
    .update(integrationConnections)
    .set({ lastSyncAttemptAt: now })
    .where(
      and(
        ownConnection(ownerId),
        eq(integrationConnections.status, "connected"),
        or(
          isNull(integrationConnections.lastSyncAttemptAt),
          lte(
            integrationConnections.lastSyncAttemptAt,
            new Date(now.getTime() - SYNC_NOW_GAP_MS),
          ),
        ),
      ),
    )
    .returning({ id: integrationConnections.id });
  if (!claimed) return { ok: false as const, message: "Synced a moment ago." };

  try {
    if (!(await syncCalendar(ownerId))) {
      return {
        ok: false as const,
        message: "Google no longer accepts this connection. Reconnect to go on.",
      };
    }
  } catch (error) {
    logger.error("integration.sync_failed", { ownerId, error });
    return { ok: false as const, message: problemWith(error) };
  }
  const { kept } = await calendarSummary(ownerId);
  return {
    ok: true as const,
    message: `Synced. ${kept} ${kept === 1 ? "meeting" : "meetings"} kept.`,
  };
}

export async function calendarSummary(ownerId: string) {
  const [row] = await db
    .select({
      kept: sql<number>`count(*)::int`,
      linked: sql<number>`count(*) filter (where ${calendarEvents.organizationId} is not null or exists (
        select 1 from ${calendarEventContacts} where ${calendarEventContacts.eventId} = ${calendarEvents.id}
      ))::int`,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.ownerId, ownerId));
  return row;
}
