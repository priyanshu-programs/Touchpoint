import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLog,
  calendarEvents,
  contactEmails,
  contactOrganizations,
  contacts,
  integrationConnections,
} from "@/db/schema";
import {
  deleteEvent,
  eventIdOf,
  getEvent,
  insertEvent,
  listEvents,
  moveEvent,
} from "@/integrations/google/calendar";
import { CALENDAR_WRITE, GoogleApiError } from "@/integrations/google/oauth";
import { logger } from "@/lib/logger";
import { dateIn, formatDate, formatDateTime, formatTime, fromLocalInput } from "@/lib/time";
import { audit } from "@/modules/audit/service";
import { outsiders, outsidersMessage } from "@/modules/contacts/at-company";
import { ownerTimezone } from "@/modules/settings/service";
import {
  matchMeetings,
  ownConnection,
  stillConnected,
  upsertMeetings,
  WINDOW_AHEAD_MS,
} from "./calendar";
import { MEETINGS_PER_HOUR, type MeetingInput } from "./schema";
import {
  ACCESS_NOT_ACCEPTED,
  ConnectionUnavailableError,
  googleAccessToken,
} from "./service";

const ACTION = "meeting.schedule";
const CANCEL_ACTION = "meeting.cancel";
const MOVE_ACTION = "meeting.move";
// The confirmation is read before it is pressed, so a start in this very minute still counts.
const START_GRACE_MS = 60_000;

const NOT_ANSWERED =
  "Google didn't answer, so Touchpoint can't say whether the meeting was made. Check your calendar, or press Schedule again: it won't make a second one.";

const MOVE_NOT_ANSWERED =
  "Google didn't answer, so Touchpoint can't say whether the meeting was moved. Check your calendar, or press Confirm again.";

const CANCEL_NOT_ANSWERED =
  "Google didn't answer, so Touchpoint can't say whether the meeting was cancelled. Check your calendar, or press Cancel meeting again.";

export type SchedulingState = "off" | "needs_permission" | "ready";

export async function schedulingState(ownerId: string): Promise<SchedulingState> {
  const [row] = await db
    .select({ status: integrationConnections.status, scopes: integrationConnections.scopes })
    .from(integrationConnections)
    .where(ownConnection(ownerId));
  if (row?.status !== "connected") return "off";
  return row.scopes.includes(CALENDAR_WRITE) ? "ready" : "needs_permission";
}

// Who to start a company's meeting with: its primary contact, or else anyone there with an email.
export async function firstInvitee(ownerId: string, organizationId: string) {
  const [person] = await db
    .select({ id: contacts.id, label: contacts.fullName })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .innerJoin(contactEmails, eq(contactEmails.contactId, contacts.id))
    .where(
      and(
        eq(contactOrganizations.ownerId, ownerId),
        eq(contactOrganizations.organizationId, organizationId),
      ),
    )
    .orderBy(desc(contactOrganizations.isPrimary), asc(contacts.fullName))
    .limit(1);
  return person ?? null;
}

async function guestsOf(ownerId: string, contactIds: string[]) {
  const rows = await db
    .select({ id: contacts.id, name: contacts.fullName, email: contactEmails.email })
    .from(contacts)
    .leftJoin(
      contactEmails,
      and(eq(contactEmails.contactId, contacts.id), eq(contactEmails.ownerId, ownerId)),
    )
    .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.id, contactIds)))
    .orderBy(desc(contactEmails.isPrimary), asc(contactEmails.createdAt));
  return contactIds.map((id) => rows.find((row) => row.id === id));
}

type Refusal = { ok: false; message: string };
const refuse = (message: string): Refusal => ({ ok: false, message });

function timesOf(input: { startsAt: string; endsAt: string }, timezone: string) {
  const startsAt = fromLocalInput(input.startsAt, timezone);
  const endsAt = fromLocalInput(input.endsAt, timezone);
  if (endsAt <= startsAt) {
    return refuse("A meeting has to end after it starts.");
  }
  const now = Date.now();
  if (startsAt.getTime() < now - START_GRACE_MS) {
    return refuse("That start time has already passed.");
  }
  if (startsAt.getTime() >= now + WINDOW_AHEAD_MS) {
    return refuse("Touchpoint can schedule up to 90 days ahead. For a later meeting, use Google Calendar.");
  }
  return { ok: true as const, startsAt, endsAt };
}

// `atCompany` is the company the meeting is scheduled from, whose people alone it is with.
async function check(ownerId: string, input: MeetingInput, atCompany: string | null) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(ownConnection(ownerId));
  if (connection?.status !== "connected") {
    return refuse("Connect Google Calendar in Settings first.");
  }
  if (!connection.scopes.includes(CALENDAR_WRITE)) {
    return refuse("Allow scheduling in Settings first.");
  }

  const recent = await db.$count(
    auditLog,
    and(
      eq(auditLog.ownerId, ownerId),
      eq(auditLog.action, ACTION),
      gt(auditLog.createdAt, sql`now() - interval '1 hour'`),
    ),
  );
  if (recent >= MEETINGS_PER_HOUR) {
    return refuse(`Touchpoint schedules at most ${MEETINGS_PER_HOUR} meetings an hour. Try again later.`);
  }

  const timezone = await ownerTimezone(db, ownerId);
  const times = timesOf(input, timezone);
  if (!times.ok) return times;
  const { startsAt, endsAt } = times;

  const guests: { email: string; name: string }[] = [];
  for (const guest of await guestsOf(ownerId, input.contactIds)) {
    if (!guest) return refuse("Choose people from the list.");
    if (!guest.email) {
      return refuse(`${guest.name} has no email address, so Google can't invite them. Add one, or take them off.`);
    }
    guests.push({ email: guest.email, name: guest.name });
  }
  const away = atCompany && (await outsiders(db, ownerId, atCompany, input.contactIds));
  if (away) return refuse(outsidersMessage(away));
  // A press again after Google's answer was lost finds this very meeting there already.
  const room = await roomFor(ownerId, startsAt, endsAt, timezone, eventIdOf(input.key));
  if (!room.ok) return room;
  return { ok: true, connection, timezone, startsAt, endsAt, guests, near: room.near } as const;
}

// The owner's rule (2026-11-21): meetings never overlap, and one closer than this to
// another is booked only after a warning naming it.
export const MEETING_GAP_MS = 30 * 60_000;
const DAY_MS = 24 * 3_600_000;

type Busy = { title: string; startsAt: Date; endsAt: Date };

function span(ms: number) {
  const total = Math.round(ms / 60_000);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins || !hours) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// The first start at or after `from` that keeps the gap on both sides, within a day.
function nextFree(busy: Busy[], from: Date, length: number) {
  const starts = [from.getTime(), ...busy.map(({ endsAt }) => endsAt.getTime() + MEETING_GAP_MS)]
    .filter((start) => start >= from.getTime() && start < from.getTime() + DAY_MS)
    .sort((a, b) => a - b);
  return starts.find((start) =>
    busy.every(
      ({ startsAt, endsAt }) =>
        endsAt.getTime() + MEETING_GAP_MS <= start ||
        startsAt.getTime() >= start + length + MEETING_GAP_MS,
    ),
  );
}

// Read from Google itself, since the stored copy can be a day old. `skip` is the meeting
// being moved, which doesn't clash with itself.
async function roomFor(
  ownerId: string,
  startsAt: Date,
  endsAt: Date,
  timezone: string,
  skip?: string,
): Promise<Refusal | { ok: true; near: string[] }> {
  let busy: Busy[];
  try {
    const listed = await withToken(ownerId, (token) =>
      listEvents(token, {
        timeMin: new Date(startsAt.getTime() - DAY_MS),
        timeMax: new Date(endsAt.getTime() + DAY_MS),
      }),
    );
    busy = listed.events.flatMap(({ externalId, meeting }) =>
      meeting && !meeting.allDay && meeting.startsAt && meeting.endsAt && externalId !== skip
        ? [{ title: meeting.title, startsAt: meeting.startsAt, endsAt: meeting.endsAt }]
        : [],
    );
  } catch (error) {
    if (error instanceof ConnectionUnavailableError) {
      return refuse("Google no longer accepts this connection. Reconnect in Settings to go on.");
    }
    logger.error("meeting.clash_check_failed", { ownerId, error });
    return refuse(
      "Google didn't answer, so Touchpoint couldn't check your calendar for clashes. Try again in a moment.",
    );
  }

  const day = dateIn(timezone, startsAt);
  const at = (when: Date) =>
    dateIn(timezone, when) === day ? formatTime(when, timezone) : formatDateTime(when, timezone);
  const times = (meeting: Busy) => `${at(meeting.startsAt)} to ${at(meeting.endsAt)}`;

  const clash = busy.find((meeting) => meeting.startsAt < endsAt && meeting.endsAt > startsAt);
  if (clash) {
    const length = endsAt.getTime() - startsAt.getTime();
    const free = nextFree(busy, startsAt, length);
    return refuse(
      `It overlaps "${clash.title}" (${times(clash)}), so it can't be booked. ` +
        (free === undefined
          ? `Pick a time at least ${span(MEETING_GAP_MS)} clear of other meetings.`
          : `The next free time, ${span(MEETING_GAP_MS)} clear of other meetings, is ${times({ title: "", startsAt: new Date(free), endsAt: new Date(free + length) })}.`),
    );
  }

  const near = busy.flatMap((meeting) => {
    const before = meeting.endsAt <= startsAt;
    const gap = before
      ? startsAt.getTime() - meeting.endsAt.getTime()
      : meeting.startsAt.getTime() - endsAt.getTime();
    if (gap >= MEETING_GAP_MS) return [];
    return [
      `You have "${meeting.title}" from ${times(meeting)}: this one ${
        before ? `starts ${span(gap)} after it ends` : `ends ${span(gap)} before it starts`
      }.`,
    ];
  });
  return { ok: true, near };
}

const listed = new Intl.ListFormat("en-GB", { type: "conjunction" });

// Says just what Google will do. Everything in it was checked on the server.
export function meetingSummary(
  input: Pick<MeetingInput, "title" | "emailGuests" | "addMeet">,
  meeting: {
    accountEmail: string;
    timezone: string;
    startsAt: Date;
    endsAt: Date;
    guests: { email: string; name: string }[];
  },
) {
  const { timezone, startsAt, endsAt } = meeting;
  const sameDay = dateIn(timezone, startsAt) === dateIn(timezone, endsAt);
  const end = sameDay ? formatTime(endsAt, timezone) : formatDateTime(endsAt, timezone);
  const people = listed.format(meeting.guests.map(({ name, email }) => `${name} (${email})`));
  return [
    `Google will add "${input.title}" to your calendar (${meeting.accountEmail}) on ${formatDateTime(startsAt, timezone)} to ${end}${input.addMeet ? ", with a Google Meet link" : ""}.`,
    input.emailGuests
      ? `It will email an invitation to ${people}.`
      : `It will list ${people} as invited and email nobody.`,
  ].join(" ");
}

export async function checkMeeting(
  ownerId: string,
  input: MeetingInput,
  atCompany: string | null = null,
) {
  const checked = await check(ownerId, input, atCompany);
  if (!checked.ok) return checked;
  return {
    ok: true as const,
    summary: [
      meetingSummary(input, { ...checked, accountEmail: checked.connection.accountEmail }),
      ...checked.near,
    ].join(" "),
  };
}

// As in a sync, Google can turn down a token it has just issued, so a 401 is tried once
// more with a fresh one. A form's key keeps that second try from making a second meeting.
async function withToken<T>(ownerId: string, call: (token: string) => Promise<T>) {
  try {
    return await call(await googleAccessToken(ownerId));
  } catch (error) {
    if (!(error instanceof GoogleApiError && error.status === 401)) throw error;
    return call(await googleAccessToken(ownerId, { force: true }));
  }
}

function refusalFrom(
  ownerId: string,
  error: unknown,
  doing: "make" | "cancel" | "move" = "make",
): Refusal {
  if (error instanceof ConnectionUnavailableError) {
    return {
      ok: false,
      message: "Google no longer accepts this connection. Reconnect in Settings to go on.",
    };
  }
  logger.error(`meeting.${doing === "make" ? "schedule" : doing}_failed`, {
    ownerId,
    error,
  });
  if (error instanceof GoogleApiError && error.status === 401) {
    return { ok: false, message: ACCESS_NOT_ACCEPTED };
  }
  if (error instanceof GoogleApiError && error.status === 403) {
    return {
      ok: false,
      message:
        `Google refused to ${doing} this meeting. Check Allow scheduling in Settings, and that the Google Calendar API is on.`,
    };
  }
  if (error instanceof GoogleApiError && error.status < 500) {
    return {
      ok: false,
      message: {
        make: "Google refused to make this meeting, so nothing was added.",
        cancel: "Google refused to cancel this meeting, so it still stands.",
        move: "Google refused to move this meeting, so it stays where it was.",
      }[doing],
    };
  }
  return {
    ok: false,
    message: { make: NOT_ANSWERED, cancel: CANCEL_NOT_ANSWERED, move: MOVE_NOT_ANSWERED }[doing],
  };
}

export type ScheduleResult =
  | Refusal
  | { ok: true; meetingId: string }
  | { ok: true; meetingId: null; message: string };

export async function scheduleMeeting(
  ownerId: string,
  input: MeetingInput,
  atCompany: string | null = null,
): Promise<ScheduleResult> {
  const checked = await check(ownerId, input, atCompany);
  if (!checked.ok) return checked;
  const { connection, guests, startsAt, endsAt, timezone } = checked;

  let answer;
  try {
    answer = await withToken(ownerId, (token) => insertEvent(token, {
      key: input.key,
      title: input.title,
      startsAt,
      endsAt,
      timezone,
      guests,
      location: input.location || null,
      notes: input.notes || null,
      emailGuests: input.emailGuests,
      addMeet: input.addMeet,
    }));
  } catch (error) {
    return refusalFrom(ownerId, error);
  }

  const { externalId, meeting } = answer.event;
  // This same form made it before, and it has since been deleted at Google.
  if (!answer.created && !meeting) {
    return {
      ok: false,
      message: "That meeting was removed at Google. Open the form again to make a new one.",
    };
  }

  try {
    // On its own: the meeting exists at Google whatever becomes of the copy below.
    await audit(db, {
      ownerId,
      actor: "user",
      action: ACTION,
      entityType: "calendar_event",
      after: {
        externalId,
        title: input.title,
        startsAt,
        endsAt,
        guests: guests.map(({ email }) => email),
        emailGuests: input.emailGuests,
        addMeet: input.addMeet,
      },
    });
    const meetingId = await db.transaction(async (tx) => {
      if (!meeting || !(await stillConnected(tx, connection))) return null;
      const [row] = await upsertMeetings(tx, connection, [{ externalId, meeting }]);
      await matchMeetings(tx, ownerId);
      return row.id;
    });
    if (meetingId) return { ok: true, meetingId };
  } catch (error) {
    logger.error("meeting.copy_failed", { ownerId, error });
  }
  return {
    ok: true,
    meetingId: null,
    message:
      "The meeting is on your Google Calendar, but Touchpoint couldn't keep its copy. It appears here after the next sync, if Google is still connected.",
  };
}

// Only a meeting the owner organized and that hasn't started: for one they were invited
// to, Google's delete would quietly take it off their calendar and tell nobody.
const cancellableNow = sql`(${calendarEvents.startsAt} > now() or ${calendarEvents.startsOn} > current_date)`;

export function isCancellable(meeting: {
  organizedByOwner: boolean;
  allDay: boolean;
  startsAt: Date | null;
  startsOn: string | null;
}, today: string) {
  if (!meeting.organizedByOwner) return false;
  return meeting.allDay ? meeting.startsOn! > today : meeting.startsAt!.getTime() > Date.now();
}

export type CancelResult = Refusal | { ok: true };

// A meeting the owner organized that hasn't started, on a connection that may change it,
// under the hourly limit for this kind of change.
async function changeable(
  ownerId: string,
  eventId: string,
  action: string,
  verb: "cancel" | "move",
) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(ownConnection(ownerId));
  if (connection?.status !== "connected") {
    return refuse("Connect Google Calendar in Settings first.");
  }
  if (!connection.scopes.includes(CALENDAR_WRITE)) {
    return refuse("Allow scheduling in Settings first.");
  }

  const recent = await db.$count(
    auditLog,
    and(
      eq(auditLog.ownerId, ownerId),
      eq(auditLog.action, action),
      gt(auditLog.createdAt, sql`now() - interval '1 hour'`),
    ),
  );
  if (recent >= MEETINGS_PER_HOUR) {
    return refuse(`Touchpoint ${verb}s at most ${MEETINGS_PER_HOUR} meetings an hour. Try again later.`);
  }

  const [meeting] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.connectionId, connection.id),
        eq(calendarEvents.organizedByOwner, true),
        cancellableNow,
      ),
    );
  if (!meeting) {
    return refuse(
      `Only a meeting you organized that hasn't started can be ${verb === "cancel" ? "cancelled" : "moved"} here.`,
    );
  }
  return { ok: true as const, connection, meeting };
}

const whenOf = (meeting: typeof calendarEvents.$inferSelect, timezone: string) =>
  meeting.allDay ? `${formatDate(meeting.startsOn!)}, all day` : formatDateTime(meeting.startsAt!, timezone);

const guestsTold = (count: number, emailGuests: boolean, what: string) =>
  emailGuests && count > 0
    ? ` and email ${count === 1 ? "its guest" : `its ${count} guests`} ${what}.`
    : ", emailing nobody.";

// What Google will do, written here from the stored copy, for the owner to confirm.
export async function checkCancel(
  ownerId: string,
  input: { eventId: string; emailGuests: boolean },
) {
  const ready = await changeable(ownerId, input.eventId, CANCEL_ACTION, "cancel");
  if (!ready.ok) return ready;
  const { meeting } = ready;
  const timezone = await ownerTimezone(db, ownerId);
  return {
    ok: true as const,
    summary: `Google will cancel "${meeting.title}" on ${whenOf(meeting, timezone)}${guestsTold(meeting.attendees.length, input.emailGuests, "that it's cancelled")}`,
  };
}

type MoveInput = { eventId: string; startsAt: string; endsAt: string; emailGuests: boolean };

export async function checkMove(ownerId: string, input: MoveInput) {
  const ready = await changeable(ownerId, input.eventId, MOVE_ACTION, "move");
  if (!ready.ok) return ready;
  const { connection, meeting } = ready;
  if (meeting.allDay) {
    return refuse("An all-day meeting can't be moved here. Move it in Google Calendar.");
  }
  const timezone = await ownerTimezone(db, ownerId);
  const times = timesOf(input, timezone);
  if (!times.ok) return times;
  const { startsAt, endsAt } = times;
  const room = await roomFor(ownerId, startsAt, endsAt, timezone, meeting.externalId);
  if (!room.ok) return room;
  const sameDay = dateIn(timezone, startsAt) === dateIn(timezone, endsAt);
  const end = sameDay ? formatTime(endsAt, timezone) : formatDateTime(endsAt, timezone);
  return {
    ok: true as const,
    connection,
    meeting,
    timezone,
    startsAt,
    endsAt,
    summary: [
      `Google will move "${meeting.title}" from ${whenOf(meeting, timezone)} to ${formatDateTime(startsAt, timezone)} to ${end}${guestsTold(meeting.attendees.length, input.emailGuests, "the new time")}`,
      ...room.near,
    ].join(" "),
  };
}

// The copy can be a day old: Google says who organizes it now. Null: gone at Google.
async function heldAtGoogle(ownerId: string, externalId: string) {
  return withToken(ownerId, async (token) => {
    try {
      return (await getEvent(token, externalId)).meeting;
    } catch (error) {
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
        return null;
      }
      throw error;
    }
  });
}

export async function moveMeeting(ownerId: string, input: MoveInput): Promise<CancelResult> {
  const checked = await checkMove(ownerId, input);
  if (!checked.ok) return checked;
  const { connection, meeting, timezone, startsAt, endsAt } = checked;

  let moved;
  try {
    const held = await heldAtGoogle(ownerId, meeting.externalId);
    if (!held) return refuse("That meeting was removed at Google, so there's nothing to move.");
    if (!held.organizedByOwner) {
      return refuse("You didn't organize this meeting, so only its organizer can move it.");
    }
    moved = await withToken(ownerId, (token) =>
      moveEvent(token, meeting.externalId, { startsAt, endsAt, timezone }, input.emailGuests),
    );
  } catch (error) {
    return refusalFrom(ownerId, error, "move");
  }

  await audit(db, {
    ownerId,
    actor: "user",
    action: MOVE_ACTION,
    entityType: "calendar_event",
    entityId: meeting.id,
    before: { startsAt: meeting.startsAt, endsAt: meeting.endsAt },
    after: { externalId: meeting.externalId, startsAt, endsAt, emailGuests: input.emailGuests },
  });
  try {
    await db.transaction(async (tx) => {
      if (!moved.meeting || !(await stillConnected(tx, connection))) return;
      await upsertMeetings(tx, connection, [{ externalId: moved.externalId, meeting: moved.meeting }]);
    });
  } catch (error) {
    logger.error("meeting.copy_failed", { ownerId, error });
  }
  return { ok: true };
}

export async function cancelMeeting(
  ownerId: string,
  input: { eventId: string; emailGuests: boolean },
): Promise<CancelResult> {
  const ready = await changeable(ownerId, input.eventId, CANCEL_ACTION, "cancel");
  if (!ready.ok) return ready;
  const { connection, meeting } = ready;

  try {
    const held = await heldAtGoogle(ownerId, meeting.externalId);
    if (held && !held.organizedByOwner) {
      return refuse("You didn't organize this meeting, so only its organizer can cancel it. Decline it in Google Calendar.");
    }
    if (held) {
      await withToken(ownerId, (token) =>
        deleteEvent(token, meeting.externalId, input.emailGuests),
      );
    }
  } catch (error) {
    return refusalFrom(ownerId, error, "cancel");
  }

  await audit(db, {
    ownerId,
    actor: "user",
    action: CANCEL_ACTION,
    entityType: "calendar_event",
    after: {
      externalId: meeting.externalId,
      title: meeting.title,
      startsAt: meeting.startsAt,
      startsOn: meeting.startsOn,
      guests: meeting.attendees.map(({ email }) => email),
      emailGuests: input.emailGuests,
    },
  });
  // Notes and files written inside it stay, on their activity, as after a disconnect.
  await db.transaction(async (tx) => {
    if (!(await stillConnected(tx, connection))) return;
    await tx
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.ownerId, ownerId), eq(calendarEvents.id, meeting.id)));
  });
  return { ok: true };
}
