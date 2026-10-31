import { afterEach, describe, expect, it, vi } from "vitest";
import { insertEvent, listEvents, parseEvent, SyncTokenExpiredError } from "./calendar";
import answersFile from "./fixtures/answers.json";
import eventsFile from "./fixtures/events.json";
import { GoogleApiError, primaryCalendarName } from "./oauth";

// These files are replaced by a recording of a real calendar, so a test reads what it expects
// from the file and doesn't count on a field an event of that kind may not have.
type RawEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { date?: string };
  attendees?: { email: string; self?: boolean; resource?: boolean }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};
type RawPage = { items?: RawEvent[]; nextPageToken?: string; nextSyncToken?: string };

const events = eventsFile as unknown as Record<
  | "timed"
  | "allDay"
  | "withMeet"
  | "otherVideo"
  | "recurringInstance"
  | "cancelled"
  | "declined"
  | "focusTime",
  RawEvent
>;
const answers = answersFile as unknown as {
  calendar: { summary: string };
  firstPage: RawPage;
  lastPage: RawPage;
  syncGone: unknown;
  inserted: RawEvent;
  duplicate: unknown;
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const stub = (...replies: Response[]) => {
  const fetchStub = vi.fn<typeof fetch>();
  for (const next of replies) fetchStub.mockResolvedValueOnce(next);
  vi.stubGlobal("fetch", fetchStub);
};

afterEach(() => vi.unstubAllGlobals());

const newEvent = {
  key: "0190a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
  title: "Intro call",
  startsAt: new Date("2030-03-04T10:00:00Z"),
  endsAt: new Date("2030-03-04T10:30:00Z"),
  timezone: "Asia/Kolkata",
  guests: [],
  location: null,
  notes: null,
  emailGuests: false,
  addMeet: true,
};

describe("each kind of event as Google sends it", () => {
  it("keeps a timed meeting, without its description, the owner or a room", () => {
    const raw = events.timed;
    const { meeting, externalId } = parseEvent(raw)!;
    expect(externalId).toBe(raw.id);
    expect(meeting).toMatchObject({
      allDay: false,
      title: raw.summary ?? "No title",
      location: raw.location ?? null,
      startsOn: null,
      endsOn: null,
    });
    expect(meeting!.startsAt).toEqual(new Date(raw.start!.dateTime!));
    expect(meeting!.attendees.map(({ email }) => email)).toEqual(
      raw.attendees!
        .filter(({ self, resource }) => !self && !resource)
        .map(({ email }) => email),
    );
    if (raw.description) expect(JSON.stringify(meeting)).not.toContain(raw.description);
  });

  it("keeps an all-day meeting by its dates alone", () => {
    expect(parseEvent(events.allDay)!.meeting).toMatchObject({
      allDay: true,
      startsAt: null,
      endsAt: null,
      startsOn: events.allDay.start!.date,
      endsOn: events.allDay.end!.date,
    });
  });

  it("finds the join link in a Meet event and in another service's", () => {
    expect(parseEvent(events.withMeet)!.meeting!.meetingUrl).toBe(events.withMeet.hangoutLink);
    const video = events.otherVideo.conferenceData?.entryPoints?.find(
      ({ entryPointType }) => entryPointType === "video",
    );
    expect(parseEvent(events.otherVideo)!.meeting!.meetingUrl).toBe(video?.uri ?? null);
  });

  it("keeps a repeating meeting's one instance under its own id", () => {
    const parsed = parseEvent(events.recurringInstance)!;
    expect(parsed.externalId).toBe(events.recurringInstance.id);
    expect(parsed.meeting).not.toBeNull();
  });

  it.each([
    ["cancelled", events.cancelled],
    ["declined", events.declined],
    ["focus time", events.focusTime],
  ])("names a %s event only so its copy can go", (_label, raw) => {
    expect(parseEvent(raw)).toEqual({ externalId: raw.id, meeting: null });
  });
});

describe("listEvents on Google's answers", () => {
  it("reads a page with a next page, then the last with a sync token", async () => {
    stub(reply(200, answers.firstPage), reply(200, answers.lastPage));
    const query = { timeMin: new Date("2030-01-01"), timeMax: new Date("2030-02-01") };

    const first = await listEvents("token", query);
    expect(first.events).toHaveLength(answers.firstPage.items?.length ?? 0);
    expect(first.nextPageToken).toBe(answers.firstPage.nextPageToken);
    expect(first.nextSyncToken).toBeUndefined();

    const last = await listEvents("token", query, first.nextPageToken);
    expect(last.events.map(({ externalId }) => externalId)).toEqual(
      (answers.lastPage.items ?? []).map(({ id }) => id),
    );
    expect(last.nextPageToken).toBeUndefined();
    expect(last.nextSyncToken).toBe(answers.lastPage.nextSyncToken);
  });

  it("says a 410 means starting again", async () => {
    stub(reply(410, answers.syncGone));
    await expect(listEvents("token", { syncToken: "old" })).rejects.toBeInstanceOf(
      SyncTokenExpiredError,
    );
  });
});

describe("insertEvent on Google's answers", () => {
  it("takes the new event's id and Meet link", async () => {
    stub(reply(200, answers.inserted));
    const { created, event } = await insertEvent("token", newEvent);
    expect(created).toBe(true);
    expect(event.externalId).toBe(answers.inserted.id);
    expect(event.meeting!.meetingUrl).toBe(answers.inserted.hangoutLink ?? null);
  });

  it("reads the existing event on a 409, so a second send makes nothing new", async () => {
    stub(reply(409, answers.duplicate), reply(200, answers.inserted));
    const { created, event } = await insertEvent("token", newEvent);
    expect(created).toBe(false);
    expect(event.externalId).toBe(answers.inserted.id);
  });
});

describe("the primary calendar", () => {
  it("names it", async () => {
    stub(reply(200, answers.calendar));
    await expect(primaryCalendarName("token")).resolves.toBe(answers.calendar.summary);
  });

  it("carries the status of a refusal", async () => {
    stub(reply(403, { error: { code: 403 } }));
    await expect(primaryCalendarName("token")).rejects.toEqual(new GoogleApiError(403));
  });
});
