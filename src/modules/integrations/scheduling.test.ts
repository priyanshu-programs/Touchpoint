import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import {
  auditLog,
  calendarEventContacts,
  calendarEvents,
  integrationConnections,
} from "@/db/schema";
import type { ListedEvent } from "@/integrations/google/calendar";
import {
  CALENDAR_READ,
  CALENDAR_WRITE,
  GoogleApiError,
  GrantRevokedError,
} from "@/integrations/google/oauth";
import { toLocalInput } from "@/lib/time";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { ownerTimezone } from "@/modules/settings/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { syncCalendar } from "./calendar";
import { meetingInput, MEETINGS_PER_HOUR } from "./schema";
import {
  checkMeeting,
  firstInvitee,
  meetingSummary,
  scheduleMeeting,
  schedulingState,
} from "./scheduling";
import {
  completeGoogleConnect,
  disconnectGoogle,
  saveGoogleClient,
  startGoogleConnect,
} from "./service";

const google = vi.hoisted(() => ({ insertEvent: vi.fn(), listEvents: vi.fn() }));
vi.mock("@/integrations/google/calendar", async (actual) => ({
  ...(await actual<typeof import("@/integrations/google/calendar")>()),
  ...google,
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KEY = "0190a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b";
const EXTERNAL = "0190a1b2c3d44e5f8a9b0c1d2e3f4a5b";

async function connect(ownerId: string, scopes = [CALENDAR_READ, CALENDAR_WRITE]) {
  await saveGoogleClient(ownerId, {
    clientId: "1234567890-abcdefgh.apps.googleusercontent.com",
    clientSecret: "GOCSPX-the-secret",
  });
  oauth.exchangeCode.mockResolvedValueOnce({
    accessToken: "ya29.access",
    refreshToken: "1//refresh",
    expiresAt: new Date(Date.now() + DAY),
    scopes,
    email: "owner@gmail.test",
  });
  return completeGoogleConnect(ownerId, "code", "verifier");
}

async function person(ownerId: string, firstName: string, email: string) {
  const result = await createContact(
    ownerId,
    newContactInput.parse({
      firstName,
      lastName: "Rao",
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
      organizationId: "",
    }),
    { confirmSimilar: true },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

const madeAtGoogle = (email: string, overrides = {}): ListedEvent => ({
  externalId: EXTERNAL,
  meeting: {
    title: "Intro call",
    location: null,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    htmlLink: "https://www.google.com/calendar/event?eid=abc",
    allDay: false,
    startsAt: new Date(Date.now() + DAY),
    endsAt: new Date(Date.now() + DAY + HOUR / 2),
    startsOn: null,
    endsOn: null,
    timezone: "UTC",
    attendees: [{ email, name: "Asha Rao", response: "needsAction" }],
    ...overrides,
  },
});

describe("scheduling a meeting", () => {
  let ownerId: string;
  let asha: string;
  let timezone: string;

  const form = (overrides: Record<string, unknown> = {}) => {
    const starts = Date.now() + DAY;
    return meetingInput.parse({
      key: KEY,
      title: "Intro call",
      startsAt: toLocalInput(new Date(starts), timezone),
      endsAt: toLocalInput(new Date(starts + HOUR / 2), timezone),
      location: "",
      notes: "A private note for the invitation",
      contactIds: [asha],
      emailGuests: "yes",
      addMeet: "yes",
      ...overrides,
    });
  };
  const copies = () => db.select().from(calendarEvents).where(eq(calendarEvents.ownerId, ownerId));
  const scheduledAudits = () =>
    db.select().from(auditLog).where(eq(auditLog.action, "meeting.schedule"));

  beforeEach(async () => {
    vi.clearAllMocks();
    google.insertEvent.mockReset();
    oauth.refreshAccess.mockReset();
    await resetDatabase();
    ownerId = await createTestOwner();
    timezone = await ownerTimezone(db, ownerId);
    asha = await person(ownerId, "Asha", "asha@maple.test");
    await connect(ownerId);
  });

  describe("the state pages ask for", () => {
    it("is ready, needs permission, or off", async () => {
      expect(await schedulingState(ownerId)).toBe("ready");

      await db
        .update(integrationConnections)
        .set({ scopes: [CALENDAR_READ] })
        .where(eq(integrationConnections.ownerId, ownerId));
      expect(await schedulingState(ownerId)).toBe("needs_permission");

      await db
        .update(integrationConnections)
        .set({ status: "expired" })
        .where(eq(integrationConnections.ownerId, ownerId));
      expect(await schedulingState(ownerId)).toBe("off");

      expect(await schedulingState(await createTestOwner("other@example.com"))).toBe("off");
    });
  });

  describe("asking Google for the permission", () => {
    it("asks for reading alone, or for reading and adding", async () => {
      const read = await startGoogleConnect(ownerId);
      expect(read?.url.searchParams.get("scope")).toBe(`openid email ${CALENDAR_READ}`);

      const both = await startGoogleConnect(ownerId, { scheduling: true });
      expect(both?.url.searchParams.get("scope")).toBe(
        `openid email ${CALENDAR_READ} ${CALENDAR_WRITE}`,
      );
    });

    it("says whether it was granted, and keeps reading and the grant when it wasn't", async () => {
      expect(await connect(ownerId, [CALENDAR_READ, CALENDAR_WRITE])).toEqual({
        ok: true,
        canSchedule: true,
      });
      expect(await connect(ownerId, [CALENDAR_READ])).toEqual({ ok: true, canSchedule: false });
      expect(oauth.revokeGrant).not.toHaveBeenCalled();
      expect(await schedulingState(ownerId)).toBe("needs_permission");
    });
  });

  describe("checking", () => {
    const refusal = async (input: ReturnType<typeof form>) => {
      const checked = await checkMeeting(ownerId, input);
      return checked.ok ? null : checked.message;
    };

    it("says what Google will do and calls nothing", async () => {
      const checked = await checkMeeting(ownerId, form());
      expect(checked.ok).toBe(true);
      if (!checked.ok) return;
      expect(checked.summary).toContain('"Intro call"');
      expect(checked.summary).toContain("owner@gmail.test");
      expect(checked.summary).toContain("Asha Rao (asha@maple.test)");
      expect(google.insertEvent).not.toHaveBeenCalled();
    });

    it("refuses an end before the start, a past start and one past 90 days", async () => {
      const at = (ms: number) => toLocalInput(new Date(ms), timezone);
      const now = Date.now();
      expect(
        await refusal(form({ startsAt: at(now + DAY), endsAt: at(now + DAY - HOUR) })),
      ).toBe("A meeting has to end after it starts.");
      expect(
        await refusal(form({ startsAt: at(now - HOUR), endsAt: at(now) })),
      ).toBe("That start time has already passed.");
      expect(
        await refusal(form({ startsAt: at(now + 91 * DAY), endsAt: at(now + 92 * DAY) })),
      ).toBe(
        "Touchpoint can schedule up to 90 days ahead. For a later meeting, use Google Calendar.",
      );
    });

    it("refuses someone with no email and someone who isn't the owner's", async () => {
      const other = await createTestOwner("other@example.com");
      const stranger = await person(other, "Ravi", "ravi@elsewhere.test");
      expect(await refusal(form({ contactIds: [stranger] }))).toBe("Choose people from the list.");

      const { contactEmails } = await import("@/db/schema");
      await db.delete(contactEmails).where(eq(contactEmails.contactId, asha));
      expect(await refusal(form())).toBe(
        "Asha Rao has no email address, so Google can't invite them. Add one, or take them off.",
      );
    });

    it("refuses without the connection or the permission", async () => {
      await db
        .update(integrationConnections)
        .set({ scopes: [CALENDAR_READ] })
        .where(eq(integrationConnections.ownerId, ownerId));
      expect(await refusal(form())).toBe("Allow scheduling in Settings first.");

      await db
        .update(integrationConnections)
        .set({ status: "expired" })
        .where(eq(integrationConnections.ownerId, ownerId));
      expect(await refusal(form())).toBe("Connect Google Calendar in Settings first.");
    });

    it(`takes at most ${MEETINGS_PER_HOUR} an hour`, async () => {
      await db.insert(auditLog).values(
        Array.from({ length: MEETINGS_PER_HOUR }, () => ({
          ownerId,
          actor: "user",
          action: "meeting.schedule",
          entityType: "calendar_event",
        })),
      );
      expect(await refusal(form())).toContain(`at most ${MEETINGS_PER_HOUR} meetings an hour`);
    });
  });

  describe("the sentence", () => {
    const meeting = {
      accountEmail: "owner@gmail.test",
      timezone: "Asia/Kolkata",
      startsAt: new Date("2030-03-04T04:30:00Z"),
      endsAt: new Date("2030-03-04T05:00:00Z"),
      guests: [
        { name: "Asha Rao", email: "asha@maple.test" },
        { name: "Ravi Iyer", email: "ravi@maple.test" },
      ],
    };

    it("names the time in the owner's zone, the Meet link and who is emailed", () => {
      expect(
        meetingSummary({ title: "Intro call", emailGuests: true, addMeet: true }, meeting),
      ).toBe(
        'Google will add "Intro call" to your calendar (owner@gmail.test) on 4 Mar 2030, 10:00 to 10:30, with a Google Meet link. It will email an invitation to Asha Rao (asha@maple.test) and Ravi Iyer (ravi@maple.test).',
      );
    });

    it("says when nobody is emailed", () => {
      expect(
        meetingSummary({ title: "Intro call", emailGuests: false, addMeet: false }, meeting),
      ).toBe(
        'Google will add "Intro call" to your calendar (owner@gmail.test) on 4 Mar 2030, 10:00 to 10:30. It will list Asha Rao (asha@maple.test) and Ravi Iyer (ravi@maple.test) as invited and email nobody.',
      );
    });
  });

  describe("scheduling", () => {
    it("stores the meeting from Google's answer, linked to the person", async () => {
      google.insertEvent.mockResolvedValueOnce({
        created: true,
        event: madeAtGoogle("asha@maple.test"),
      });

      const result = await scheduleMeeting(ownerId, form());
      expect(result).toMatchObject({ ok: true, meetingId: expect.any(String) });

      const [, sent] = google.insertEvent.mock.calls[0];
      expect(sent).toMatchObject({
        key: KEY,
        title: "Intro call",
        guests: [{ email: "asha@maple.test", name: "Asha Rao" }],
        emailGuests: true,
        addMeet: true,
      });
      const [copy] = await copies();
      expect(copy.externalId).toBe(EXTERNAL);
      expect(copy.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
      expect(
        await db
          .select({ contactId: calendarEventContacts.contactId })
          .from(calendarEventContacts)
          .where(eq(calendarEventContacts.eventId, copy.id)),
      ).toEqual([{ contactId: asha }]);
    });

    it("audits who was invited and never the notes", async () => {
      google.insertEvent.mockResolvedValueOnce({
        created: true,
        event: madeAtGoogle("asha@maple.test"),
      });
      await scheduleMeeting(ownerId, form());

      const [row] = await scheduledAudits();
      expect(row.after).toMatchObject({
        externalId: EXTERNAL,
        title: "Intro call",
        guests: ["asha@maple.test"],
        emailGuests: true,
        addMeet: true,
      });
      expect(JSON.stringify(row.after)).not.toContain("private note");
    });

    it("stores nothing unless Google gave an id, and says what is known", async () => {
      const cases: [unknown, string][] = [
        [new DOMException("timed out", "TimeoutError"), "can't say whether the meeting was made"],
        [new GoogleApiError(500), "can't say whether the meeting was made"],
        [new GoogleApiError(403), "Check Allow scheduling"],
        [new GoogleApiError(400), "so nothing was added"],
      ];
      for (const [error, words] of cases) {
        google.insertEvent.mockRejectedValueOnce(error);
        const result = await scheduleMeeting(ownerId, form());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain(words);
      }
      expect(await copies()).toEqual([]);
      expect(await scheduledAudits()).toEqual([]);
    });

    it("asks for a new token once when Google answers 401, with the same key", async () => {
      oauth.refreshAccess.mockResolvedValueOnce({
        accessToken: "ya29.fresh",
        expiresAt: new Date(Date.now() + DAY),
        scopes: [],
      });
      google.insertEvent
        .mockRejectedValueOnce(new GoogleApiError(401))
        .mockResolvedValueOnce({ created: true, event: madeAtGoogle("asha@maple.test") });

      expect((await scheduleMeeting(ownerId, form())).ok).toBe(true);
      expect(google.insertEvent).toHaveBeenCalledTimes(2);
      expect(google.insertEvent.mock.calls[1][0]).toBe("ya29.fresh");
      expect(google.insertEvent.mock.calls[1][1].key).toBe(KEY);
    });

    it("says to reconnect when Google has taken the access back", async () => {
      await db
        .update(integrationConnections)
        .set({ accessExpiresAt: new Date(0) })
        .where(eq(integrationConnections.ownerId, ownerId));
      oauth.refreshAccess.mockRejectedValueOnce(new GrantRevokedError(null));

      const result = await scheduleMeeting(ownerId, form());
      expect(result).toEqual({
        ok: false,
        message: "Google no longer accepts this connection. Reconnect in Settings to go on.",
      });
      expect(google.insertEvent).not.toHaveBeenCalled();
    });

    it("keeps one copy when the same form is sent again", async () => {
      google.insertEvent
        .mockResolvedValueOnce({ created: true, event: madeAtGoogle("asha@maple.test") })
        .mockResolvedValueOnce({ created: false, event: madeAtGoogle("asha@maple.test") });

      const first = await scheduleMeeting(ownerId, form());
      const second = await scheduleMeeting(ownerId, form());
      expect(first).toEqual(second);
      expect(await copies()).toHaveLength(1);
    });

    it("says so when the same form's meeting has been deleted at Google", async () => {
      google.insertEvent.mockResolvedValueOnce({
        created: false,
        event: { externalId: EXTERNAL, meeting: null },
      });
      expect(await scheduleMeeting(ownerId, form())).toEqual({
        ok: false,
        message: "That meeting was removed at Google. Open the form again to make a new one.",
      });
      expect(await copies()).toEqual([]);
    });

    it("leaves one copy after the next sync reads the same event", async () => {
      google.insertEvent.mockResolvedValueOnce({
        created: true,
        event: madeAtGoogle("asha@maple.test"),
      });
      await scheduleMeeting(ownerId, form());
      const [before] = await copies();

      google.listEvents.mockResolvedValueOnce({
        events: [madeAtGoogle("asha@maple.test", { title: "Renamed at Google" })],
        nextSyncToken: "token-1",
      });
      await syncCalendar(ownerId);

      const after = await copies();
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before.id);
      expect(after[0].title).toBe("Renamed at Google");
    });

    it("keeps no copy if Google was disconnected during the call, and says so", async () => {
      google.insertEvent.mockImplementationOnce(async () => {
        await disconnectGoogle(ownerId);
        return { created: true, event: madeAtGoogle("asha@maple.test") };
      });
      const result = await scheduleMeeting(ownerId, form());
      expect(result).toMatchObject({ ok: true, meetingId: null });
      expect(await copies()).toEqual([]);
      expect(await scheduledAudits()).toHaveLength(1);
    });

    it("never reaches Google for someone else's person", async () => {
      const other = await createTestOwner("other@example.com");
      const stranger = await person(other, "Ravi", "ravi@elsewhere.test");
      expect(await scheduleMeeting(ownerId, form({ contactIds: [stranger] }))).toEqual({
        ok: false,
        message: "Choose people from the list.",
      });
      expect(google.insertEvent).not.toHaveBeenCalled();
    });
  });

  describe("firstInvitee", () => {
    it("is nobody at a company no one with an email is at", async () => {
      const { organizationInput } = await import("@/modules/organizations/schema");
      const { createOrganization } = await import("@/modules/organizations/service");
      const created = await createOrganization(
        ownerId,
        organizationInput.parse({
          name: "Maple Studio",
          domain: "",
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
      if (!created.ok) throw new Error(created.reason);
      expect(await firstInvitee(ownerId, created.id)).toBeNull();
    });
  });
});

describe("the meeting form's own rules", () => {
  const valid = {
    key: KEY,
    title: "Intro call",
    startsAt: "2030-03-04T10:00",
    endsAt: "2030-03-04T10:30",
    location: "",
    notes: "",
    contactIds: [KEY],
    emailGuests: "yes",
    addMeet: "",
  };
  const message = (input: unknown) => meetingInput.safeParse(input).error?.issues[0].message;

  it("reads the boxes", () => {
    expect(meetingInput.parse(valid)).toMatchObject({ emailGuests: true, addMeet: false });
  });

  it("refuses a blank title, nobody invited, a bad time and unknown fields", () => {
    expect(message({ ...valid, title: "  " })).toBe("Give the meeting a title.");
    expect(message({ ...valid, contactIds: [] })).toBe("Choose at least one person to invite.");
    expect(message({ ...valid, startsAt: "soon" })).toBe("Choose when the meeting starts.");
    expect(meetingInput.safeParse({ ...valid, calendar: "other" }).success).toBe(false);
    expect(meetingInput.safeParse({ ...valid, emailGuests: "maybe" }).success).toBe(false);
    expect(meetingInput.safeParse({ ...valid, key: "1" }).success).toBe(false);
  });
});
