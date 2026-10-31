// Records Google's real answers into src/integrations/google/fixtures, scrubbed. Run once by
// the owner against the local connection: `corepack pnpm fixtures:google`.
//
// It reads the calendar and makes one guest-free test event, which it deletes again. It never
// writes an unscrubbed answer to disk and never prints a token.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { CALENDAR_WRITE } from "@/integrations/google/oauth";
import { makeScrubber } from "@/integrations/google/fixtures/scrub";
import { googleAccessToken } from "@/modules/integrations/service";

const FOLDER = "src/integrations/google/fixtures";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary";
const EVENTS = `${CALENDAR}/events`;
const DAY = 24 * 60 * 60_000;

type Raw = Record<string, unknown> & {
  status?: string;
  eventType?: string;
  summary?: string;
  start?: { date?: string };
  hangoutLink?: string;
  conferenceData?: unknown;
  recurringEventId?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const declined = (event: Raw) =>
  Boolean(event.attendees?.some(({ self, responseStatus }) => self && responseStatus === "declined"));
// A meeting the app keeps, so a kind below is about one thing only.
const kept = (event: Raw) =>
  event.status !== "cancelled" &&
  (event.eventType ?? "default") === "default" &&
  !declined(event);

// The first event of each kind the tests name. A kind the calendar lacks stays documented.
const KINDS: Record<string, (event: Raw) => boolean> = {
  cancelled: (event) => event.status === "cancelled",
  declined: (event) => event.status !== "cancelled" && declined(event),
  focusTime: (event) => event.status !== "cancelled" && !kept(event) && !declined(event),
  allDay: (event) => kept(event) && Boolean(event.start?.date),
  recurringInstance: (event) => kept(event) && Boolean(event.recurringEventId),
  withMeet: (event) => kept(event) && Boolean(event.hangoutLink),
  otherVideo: (event) => kept(event) && Boolean(event.conferenceData && !event.hangoutLink),
  timed: (event) => kept(event) && !event.start?.date && Boolean(event.attendees?.length),
};

async function call(token: string, url: string | URL, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Raw) : {} };
}

async function readWindow(token: string, extra: Record<string, string>) {
  const url = new URL(EVENTS);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "250");
  for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, value);
  const answer = await call(token, url);
  if (answer.status !== 200) throw new Error(`Reading the calendar answered ${answer.status}`);
  return answer.body as Raw & { items?: Raw[]; nextSyncToken?: string; nextPageToken?: string };
}

const loadJson = (name: string) =>
  JSON.parse(readFileSync(`${FOLDER}/${name}`, "utf8")) as Record<string, unknown>;

async function record(ownerId: string, canWrite: boolean) {
  const token = await googleAccessToken(ownerId);
  const scrub = makeScrubber();
  const now = Date.now();
  const window = {
    timeMin: new Date(now - 30 * DAY).toISOString(),
    timeMax: new Date(now + 90 * DAY).toISOString(),
  };

  const eventsFile = loadJson("events.json");
  const answersFile = loadJson("answers.json");
  const recordedKinds: string[] = [];

  const calendar = await call(token, CALENDAR);
  if (calendar.status !== 200) throw new Error(`The calendar answered ${calendar.status}`);
  answersFile.calendar = scrub(calendar.body);

  const whole = await readWindow(token, { ...window, showDeleted: "true" });
  for (const [kind, matches] of Object.entries(KINDS)) {
    const found = (whole.items ?? []).find(matches);
    if (!found) continue;
    eventsFile[kind] = scrub(found);
    recordedKinds.push(kind);
  }

  const paged = await readWindow(token, { ...window, maxResults: "1" });
  if (paged.nextPageToken) {
    answersFile.firstPage = scrub(paged);
    recordedKinds.push("firstPage");
  }
  if (whole.nextSyncToken) {
    answersFile.lastPage = scrub(await readWindow(token, { syncToken: whole.nextSyncToken }));
    recordedKinds.push("lastPage");
  }
  const gone = await call(token, `${EVENTS}?syncToken=not-a-real-token`);
  if (gone.status === 410) {
    answersFile.syncGone = scrub(gone.body);
    recordedKinds.push("syncGone");
  } else {
    console.log(`A made-up sync token answered ${gone.status}, not 410; keeping the documented one.`);
  }

  if (canWrite) {
    const id = randomUUID().replaceAll("-", "");
    const start = new Date(now + DAY);
    const url = new URL(EVENTS);
    url.searchParams.set("sendUpdates", "none");
    url.searchParams.set("conferenceDataVersion", "1");
    const input = {
      method: "POST",
      body: JSON.stringify({
        id,
        summary: "Touchpoint test event (deleted at once)",
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: new Date(start.getTime() + 30 * 60_000).toISOString(), timeZone: "UTC" },
        conferenceData: {
          createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }),
    };
    let made = false;
    try {
      const inserted = await call(token, url, input);
      if (inserted.status !== 200) throw new Error(`Making the test event answered ${inserted.status}`);
      made = true;
      answersFile.inserted = scrub(inserted.body);
      recordedKinds.push("inserted");

      const again = await call(token, url, input);
      if (again.status === 409) {
        answersFile.duplicate = scrub(again.body);
        recordedKinds.push("duplicate");
      } else {
        console.log(`Sending it again answered ${again.status}, not 409; keeping the documented one.`);
      }
    } finally {
      if (made) {
        const removed = await call(token, `${EVENTS}/${id}?sendUpdates=none`, { method: "DELETE" });
        console.log(
          removed.status === 204
            ? "The test event was deleted."
            : `DELETE THE TEST EVENT BY HAND: "Touchpoint test event (deleted at once)", tomorrow. Google answered ${removed.status}.`,
        );
      }
    }
  } else {
    console.log("This connection can't add meetings, so inserted and duplicate stay documented.");
  }

  const all = [...Object.keys(KINDS), "firstPage", "lastPage", "syncGone", "inserted", "duplicate"];
  const stillDocumented = all.filter((kind) => !recordedKinds.includes(kind));
  const stamp = { recorded: recordedKinds, stillDocumented };
  for (const [name, content] of [
    ["events.json", eventsFile],
    ["answers.json", answersFile],
  ] as const) {
    writeFileSync(
      `${FOLDER}/${name}`,
      `${JSON.stringify(
        {
          ...content,
          source: "recorded",
          note: "Recorded by `pnpm fixtures:google` and scrubbed. Kinds listed under `kinds.stillDocumented` and the token answers are written from Google's references.",
          kinds: stamp,
        },
        null,
        2,
      )}\n`,
    );
  }
  console.log(`Recorded: ${recordedKinds.join(", ") || "nothing"}.`);
  console.log(`Still from Google's documentation: ${stillDocumented.join(", ") || "nothing"}.`);
}

async function main() {
  const [connection] = await db
    .select({
      ownerId: integrationConnections.ownerId,
      status: integrationConnections.status,
      scopes: integrationConnections.scopes,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.provider, "google"));
  if (connection?.status !== "connected") {
    console.error("Connect Google on your local copy first (Settings, Integrations).");
    process.exitCode = 1;
    return;
  }
  await record(connection.ownerId, connection.scopes.includes(CALENDAR_WRITE));
}

main()
  .catch((error: unknown) => {
    // Our own sentences only: an error from a library could quote a request.
    console.error(error instanceof Error ? error.message : "The recording stopped.");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
