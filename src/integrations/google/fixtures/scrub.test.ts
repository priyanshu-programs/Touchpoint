import { describe, expect, it } from "vitest";
import { parseEvent } from "../calendar";
import { makeScrubber } from "./scrub";

const recorded = {
  kind: "calendar#event",
  id: "abc123secretid",
  etag: '"3421"',
  status: "confirmed",
  eventType: "default",
  summary: "Salary talk with Priya Sharma",
  description: "Private notes about Priya",
  location: "12 Hidden Lane, Mumbai",
  htmlLink: "https://www.google.com/calendar/event?eid=PRIVATEEID",
  hangoutLink: "https://meet.google.com/priv-atel-ink",
  iCalUID: "abc123secretid@google.com",
  created: "2026-10-30T09:00:00.000Z",
  start: { dateTime: "2026-10-31T10:00:00+05:30", timeZone: "Asia/Kolkata" },
  end: { dateTime: "2026-10-31T10:30:00+05:30", timeZone: "Asia/Kolkata" },
  creator: { email: "priya@private.example", self: true },
  organizer: { email: "priya@private.example", displayName: "Priya Sharma" },
  attendees: [
    {
      email: "client@secret-company.example",
      displayName: "Rahul Client",
      responseStatus: "accepted",
    },
  ],
  conferenceData: {
    entryPoints: [
      { entryPointType: "video", uri: "https://meet.google.com/priv-atel-ink", pin: "998877" },
    ],
    conferenceId: "priv-atel-ink",
  },
  extendedProperties: { private: { anything: "a surprise field Google adds later" } },
};

describe("makeScrubber", () => {
  it("lets nothing personal through, including fields it has never heard of", () => {
    const text = JSON.stringify(makeScrubber()(recorded));
    for (const secret of [
      "abc123secretid",
      "Salary",
      "Priya",
      "Hidden Lane",
      "PRIVATEEID",
      "priv-atel-ink",
      "private.example",
      "secret-company",
      "Rahul",
      "998877",
      "a surprise field",
      "2026-",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("keeps the shape the app reads", () => {
    const scrubbed = makeScrubber()(recorded);
    const parsed = parseEvent(scrubbed);
    expect(parsed?.meeting).toMatchObject({
      allDay: false,
      timezone: "Asia/Kolkata",
      attendees: [{ email: expect.stringMatching(/@example\.test$/), response: "accepted" }],
    });
    expect(parsed?.meeting?.htmlLink).toMatch(/^https:\/\/www\.google\.com\//);
    expect(parsed?.meeting?.meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(parsed?.meeting?.startsAt?.getUTCFullYear()).toBe(2030);
  });

  it("gives one value one stand-in, and keeps the length of a meeting", () => {
    const scrubbed = makeScrubber()(recorded) as typeof recorded;
    expect(scrubbed.creator.email).toBe(scrubbed.organizer.email);
    expect(
      new Date(scrubbed.end.dateTime).getTime() - new Date(scrubbed.start.dateTime).getTime(),
    ).toBe(30 * 60_000);
  });

  it("moves a date with no time, and replaces a host outside Google", () => {
    const scrub = makeScrubber();
    const scrubbed = scrub({
      start: { date: "2026-11-02" },
      hangoutLink: "https://zoom.example/j/123",
    }) as { start: { date: string }; hangoutLink: string };
    expect(scrubbed.start.date).toMatch(/^2030-/);
    expect(scrubbed.hangoutLink).toMatch(/^https:\/\/example\.test\/redacted-\d+$/);
  });
});
