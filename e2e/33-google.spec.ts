import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { CRON_SECRET } from "../playwright.config";
import { OWNER_SESSION } from "./support";

// Connect, sync, journey 3 with meetings, scheduling and a revoked token, all the way through
// the app's real Google code against e2e/fake-google. Every call below is one the app made.
test.use({ storageState: OWNER_SESSION });

const FAKE = "http://127.0.0.1:3101";
const READ = "https://www.googleapis.com/auth/calendar.readonly";
const WRITE = "https://www.googleapis.com/auth/calendar.events";
const EVENTS = "/calendar/v3/calendars/primary/events";
const CLIENT_ID = "1234567890-fakegoogle.apps.googleusercontent.com";
const NOT_ANSWERED =
  "Google didn't answer, so Touchpoint can't say whether the meeting was made. Check your calendar, or press Schedule again: it won't make a second one.";
const BANNER = "Google Calendar needs reconnecting";
const ZONE = "Asia/Kolkata";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const owner = `(select id from "user" limit 1)`;

const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

type FakeRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | null;
};
type FakeState = {
  revoked: boolean;
  requests: FakeRequest[];
  events: { id: string; summary?: string }[];
};

async function fake(path: string, body: unknown = {}) {
  const answer = await fetch(`${FAKE}/__fake/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(answer.ok).toBe(true);
  return answer;
}
const fakeState = async () => (await (await fake("state")).json()) as FakeState;
const calendarReads = (state: FakeState) =>
  state.requests.filter((request) => request.method === "GET" && request.path === EVENTS);
const inserts = (state: FakeState) =>
  state.requests.filter((request) => request.method === "POST" && request.path === EVENTS);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const count = async (sql: string, values: unknown[]) => {
  const { rows } = await pool.query(`select count(*)::int as count ${sql}`, values);
  return rows[0].count as number;
};

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
const panel = (page: Page) => page.getByRole("dialog");
const meetingsCard = (page: Page) =>
  page.locator("[data-slot=card]").filter({ hasText: "Meetings" }).first();

// Google's consent screen is a page in the browser, so the redirect is read and answered.
async function connect(page: Page, address = "/api/integrations/google/connect") {
  const answer = await page.request.get(address, { maxRedirects: 0 });
  expect(answer.status()).toBe(302);
  const consent = new URL(answer.headers()["location"]);
  expect(consent.origin).toBe("https://accounts.google.com");
  await page.goto(
    `/api/integrations/google/callback?state=${consent.searchParams.get("state")}&code=fake-code`,
  );
  await expect(page).toHaveURL(/\/settings\/integrations\?google=/);
}

// "Sync now" answers once a minute, which a test shouldn't have to wait for.
async function syncNow(page: Page, expected: string | RegExp) {
  await pool.query(`update integration_connections set last_sync_attempt_at = null`);
  await page.goto("/settings/integrations");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(expected)).toBeVisible();
}

// A tick runs the calendar.sync job. The job may wait its turn behind others.
async function tickUntil(request: APIRequestContext, done: () => Promise<boolean>) {
  await expect
    .poll(
      async () => {
        const tick = await request.post("/api/jobs/tick", {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        });
        expect(tick.ok()).toBe(true);
        return done();
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

const timed = (id: string, summary: string, startsIn: number, more: object = {}) => ({
  id,
  summary,
  start: { dateTime: new Date(Date.now() + startsIn).toISOString(), timeZone: ZONE },
  end: { dateTime: new Date(Date.now() + startsIn + HOUR).toISOString(), timeZone: ZONE },
  htmlLink: `https://www.google.com/calendar/event?eid=${id}`,
  ...more,
});

test.afterAll(async () => {
  await pool.end();
});

const devices = [
  { label: "desktop", viewport: { width: 1280, height: 800 }, first: "Ira", last: "Fakedesk" },
  { label: "phone", viewport: { width: 390, height: 844 }, first: "Omar", last: "Fakephone" },
];

for (const device of devices) {
  test.describe(`Google on a ${device.label}`, () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: device.viewport });

    const person = `${device.first} ${device.last}`;
    const email = `${device.first.toLowerCase()}@${device.last.toLowerCase()}.test`;
    const company = `${device.last} Studio`;
    const started = `${device.first} kickoff`;
    const coming = `${device.first} review`;
    const overdue = `Chase ${device.first}`;
    const dueToday = `Call ${device.first}`;
    let contactId: string;
    let organizationId: string;

    test.beforeAll(async () => {
      await fake("reset");
      ({
        rows: [{ id: organizationId }],
      } = await pool.query(
        `insert into organizations (owner_id, name) select ${owner}, $1 returning id`,
        [company],
      ));
      ({
        rows: [{ id: contactId }],
      } = await pool.query(
        `insert into contacts (owner_id, first_name, last_name) select ${owner}, $1, $2 returning id`,
        [device.first, device.last],
      ));
      await pool.query(
        `insert into contact_emails (owner_id, contact_id, email, is_primary)
         select ${owner}, $1, $2, true`,
        [contactId, email],
      );
      await pool.query(
        `insert into contact_organizations (owner_id, contact_id, organization_id)
         select ${owner}, $1, $2`,
        [contactId, organizationId],
      );
      await pool.query(
        `insert into tasks (owner_id, title, due_on, contact_id, organization_id)
         select ${owner}, title, due::date, $1, $2
         from (values ($3, $4), ($5, $6)) as seed(title, due)`,
        [contactId, organizationId, overdue, localDate(-1), dueToday, localDate()],
      );
    });

    test.afterAll(async () => {
      await pool.query(`delete from calendar_events`);
      await pool.query(`delete from integration_connections`);
      await pool.query(`delete from integration_clients`);
      await pool.query(`delete from activities where title = $1`, [started]);
      await pool.query(`delete from tasks where contact_id = $1`, [contactId]);
      await pool.query(`delete from contacts where id = $1`, [contactId]);
      await pool.query(`delete from organizations where id = $1`, [organizationId]);
    });

    test("journey 3 with meetings: connect, sync, and the day's review opens them", async ({
      page,
    }) => {
      const attendees = [
        { email, displayName: person, responseStatus: "accepted" },
        { email: "owner@gmail.test", self: true, responseStatus: "accepted" },
      ];
      await fake("configure", { scopes: [READ] });
      await fake("events", {
        events: [
          timed("fakestarted", started, -60_000, {
            attendees,
            location: "Room 4",
            hangoutLink: "https://meet.google.com/abc-defg-hij",
          }),
          timed("fakecoming", coming, 2 * DAY, { attendees }),
          timed("fakefocus", "Focus block", DAY, { eventType: "focusTime" }),
          timed("fakedeclined", "Declined call", DAY, {
            attendees: [{ email: "owner@gmail.test", self: true, responseStatus: "declined" }],
          }),
        ],
      });

      await page.goto("/settings/integrations");
      await page.getByLabel("Client ID").fill(CLIENT_ID);
      await page.getByLabel("Client secret").fill("GOCSPX-fake-secret");
      await page.getByRole("button", { name: "Save client" }).click();
      await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();

      await connect(page);
      await expect(page.getByText("owner@gmail.test").first()).toBeVisible();
      await syncNow(page, "Synced. 2 meetings kept.");
      expect(await fits(page)).toBe(true);

      // Reaching the fake at all is what shows no call left for the real Google.
      const state = await fakeState();
      expect(state.requests.filter(({ path }) => path === "/token").length).toBeGreaterThan(0);
      expect(calendarReads(state).at(-1)?.query.timeMin).toBeTruthy();

      await page.goto("/");
      await expect(
        page.getByRole("region", { name: /^Overdue/ }).getByRole("link", { name: overdue }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: /^Due today/ }).getByRole("link", { name: dueToday }),
      ).toBeVisible();
      await expect(meetingsCard(page).getByRole("link", { name: started })).toBeVisible();
      await expect(meetingsCard(page).getByRole("link", { name: coming })).toBeVisible();
      await expect(page.getByText("Focus block")).toHaveCount(0);
      await expect(page.getByText("Declined call")).toHaveCount(0);
      expect(await fits(page)).toBe(true);

      await meetingsCard(page).getByRole("link", { name: started }).click();
      await expect(page.getByRole("heading", { name: started })).toBeVisible();
      await expect(page.getByText("Room 4")).toBeVisible();
      await expect(page.getByRole("link", { name: "Join meeting" })).toHaveAttribute(
        "href",
        "https://meet.google.com/abc-defg-hij",
      );
      await expect(page.getByRole("link", { name: "Open in Google Calendar" })).toHaveAttribute(
        "href",
        "https://www.google.com/calendar/event?eid=fakestarted",
      );
      expect(await fits(page)).toBe(true);

      // Matched by the attendee's email, and to the person's company through them.
      await page.goto(`/people/organizations?company=${organizationId}&tab=activity`);
      await expect(panel(page).getByRole("link", { name: started })).toBeVisible();
      await expect(panel(page).getByRole("link", { name: coming })).toHaveCount(0);

      await page.goto(`/people/contacts?contact=${contactId}&tab=activity`);
      await panel(page).getByRole("link", { name: started }).click();
      await panel(page).getByRole("link", { name: "Log notes" }).click();
      await expect(panel(page).getByLabel("Summary")).toHaveValue(started);
      await panel(page).getByRole("button", { name: "Log activity" }).click();
      await expect(page).toHaveURL(new RegExp(`contact=${contactId}.*tab=activity`));
      await expect(panel(page).getByRole("link", { name: started })).toHaveCount(2);
      expect(await fits(page)).toBe(true);
    });

    test("a later sync reads only what changed, and starts again when Google says so", async ({
      page,
      request,
    }) => {
      const readsBefore = calendarReads(await fakeState()).length;
      await fake("events", {
        events: [
          timed("fakelater", `${device.first} added later`, DAY),
          { id: "fakecoming", status: "cancelled" },
        ],
      });
      const kept = (title: string) => count(`from calendar_events where title = $1`, [title]);
      await tickUntil(
        request,
        async () => (await kept(`${device.first} added later`)) === 1 && (await kept(coming)) === 0,
      );
      const reads = calendarReads(await fakeState()).slice(readsBefore);
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every(({ query }) => query.syncToken)).toBe(true);

      await page.goto("/");
      await expect(meetingsCard(page).getByRole("link", { name: `${device.first} added later` })).toBeVisible();
      await expect(meetingsCard(page).getByRole("link", { name: coming })).toHaveCount(0);

      // Google no longer holds the changes since this token: the whole window is read.
      await fake("configure", { nextFailure: "expire-sync" });
      await fake("events", { events: [timed("fakeafter410", `${device.first} after 410`, DAY)] });
      await tickUntil(request, async () => (await kept(`${device.first} after 410`)) === 1);
      expect(calendarReads(await fakeState()).at(-1)?.query.timeMin).toBeTruthy();

      // An access token at its end is refreshed before it is used.
      await pool.query(
        `update integration_connections set access_expires_at = now() - interval '1 hour'`,
      );
      const tokensBefore = (await fakeState()).requests.filter(({ path }) => path === "/token").length;
      await tickUntil(request, async () => {
        const { requests } = await fakeState();
        return requests.filter(({ path }) => path === "/token").length > tokensBefore;
      });
    });

    test("a meeting is recorded only once Google returns its id, and only once", async ({
      page,
    }) => {
      const rows = (title: string) => count(`from calendar_events where title = $1`, [title]);
      const audited = (title: string) =>
        count(`from audit_log where action = 'meeting.schedule' and after->>'title' = $1`, [title]);
      const openForm = async (title: string) => {
        await page.goto(`/people/contacts?contact=${contactId}&tab=activity&schedule=new`);
        await panel(page).getByLabel("Title").fill(title);
      };
      const toConfirm = async () => {
        await panel(page).getByRole("button", { name: "Continue" }).click();
        await expect(panel(page).getByRole("status")).toContainText("Google will add");
      };
      const schedule = () =>
        panel(page).getByRole("button", { name: "Schedule", exact: true }).click();
      const forTitle = (state: FakeState, title: string) =>
        inserts(state).filter(({ body }) => body?.summary === title);

      // Connected for reading only, so the permission is asked for first.
      await page.goto(`/people/contacts?contact=${contactId}&tab=activity&schedule=new`);
      await expect(panel(page).getByRole("link", { name: "Allow scheduling" })).toBeVisible();
      await fake("configure", { scopes: [READ, WRITE] });
      await connect(page, "/api/integrations/google/connect?for=scheduling");
      await expect(page.getByText("You can now schedule meetings from Touchpoint.")).toBeVisible();

      // Two presses, one call, and the guest's stored email.
      const plain = `${device.first} intro`;
      await openForm(plain);
      await toConfirm();
      expect(forTitle(await fakeState(), plain)).toHaveLength(0);
      await schedule();
      await expect(panel(page).getByRole("heading", { name: plain })).toBeVisible();
      await expect(panel(page).getByRole("link", { name: "Join meeting" })).toBeVisible();
      await expect(page).toHaveURL(/&event=/);
      expect(await fits(page)).toBe(true);
      const [sent] = forTitle(await fakeState(), plain);
      expect(sent.query.sendUpdates).toBe("all");
      expect(sent.query.conferenceDataVersion).toBe("1");
      expect(sent.body?.attendees).toEqual([{ email, displayName: person }]);
      expect(await rows(plain)).toBe(1);
      expect(await audited(plain)).toBe(1);

      await page.goto("/");
      await expect(meetingsCard(page).getByRole("link", { name: plain })).toBeVisible();

      // Both boxes off: nobody is emailed, and no Meet link is asked for.
      const quiet = `${device.first} quiet`;
      await openForm(quiet);
      await panel(page).getByLabel("Email the invitation to guests").uncheck();
      await panel(page).getByLabel("Add a Google Meet link").uncheck();
      await toConfirm();
      await schedule();
      await expect(panel(page).getByRole("heading", { name: quiet })).toBeVisible();
      await expect(panel(page).getByRole("link", { name: "Join meeting" })).toHaveCount(0);
      const [silent] = forTitle(await fakeState(), quiet);
      expect(silent.query.sendUpdates).toBe("none");
      expect(silent.query.conferenceDataVersion).toBeUndefined();

      // Google fails: nothing is kept, and the page says what is known.
      const failed = `${device.first} failed`;
      await openForm(failed);
      await toConfirm();
      await fake("configure", { nextFailure: "error" });
      await schedule();
      await expect(panel(page).getByText(NOT_ANSWERED)).toBeVisible();
      expect(await rows(failed)).toBe(0);
      expect(await audited(failed)).toBe(0);

      // Google makes it but its answer is lost: the second press finds it and invites nobody twice.
      const lost = `${device.first} lost answer`;
      await openForm(lost);
      await toConfirm();
      await fake("configure", { nextFailure: "lost" });
      await schedule();
      await expect(panel(page).getByText(NOT_ANSWERED)).toBeVisible();
      expect(await rows(lost)).toBe(0);
      await schedule();
      await expect(panel(page).getByRole("heading", { name: lost })).toBeVisible();

      const state = await fakeState();
      const tries = forTitle(state, lost);
      expect(tries).toHaveLength(2);
      expect(tries[0].body?.id).toBe(tries[1].body?.id);
      expect(state.events.filter(({ summary }) => summary === lost)).toHaveLength(1);
      expect(await rows(lost)).toBe(1);
      expect(await audited(lost)).toBe(1);
    });

    test("a token revoked at Google pauses sync and nothing else", async ({ page, request }) => {
      const meetings = () => count(`from calendar_events`, []);
      const keptBefore = await meetings();
      expect(keptBefore).toBeGreaterThan(0);

      await fake("revoke");
      // The page turns to the expired state at once, in place of the button and its message.
      const paused =
        "Google no longer accepts this connection, so calendar reading is paused. Everything else works as before.";
      await syncNow(page, paused);
      await page.reload();
      await expect(page.getByText(paused)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
      expect(await fits(page)).toBe(true);

      await page.goto("/");
      await expect(page.getByText(BANNER)).toBeVisible();
      await expect(
        page.getByRole("region", { name: /^Due today/ }).getByRole("link", { name: dueToday }),
      ).toBeVisible();
      await expect(meetingsCard(page).getByRole("link", { name: started })).toBeVisible();
      expect(await meetings()).toBe(keptBefore);
      expect(await fits(page)).toBe(true);

      await page.goto(`/people/contacts?contact=${contactId}&tab=activity`);
      await expect(panel(page).getByRole("heading", { name: person })).toBeVisible();
      await expect(panel(page).getByRole("link", { name: "Schedule meeting" })).toHaveCount(0);

      // Paused: a tick doesn't ask Google for the calendar.
      const reads = calendarReads(await fakeState()).length;
      const tick = await request.post("/api/jobs/tick", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      expect(tick.ok()).toBe(true);
      expect(calendarReads(await fakeState())).toHaveLength(reads);

      // Connecting again picks the calendar up where it was.
      await connect(page);
      await expect(page.getByText(BANNER)).toHaveCount(0);
      await syncNow(page, /^Synced\. \d+ meetings? kept\.$/);

      // Disconnecting gives the access back to Google and removes the copies.
      const revokes = async () =>
        (await fakeState()).requests.filter(({ path }) => path === "/revoke").length;
      const revokesBefore = await revokes();
      await page.getByRole("button", { name: "Disconnect" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
      await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
      expect(await revokes()).toBe(revokesBefore + 1);
      expect(await meetings()).toBe(0);
      expect((await fakeState()).revoked).toBe(true);
    });
  });
}
