import { afterEach, describe, expect, it, vi } from "vitest";
import { insertEvent, type NewEvent } from "./calendar";
import { GoogleApiError } from "./oauth";

const KEY = "0190a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b";
const ID = "0190a1b2c3d44e5f8a9b0c1d2e3f4a5b";

const event: NewEvent = {
  key: KEY,
  title: "Intro call",
  startsAt: new Date("2030-03-04T10:00:00Z"),
  endsAt: new Date("2030-03-04T10:30:00Z"),
  timezone: "Asia/Kolkata",
  guests: [{ email: "asha@maple.test", name: "Asha Rao" }],
  location: null,
  notes: null,
  emailGuests: true,
  addMeet: true,
};

const fromGoogle = {
  id: ID,
  status: "confirmed",
  summary: "Intro call",
  htmlLink: "https://www.google.com/calendar/event?eid=abc",
  hangoutLink: "https://meet.google.com/abc-defg-hij",
  start: { dateTime: "2030-03-04T10:00:00Z", timeZone: "Asia/Kolkata" },
  end: { dateTime: "2030-03-04T10:30:00Z", timeZone: "Asia/Kolkata" },
  attendees: [{ email: "asha@maple.test", displayName: "Asha Rao" }],
};

const answer = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

function stubFetch(...answers: Response[]) {
  const stub = vi.fn<typeof fetch>();
  for (const next of answers) stub.mockResolvedValueOnce(next);
  vi.stubGlobal("fetch", stub);
  return stub;
}

const sent = (stub: ReturnType<typeof stubFetch>, call = 0) => {
  const [url, init] = stub.mock.calls[call];
  return {
    url: new URL(String(url)),
    init: init!,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("insertEvent", () => {
  it("posts to the primary calendar with the form's key as the event's id", async () => {
    const stub = stubFetch(answer(200, fromGoogle));
    const result = await insertEvent("token", event);

    const { url, init, body } = sent(stub);
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token");
    expect(body).toMatchObject({
      id: ID,
      summary: "Intro call",
      start: { dateTime: "2030-03-04T10:00:00.000Z", timeZone: "Asia/Kolkata" },
      attendees: [{ email: "asha@maple.test", displayName: "Asha Rao" }],
    });
    expect(result.created).toBe(true);
    expect(result.event.externalId).toBe(ID);
    expect(result.event.meeting?.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("asks Google to email the guests and make a Meet link only when told to", async () => {
    let stub = stubFetch(answer(200, fromGoogle));
    await insertEvent("token", event);
    let call = sent(stub);
    expect(call.url.searchParams.get("sendUpdates")).toBe("all");
    expect(call.url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(call.body?.conferenceData).toEqual({
      createRequest: { requestId: ID, conferenceSolutionKey: { type: "hangoutsMeet" } },
    });

    stub = stubFetch(answer(200, fromGoogle));
    await insertEvent("token", { ...event, emailGuests: false, addMeet: false });
    call = sent(stub);
    expect(call.url.searchParams.get("sendUpdates")).toBe("none");
    expect(call.url.searchParams.has("conferenceDataVersion")).toBe(false);
    expect(call.body).not.toHaveProperty("conferenceData");
  });

  it("sends a location and notes only when there are some", async () => {
    let stub = stubFetch(answer(200, fromGoogle));
    await insertEvent("token", event);
    expect(sent(stub).body).not.toHaveProperty("location");
    expect(sent(stub).body).not.toHaveProperty("description");

    stub = stubFetch(answer(200, fromGoogle));
    await insertEvent("token", { ...event, location: "Maple office", notes: "Bring the deck" });
    expect(sent(stub).body).toMatchObject({
      location: "Maple office",
      description: "Bring the deck",
    });
  });

  it("reads the existing event when the same form got through before", async () => {
    const stub = stubFetch(answer(409), answer(200, fromGoogle));
    const result = await insertEvent("token", event);

    expect(stub).toHaveBeenCalledTimes(2);
    const { url, init } = sent(stub, 1);
    expect(url.pathname.endsWith(`/events/${ID}`)).toBe(true);
    expect(init.method).toBeUndefined();
    expect(result.created).toBe(false);
    expect(result.event.meeting?.title).toBe("Intro call");
  });

  it("says when that event has since been deleted at Google", async () => {
    stubFetch(answer(409), answer(200, { ...fromGoogle, status: "cancelled" }));
    const result = await insertEvent("token", event);
    expect(result.created).toBe(false);
    expect(result.event.meeting).toBeNull();
  });

  it.each([401, 403, 500])("throws what Google answers: %i", async (status) => {
    stubFetch(answer(status));
    const failure = await insertEvent("token", event).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).status).toBe(status);
  });

  it("lets a timeout through for the caller to report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );
    await expect(insertEvent("token", event)).rejects.toThrow("timed out");
  });
});
