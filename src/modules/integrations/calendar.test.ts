import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import {
  calendarEventContacts,
  calendarEvents,
  integrationConnections,
  jobs,
} from "@/db/schema";
import {
  parseEvent,
  SyncTokenExpiredError,
  type ListedEvent,
} from "@/integrations/google/calendar";
import { CALENDAR_READ, GoogleApiError } from "@/integrations/google/oauth";
import { listAudit } from "@/modules/audit/service";
import { mergeContacts } from "@/modules/contacts/merge";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact, deleteContact } from "@/modules/contacts/service";
import { mergeOrganizations } from "@/modules/organizations/merge";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  calendarSummary,
  enqueueCalendarSyncs,
  syncCalendar,
  syncCalendarNow,
} from "./calendar";
import { completeGoogleConnect, disconnectGoogle, saveGoogleClient } from "./service";

const google = vi.hoisted(() => ({ listEvents: vi.fn() }));
vi.mock("@/integrations/google/calendar", async (actual) => ({
  ...(await actual<typeof import("@/integrations/google/calendar")>()),
  listEvents: google.listEvents,
}));
const oauth = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  revokeGrant: vi.fn(),
  refreshAccess: vi.fn(),
}));
vi.mock("@/integrations/google/oauth", async (actual) => ({
  ...(await actual<typeof import("@/integrations/google/oauth")>()),
  ...oauth,
}));

const DAY = 24 * 60 * 60_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

const event = (
  externalId: string,
  overrides: Partial<NonNullable<ListedEvent["meeting"]>> = {},
): ListedEvent => ({
  externalId,
  meeting: {
    title: `Meeting ${externalId}`,
    location: null,
    meetingUrl: null,
    htmlLink: null,
    allDay: false,
    startsAt: inDays(1),
    endsAt: inDays(1.1),
    startsOn: null,
    endsOn: null,
    timezone: null,
    attendees: [],
    ...overrides,
  },
});
const gone = (externalId: string): ListedEvent => ({ externalId, meeting: null });
const answer = (events: ListedEvent[], extra = {}) => ({
  events,
  nextSyncToken: "token-1",
  ...extra,
});
const attendee = (email: string) => ({ email, name: null, response: "accepted" });

async function person(ownerId: string, firstName: string, email: string, organizationId = "") {
  const result = await createContact(
    ownerId,
    newContactInput.parse({
      firstName,
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
      email,
      organizationId,
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function company(ownerId: string, name: string, domain = "") {
  const result = await createOrganization(
    ownerId,
    organizationInput.parse({
      name,
      domain,
      website: "",
      phone: "",
      email: "",
      industry: "",
      description: "",
      city: "",
      region: "",
      country: "",
      status: "prospect",
      tags: "",
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

// A company with a domain has its first website read queued, which stops a merge.
const settleReads = () =>
  db.execute(sql`update enrichment_runs set status = 'done', finished_at = now()`);

async function connect(ownerId: string, email = "owner@gmail.test") {
  await saveGoogleClient(ownerId, {
    clientId: "1234567890-abcdefgh.apps.googleusercontent.com",
    clientSecret: "GOCSPX-the-secret",
  });
  oauth.exchangeCode.mockResolvedValueOnce({
    accessToken: "ya29.access",
    refreshToken: "1//refresh",
    expiresAt: inDays(1),
    scopes: [CALENDAR_READ],
    email,
  });
  await completeGoogleConnect(ownerId, "code", "verifier");
}

const stored = (ownerId: string) =>
  db.select().from(calendarEvents).where(eq(calendarEvents.ownerId, ownerId));
const connection = async (ownerId: string) =>
  (
    await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.ownerId, ownerId))
  )[0];
const titles = async (ownerId: string) =>
  (await stored(ownerId)).map((row) => row.title).sort();

describe("reading Google's answer", () => {
  const raw = {
    id: "evt1",
    summary: "  Kickoff with Maple  ",
    start: { dateTime: "2026-11-02T10:00:00+05:30", timeZone: "Asia/Kolkata" },
    end: { dateTime: "2026-11-02T11:00:00+05:30" },
    htmlLink: "https://www.google.com/calendar/event?eid=abc",
    hangoutLink: "https://meet.google.com/abc-defg-hij",
    attendees: [
      { email: "owner@gmail.test", self: true, responseStatus: "accepted" },
      { email: "Ava@Maple.test", displayName: "Ava", responseStatus: "tentative" },
      { email: "room@resource.calendar.google.com", resource: true },
    ],
    somethingNew: { ignored: true },
  };

  it("keeps a meeting's fields, without the owner or a room", () => {
    expect(parseEvent(raw)).toEqual({
      externalId: "evt1",
      meeting: {
        title: "Kickoff with Maple",
        location: null,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        htmlLink: "https://www.google.com/calendar/event?eid=abc",
        allDay: false,
        startsAt: new Date("2026-11-02T04:30:00Z"),
        endsAt: new Date("2026-11-02T05:30:00Z"),
        startsOn: null,
        endsOn: null,
        timezone: "Asia/Kolkata",
        attendees: [{ email: "ava@maple.test", name: "Ava", response: "tentative" }],
      },
    });
  });

  it("keeps an all-day event as dates", () => {
    expect(
      parseEvent({ id: "a", start: { date: "2026-11-02" }, end: { date: "2026-11-03" } })?.meeting,
    ).toMatchObject({
      title: "No title",
      allDay: true,
      startsAt: null,
      startsOn: "2026-11-02",
      endsOn: "2026-11-03",
    });
  });

  it("drops an address that isn't https or a calendar link that isn't Google's", () => {
    expect(
      parseEvent({
        ...raw,
        hangoutLink: "javascript:alert(1)",
        htmlLink: "https://evil.test/calendar",
      })?.meeting,
    ).toMatchObject({ meetingUrl: null, htmlLink: null });
    expect(
      parseEvent({
        ...raw,
        hangoutLink: undefined,
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+1" },
            { entryPointType: "video", uri: "https://zoom.test/j/1" },
          ],
        },
      })?.meeting?.meetingUrl,
    ).toBe("https://zoom.test/j/1");
  });

  it.each([
    ["cancelled", { id: "x", status: "cancelled" }],
    ["focus time", { ...raw, eventType: "focusTime" }],
    ["out of office", { ...raw, eventType: "outOfOffice" }],
    [
      "declined by the owner",
      { ...raw, attendees: [{ email: "o@x.test", self: true, responseStatus: "declined" }] },
    ],
  ])("treats %s as no meeting", (_label, item) => {
    expect(parseEvent(item)?.meeting).toBeNull();
  });

  it("skips what has no id", () => {
    expect(parseEvent({ summary: "No id" })).toBeNull();
  });
});

describe("syncing the calendar", () => {
  let ownerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    google.listEvents.mockReset();
    await resetDatabase();
    ownerId = await createTestOwner();
    await connect(ownerId);
  });

  it("stores the first read and its token, then applies changes and cancellations", async () => {
    google.listEvents.mockResolvedValueOnce(answer([event("a"), event("b")]));
    expect(await syncCalendar(ownerId)).toBe(true);
    expect(await titles(ownerId)).toEqual(["Meeting a", "Meeting b"]);
    const first = await connection(ownerId);
    expect(first.syncCursor).toBe("token-1");
    expect(first.lastSyncAt).toBeInstanceOf(Date);
    expect(first.lastFullSyncAt).toBeInstanceOf(Date);
    expect(google.listEvents.mock.calls[0][1]).toHaveProperty("timeMin");

    google.listEvents.mockResolvedValueOnce(
      answer([event("a", { title: "Renamed" }), gone("b")], { nextSyncToken: "token-2" }),
    );
    await syncCalendar(ownerId);
    expect(google.listEvents.mock.calls[1][1]).toEqual({ syncToken: "token-1" });
    expect(await titles(ownerId)).toEqual(["Renamed"]);
    expect((await connection(ownerId)).syncCursor).toBe("token-2");
  });

  it("reads every page, and saves the token only after the last", async () => {
    google.listEvents
      .mockResolvedValueOnce({ events: [event("a")], nextPageToken: "p2" })
      .mockRejectedValueOnce(new Error("network"));
    await expect(syncCalendar(ownerId)).rejects.toThrow("network");
    expect((await connection(ownerId)).syncCursor).toBeNull();

    google.listEvents
      .mockResolvedValueOnce({ events: [event("a")], nextPageToken: "p2" })
      .mockResolvedValueOnce(answer([event("b")]));
    await syncCalendar(ownerId);
    expect(google.listEvents.mock.lastCall?.[2]).toBe("p2");
    expect(await titles(ownerId)).toEqual(["Meeting a", "Meeting b"]);
  });

  it("starts again when Google has dropped the token", async () => {
    google.listEvents.mockResolvedValueOnce(answer([event("a")]));
    await syncCalendar(ownerId);

    google.listEvents
      .mockRejectedValueOnce(new SyncTokenExpiredError())
      .mockResolvedValueOnce(answer([event("c")], { nextSyncToken: "fresh" }));
    await syncCalendar(ownerId);
    expect(await titles(ownerId)).toEqual(["Meeting c"]);
    expect((await connection(ownerId)).syncCursor).toBe("fresh");
  });

  it("a daily full read removes what's gone inside the window and keeps older history", async () => {
    google.listEvents.mockResolvedValueOnce(
      answer([
        event("old", { startsAt: inDays(-60), endsAt: inDays(-60) }),
        event("past", { startsAt: inDays(-5), endsAt: inDays(-5) }),
        event("soon"),
      ]),
    );
    await syncCalendar(ownerId);

    await db
      .update(integrationConnections)
      .set({ lastFullSyncAt: inDays(-2) })
      .where(eq(integrationConnections.ownerId, ownerId));
    google.listEvents.mockResolvedValueOnce(answer([event("soon")]));
    await syncCalendar(ownerId);
    expect(google.listEvents.mock.calls[1][1]).toHaveProperty("timeMin");
    expect(await titles(ownerId)).toEqual(["Meeting old", "Meeting soon"]);
  });

  it("drops a meeting moved past the window", async () => {
    google.listEvents.mockResolvedValueOnce(answer([event("a")]));
    await syncCalendar(ownerId);
    google.listEvents.mockResolvedValueOnce(
      answer([event("a", { startsAt: inDays(200), endsAt: inDays(200) })]),
    );
    await syncCalendar(ownerId);
    expect(await titles(ownerId)).toEqual([]);
  });

  it("stores an all-day meeting by its dates", async () => {
    google.listEvents.mockResolvedValueOnce(
      answer([
        event("day", {
          allDay: true,
          startsAt: null,
          endsAt: null,
          startsOn: "2026-11-02",
          endsOn: "2026-11-03",
        }),
      ]),
    );
    await syncCalendar(ownerId);
    expect((await stored(ownerId))[0]).toMatchObject({
      allDay: true,
      startsAt: null,
      startsOn: "2026-11-02",
    });
  });

  it("a disconnect during a sync brings nothing back", async () => {
    google.listEvents.mockImplementationOnce(async () => {
      await disconnectGoogle(ownerId);
      return answer([event("late")]);
    });
    await syncCalendar(ownerId);
    expect(await stored(ownerId)).toEqual([]);
    expect((await connection(ownerId)).syncCursor).toBeNull();
  });

  it("asks for a new token when Google turns one down, and syncs", async () => {
    oauth.refreshAccess.mockResolvedValueOnce({
      accessToken: "ya29.fresh",
      expiresAt: inDays(1),
      scopes: [CALENDAR_READ],
    });
    google.listEvents
      .mockRejectedValueOnce(new GoogleApiError(401))
      .mockResolvedValueOnce(answer([event("a")]));
    await syncCalendar(ownerId);
    expect(google.listEvents.mock.lastCall?.[0]).toBe("ya29.fresh");
    expect(await titles(ownerId)).toEqual(["Meeting a"]);
    expect((await connection(ownerId)).lastError).toBeNull();
  });

  it("says so when Google turns down the new token too, and asks only once", async () => {
    oauth.refreshAccess.mockResolvedValueOnce({
      accessToken: "ya29.fresh",
      expiresAt: inDays(1),
      scopes: [CALENDAR_READ],
    });
    google.listEvents
      .mockRejectedValueOnce(new GoogleApiError(401))
      .mockRejectedValueOnce(new GoogleApiError(401));
    await expect(syncCalendar(ownerId)).rejects.toThrow("401");
    expect(oauth.refreshAccess).toHaveBeenCalledTimes(1);
    const row = await connection(ownerId);
    expect(row.status).toBe("connected");
    expect(row.lastError).toBe(
      "Google didn't accept this connection's access. Press Test connection, or disconnect and connect again.",
    );
  });

  it("says what went wrong in its own words, and tries again", async () => {
    google.listEvents.mockRejectedValueOnce(new GoogleApiError(403));
    await expect(syncCalendar(ownerId)).rejects.toThrow();
    expect((await connection(ownerId)).lastError).toBe(
      "Google refused to show your calendar. Check that the Google Calendar API is enabled in your Google Cloud project.",
    );
    google.listEvents.mockResolvedValueOnce(answer([]));
    await syncCalendar(ownerId);
    expect((await connection(ownerId)).lastError).toBeNull();
  });

  describe("linking meetings to records", () => {
    const links = () => db.select().from(calendarEventContacts);
    const meetingWith = (...emails: string[]) =>
      answer([event("a", { attendees: emails.map(attendee) })]);

    it("matches a person's email, whatever its case, and takes their company", async () => {
      const companyId = await company(ownerId, "Maple Studio");
      const personId = await person(ownerId, "Ava", "ava@maple.test", companyId);
      google.listEvents.mockResolvedValueOnce(meetingWith("nobody@else.test", "AVA@maple.test"));
      await syncCalendar(ownerId);
      const [row] = await stored(ownerId);
      expect(row.organizationId).toBe(companyId);
      expect(await links()).toEqual([{ eventId: row.id, contactId: personId, ownerId }]);
      expect(await calendarSummary(ownerId)).toEqual({ kept: 1, linked: 1 });
    });

    it("takes the company from the domain when no person matches, but not free mail", async () => {
      const companyId = await company(ownerId, "Birch Works", "birch.test");
      await company(ownerId, "Gmail", "gmail.com");
      google.listEvents.mockResolvedValueOnce(meetingWith("x@gmail.com", "y@birch.test"));
      await syncCalendar(ownerId);
      expect((await stored(ownerId))[0].organizationId).toBe(companyId);

      google.listEvents.mockResolvedValueOnce(
        answer([event("a", { attendees: [attendee("x@gmail.com")] })]),
      );
      await syncCalendar(ownerId);
      expect((await stored(ownerId))[0].organizationId).toBeNull();
      expect(await calendarSummary(ownerId)).toEqual({ kept: 1, linked: 0 });
    });

    it("links a person added later on the next sync, and lets go of one deleted", async () => {
      google.listEvents.mockResolvedValueOnce(meetingWith("ava@maple.test"));
      await syncCalendar(ownerId);
      expect(await links()).toEqual([]);

      const personId = await person(ownerId, "Ava", "ava@maple.test");
      google.listEvents.mockResolvedValueOnce(answer([]));
      await syncCalendar(ownerId);
      expect((await links()).map((link) => link.contactId)).toEqual([personId]);

      await deleteContact(ownerId, personId);
      expect(await links()).toEqual([]);
    });

    it("never links to another owner's person", async () => {
      const otherId = await createTestOwner("other@example.com");
      await person(otherId, "Ava", "ava@maple.test");
      google.listEvents.mockResolvedValueOnce(meetingWith("ava@maple.test"));
      await syncCalendar(ownerId);
      expect(await links()).toEqual([]);
    });

    it("merging two people moves the links to the one kept", async () => {
      const keep = await person(ownerId, "Ava", "ava@maple.test");
      const other = await person(ownerId, "Ava S", "ava.s@maple.test");
      google.listEvents.mockResolvedValueOnce(meetingWith("ava@maple.test", "ava.s@maple.test"));
      await syncCalendar(ownerId);
      expect(await links()).toHaveLength(2);

      const merged = await mergeContacts(ownerId, {
        keep,
        other,
        picks: {},
        custom: {},
      } as Parameters<typeof mergeContacts>[1]);
      expect(merged.ok).toBe(true);
      expect((await links()).map((link) => link.contactId)).toEqual([keep]);
    });

    it("merging two companies moves the meeting to the one kept", async () => {
      const keep = await company(ownerId, "Birch Works");
      const other = await company(ownerId, "Birch Works Ltd", "birch.test");
      await settleReads();
      google.listEvents.mockResolvedValueOnce(meetingWith("y@birch.test"));
      await syncCalendar(ownerId);
      expect((await stored(ownerId))[0].organizationId).toBe(other);

      const merged = await mergeOrganizations(ownerId, { keep, other, picks: {}, custom: {} });
      expect(merged.ok).toBe(true);
      expect((await stored(ownerId))[0].organizationId).toBe(keep);
    });
  });
});

describe("what a connection's changes do to meetings", () => {
  let ownerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    google.listEvents.mockReset();
    await resetDatabase();
    ownerId = await createTestOwner();
    await connect(ownerId);
    google.listEvents.mockResolvedValueOnce(answer([event("a")]));
    await syncCalendar(ownerId);
  });

  it("disconnecting deletes them and says how many in the audit log", async () => {
    await disconnectGoogle(ownerId);
    expect(await stored(ownerId)).toEqual([]);
    const { rows } = await listAudit(ownerId);
    expect(rows.find((row) => row.action === "integration.disconnect")?.before).toMatchObject({
      meetingsRemoved: 1,
    });
  });

  it("another account deletes them; the same account keeps them", async () => {
    oauth.exchangeCode.mockResolvedValueOnce({
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      expiresAt: inDays(1),
      scopes: [CALENDAR_READ],
      email: "owner@gmail.test",
    });
    await completeGoogleConnect(ownerId, "code", "verifier");
    expect(await stored(ownerId)).toHaveLength(1);

    oauth.exchangeCode.mockResolvedValueOnce({
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      expiresAt: inDays(1),
      scopes: [CALENDAR_READ],
      email: "second@gmail.test",
    });
    await completeGoogleConnect(ownerId, "code", "verifier");
    expect(await stored(ownerId)).toEqual([]);
  });

  it("an expired connection keeps them, and is left out of the sync", async () => {
    await db
      .update(integrationConnections)
      .set({ status: "expired" })
      .where(eq(integrationConnections.ownerId, ownerId));
    expect(await syncCalendar(ownerId)).toBe(false);
    expect(await stored(ownerId)).toHaveLength(1);
    await enqueueCalendarSyncs();
    expect(await db.select().from(jobs).where(eq(jobs.kind, "calendar.sync"))).toEqual([]);
  });

  it("queues one sync per connected owner", async () => {
    await enqueueCalendarSyncs();
    await enqueueCalendarSyncs();
    expect(await db.select().from(jobs).where(eq(jobs.kind, "calendar.sync"))).toHaveLength(1);
  });

  it("never touches another owner's meetings", async () => {
    const otherId = await createTestOwner("other@example.com");
    await connect(otherId, "other@gmail.test");
    google.listEvents.mockResolvedValueOnce(answer([event("theirs")]));
    await syncCalendar(otherId);
    await disconnectGoogle(ownerId);
    expect(await titles(otherId)).toEqual(["Meeting theirs"]);
  });

  it("Sync now reaches Google once a minute", async () => {
    google.listEvents.mockResolvedValueOnce(answer([event("a"), event("b")]));
    expect(await syncCalendarNow(ownerId)).toEqual({
      ok: true,
      message: "Synced. 2 meetings kept.",
    });
    const calls = google.listEvents.mock.calls.length;
    expect(await syncCalendarNow(ownerId)).toEqual({
      ok: false,
      message: "Synced a moment ago.",
    });
    expect(google.listEvents.mock.calls.length).toBe(calls);
  });

  it("Sync now says when Google can't be reached", async () => {
    google.listEvents.mockRejectedValueOnce(new Error("network"));
    expect(await syncCalendarNow(ownerId)).toEqual({
      ok: false,
      message: "Google could not be reached on the last try.",
    });
  });
});
