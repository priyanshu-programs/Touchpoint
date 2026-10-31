import { z } from "zod";
import type { CalendarAttendee } from "@/db/schema";
import { GoogleApiError } from "./oauth";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const CALENDAR_HOSTS = new Set(["www.google.com", "calendar.google.com"]);
const MAX_ATTENDEES = 100;

// Google no longer holds the changes since this token: start again from a full read.
export class SyncTokenExpiredError extends Error {}

export type Meeting = {
  title: string;
  location: string | null;
  meetingUrl: string | null;
  htmlLink: string | null;
  allDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startsOn: string | null;
  endsOn: string | null;
  timezone: string | null;
  attendees: CalendarAttendee[];
};

// `meeting` is null for what isn't a meeting of the owner's: cancelled, declined, or a
// focus time, out-of-office, working location or birthday.
export type ListedEvent = { externalId: string; meeting: Meeting | null };

const moment = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().max(100).optional(),
});

// Google adds fields of its own, so anything not named here is ignored.
const rawEvent = z.object({
  id: z.string().min(1).max(1024),
  status: z.string().optional(),
  eventType: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
  conferenceData: z
    .object({
      entryPoints: z
        .array(z.object({ entryPointType: z.string().optional(), uri: z.string().optional() }))
        .optional(),
    })
    .optional(),
  start: moment.optional(),
  end: moment.optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().optional(),
        displayName: z.string().optional(),
        responseStatus: z.string().optional(),
        self: z.boolean().optional(),
        resource: z.boolean().optional(),
      }),
    )
    .optional(),
});

const page = z.object({
  items: z.array(z.unknown()).optional(),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});

const cut = (value: string | undefined, length: number) =>
  value?.trim().slice(0, length) || null;

function httpsUrl(value: string | undefined) {
  if (!value || value.length > 2000) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function calendarUrl(value: string | undefined) {
  const url = httpsUrl(value);
  return url && CALENDAR_HOSTS.has(new URL(url).hostname) ? url : null;
}

const instant = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function when(event: z.infer<typeof rawEvent>) {
  const { start, end } = event;
  if (start?.dateTime) {
    const startsAt = instant(start.dateTime);
    if (!startsAt) return null;
    return {
      allDay: false,
      startsAt,
      endsAt: (end?.dateTime && instant(end.dateTime)) || startsAt,
      startsOn: null,
      endsOn: null,
    };
  }
  if (start?.date) {
    return {
      allDay: true,
      startsAt: null,
      endsAt: null,
      startsOn: start.date,
      endsOn: end?.date ?? start.date,
    };
  }
  return null;
}

export function parseEvent(raw: unknown): ListedEvent | null {
  const parsed = rawEvent.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  const externalId = event.id;

  const declined = event.attendees?.some(
    (attendee) => attendee.self && attendee.responseStatus === "declined",
  );
  const type = event.eventType ?? "default";
  const time = when(event);
  if (event.status === "cancelled" || declined || type !== "default" || !time) {
    return { externalId, meeting: null };
  }

  const attendees: CalendarAttendee[] = [];
  for (const attendee of event.attendees ?? []) {
    const email = attendee.email?.trim().toLowerCase();
    if (!email?.includes("@") || email.length > 254) continue;
    if (attendee.self || attendee.resource) continue;
    attendees.push({
      email,
      name: cut(attendee.displayName, 200),
      response: cut(attendee.responseStatus, 40),
    });
    if (attendees.length === MAX_ATTENDEES) break;
  }

  const video = event.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === "video",
  );
  return {
    externalId,
    meeting: {
      title: cut(event.summary, 500) ?? "No title",
      location: cut(event.location, 500),
      meetingUrl: httpsUrl(event.hangoutLink) ?? httpsUrl(video?.uri),
      htmlLink: calendarUrl(event.htmlLink),
      timezone: cut(event.start?.timeZone, 100),
      attendees,
      ...time,
    },
  };
}

export type EventQuery = { syncToken: string } | { timeMin: Date; timeMax: Date };

export async function listEvents(
  accessToken: string,
  query: EventQuery,
  pageToken?: string,
) {
  const url = new URL(EVENTS_URL);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "250");
  if ("syncToken" in query) {
    url.searchParams.set("syncToken", query.syncToken);
  } else {
    url.searchParams.set("timeMin", query.timeMin.toISOString());
    url.searchParams.set("timeMax", query.timeMax.toISOString());
  }
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (response.status === 410) throw new SyncTokenExpiredError();
  if (!response.ok) throw new GoogleApiError(response.status);

  const body = page.parse(await response.json());
  return {
    events: (body.items ?? []).flatMap((item) => parseEvent(item) ?? []),
    nextPageToken: body.nextPageToken,
    nextSyncToken: body.nextSyncToken,
  };
}

export type NewEvent = {
  // Made once per form, so a form sent twice can't make two meetings or two invitations.
  key: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  guests: { email: string; name: string }[];
  location: string | null;
  notes: string | null;
  emailGuests: boolean;
  addMeet: boolean;
};

async function getEvent(accessToken: string, id: string): Promise<ListedEvent> {
  const response = await fetch(`${EVENTS_URL}/${id}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new GoogleApiError(response.status);
  return parseEvent(await response.json()) ?? { externalId: id, meeting: null };
}

export async function insertEvent(
  accessToken: string,
  event: NewEvent,
): Promise<{ created: boolean; event: ListedEvent }> {
  // Google's ids are base32hex, which a uuid's hex digits already are.
  const id = event.key.replaceAll("-", "");
  const url = new URL(EVENTS_URL);
  url.searchParams.set("sendUpdates", event.emailGuests ? "all" : "none");
  if (event.addMeet) url.searchParams.set("conferenceDataVersion", "1");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id,
      summary: event.title,
      start: { dateTime: event.startsAt.toISOString(), timeZone: event.timezone },
      end: { dateTime: event.endsAt.toISOString(), timeZone: event.timezone },
      attendees: event.guests.map(({ email, name }) => ({ email, displayName: name })),
      ...(event.location && { location: event.location }),
      ...(event.notes && { description: event.notes }),
      ...(event.addMeet && {
        conferenceData: {
          createRequest: {
            requestId: id,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  // That id is taken: this same form got through before, even if its answer never arrived.
  if (response.status === 409) {
    return { created: false, event: await getEvent(accessToken, id) };
  }
  if (!response.ok) throw new GoogleApiError(response.status);
  return {
    created: true,
    event: parseEvent(await response.json()) ?? { externalId: id, meeting: null },
  };
}
