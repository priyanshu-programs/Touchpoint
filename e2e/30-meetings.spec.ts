import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const CALENDAR_LINK = "https://www.google.com/calendar/event?eid=e2e";
const JOIN_LINK = "https://meet.google.com/abc-defg-hij";
const OTHER_MEETING = "00000000-0000-4000-8000-000000000000";

const DEVICES = [
  { name: "a desktop", width: 1280, height: 800 },
  { name: "a phone", width: 390, height: 844 },
];

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
const panel = (page: Page) => page.getByRole("dialog");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let contactId: string;
let organizationId: string;
let startedId: string;
let comingId: string;
let endedId: string;
let connectionId: string;

test.beforeAll(async () => {
  const owner = `(select id from "user" limit 1)`;
  ({
    rows: [{ id: organizationId }],
  } = await pool.query(
    `insert into organizations (owner_id, name) select ${owner}, 'Maple Studio' returning id`,
  ));
  ({
    rows: [{ id: contactId }],
  } = await pool.query(
    `insert into contacts (owner_id, first_name, last_name) select ${owner}, 'Ava', 'Stone' returning id`,
  ));
  ({
    rows: [{ id: connectionId }],
  } = await pool.query(`
    insert into integration_connections
      (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
    select ${owner}, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now()
    returning id
  `));
  const insert = `
    insert into calendar_events
      (owner_id, connection_id, external_id, title, location, meeting_url, html_link, all_day,
       starts_at, ends_at, attendees, organization_id)
    select ${owner}, $1, $2, $3, 'Room 4', $4, $5, false, $6::timestamptz, $7::timestamptz, $8::jsonb, $9
    returning id`;
  const attendees = JSON.stringify([
    { email: "ava@maple.test", name: "Ava Stone", response: "accepted" },
  ]);
  ({
    rows: [{ id: startedId }],
  } = await pool.query(insert, [
    connectionId,
    "e2e-started",
    "Maple kickoff",
    JOIN_LINK,
    CALENDAR_LINK,
    new Date(Date.now() - 60_000).toISOString(),
    new Date(Date.now() + 3_600_000).toISOString(),
    attendees,
    organizationId,
  ]));
  ({
    rows: [{ id: comingId }],
  } = await pool.query(insert, [
    connectionId,
    "e2e-coming",
    "Maple review",
    null,
    null,
    new Date(Date.now() + 2 * 86_400_000).toISOString(),
    new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
    attendees,
    organizationId,
  ]));
  ({
    rows: [{ id: endedId }],
  } = await pool.query(insert, [
    connectionId,
    "e2e-ended",
    "Maple intro",
    JOIN_LINK,
    null,
    new Date(Date.now() - 2 * 3_600_000).toISOString(),
    new Date(Date.now() - 3_600_000).toISOString(),
    attendees,
    organizationId,
  ]));
  await pool.query(
    `insert into calendar_event_contacts (event_id, contact_id, owner_id)
     select unnest($1::uuid[]), $2, ${owner}`,
    [[startedId, comingId, endedId], contactId],
  );
});

test.afterAll(async () => {
  await pool.query(`delete from calendar_events where title like 'Older meeting %'`);
  await pool.query(`delete from activities where title = 'Maple kickoff'`);
  await pool.query(`delete from integration_connections`);
  await pool.query(`delete from contacts where id = $1`, [contactId]);
  await pool.query(`delete from organizations where id = $1`, [organizationId]);
  await pool.end();
});

for (const device of DEVICES) {
  test(`meetings show on Today and on the Activity tab, on ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });

    await page.goto("/");
    const card = page.locator("[data-slot=card]").filter({ hasText: "Meetings" }).first();
    await expect(card.getByRole("link", { name: "Maple kickoff" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Maple review" })).toBeVisible();
    expect(await fits(page)).toBe(true);
    // The card covers them, so Recent activity doesn't repeat them.
    await expect(page.getByRole("link", { name: "Maple kickoff" })).toHaveCount(1);

    await card.getByRole("link", { name: "Maple kickoff" }).click();
    await expect(page).toHaveURL(new RegExp(`/meetings/${startedId}$`));
    await expect(page.getByRole("heading", { name: "Maple kickoff" })).toBeVisible();
    await expect(page.getByText("Room 4")).toBeVisible();
    await expect(page.getByText("Ava Stone (ava@maple.test)")).toBeVisible();
    const calendar = page.getByRole("link", { name: "Open in Google Calendar" });
    await expect(calendar).toHaveAttribute("href", CALENDAR_LINK);
    await expect(calendar).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByRole("link", { name: "Join meeting" })).toHaveAttribute(
      "href",
      JOIN_LINK,
    );
    expect(await fits(page)).toBe(true);

    await page.goto(`/meetings/${comingId}`);
    await expect(page.getByRole("heading", { name: "Maple review" })).toBeVisible();
    // Notes and files go in any meeting, prep notes for one still to come too.
    await expect(page.getByRole("textbox", { name: "Meeting notes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add file" })).toBeVisible();

    for (const address of [
      `/people/contacts?contact=${contactId}&tab=activity`,
      `/people/organizations?company=${organizationId}&tab=activity`,
    ]) {
      await page.goto(address);
      const live = panel(page).getByRole("region", { name: "Live now" });
      const upcoming = panel(page).getByRole("region", { name: "Upcoming meetings" });
      const past = panel(page).getByRole("region", { name: "Past meetings" });
      // Under way: begun a minute ago and an hour long.
      await expect(live.getByRole("link", { name: "Maple kickoff" })).toBeVisible();
      await expect(live.getByText("Live", { exact: true })).toBeVisible();
      await expect(live.getByRole("link", { name: "Join" })).toHaveAttribute("href", JOIN_LINK);
      await expect(upcoming.getByRole("link", { name: "Maple review" })).toBeVisible();
      await expect(upcoming.getByRole("link", { name: "Maple kickoff" })).toHaveCount(0);
      await expect(past.getByRole("link", { name: "Maple intro" })).toBeVisible();
      await expect(past.getByRole("link", { name: "Maple kickoff" })).toHaveCount(0);
      // A meeting's box: its day, its hours, its place and who came.
      await expect(past.getByText(/^\d{2}:\d{2} – \d{2}:\d{2}$/)).toBeVisible();
      await expect(past.getByText("Room 4")).toBeVisible();
      await expect(past.getByText("With Ava Stone")).toBeAttached();
      // Join is for a meeting still to come or under way.
      await expect(past.getByRole("link", { name: "Join" })).toHaveCount(0);
      await panel(page).getByRole("link", { name: "Maple kickoff" }).click();
      await expect(page).toHaveURL(new RegExp(`&event=${startedId}$`));
      await expect(panel(page).getByRole("heading", { name: "Maple kickoff" })).toBeVisible();
      await expect(
        panel(page).getByRole("link", { name: "Open in Google Calendar" }),
      ).toBeVisible();
      expect(await fits(page)).toBe(true);
      await panel(page).getByRole("link", { name: /^Back to / }).click();
      await expect(page).toHaveURL(/tab=activity$/);
    }
  });
}

test("past meetings past five open alone with See all, paged, and All activity goes back", async ({
  page,
}) => {
  for (let day = 1; day <= 30; day++) {
    await pool.query(
      `insert into calendar_events
         (owner_id, connection_id, external_id, title, all_day, starts_at, ends_at, attendees,
          organization_id)
       select owner_id, id, $1, $2, false, $3::timestamptz, $4::timestamptz, '[]', $5
       from integration_connections where id = $6`,
      [
        `e2e-older-${day}`,
        `Older meeting ${day}`,
        new Date(Date.now() - day * 86_400_000).toISOString(),
        new Date(Date.now() - day * 86_400_000 + 1_800_000).toISOString(),
        organizationId,
        connectionId,
      ],
    );
  }
  await page.goto(`/people/organizations?company=${organizationId}&tab=activity`);
  const past = panel(page).getByRole("region", { name: "Past meetings" });
  await expect(past.getByRole("listitem")).toHaveCount(5);
  await past.getByRole("link", { name: "See all (31)" }).click();
  await expect(page).toHaveURL(/section=meetings/);
  await expect(panel(page).getByRole("region", { name: "Past meetings" }).getByRole("listitem")).toHaveCount(30);
  await panel(page).getByRole("link", { name: "Earlier" }).click();
  await expect(page).toHaveURL(/section=meetings&after=/);
  await expect(panel(page).getByRole("link", { name: "Older meeting 30" })).toBeVisible();
  await expect(panel(page).getByRole("region", { name: "Upcoming meetings" })).toHaveCount(0);
  await panel(page).getByRole("link", { name: "All activity" }).click();
  await expect(page).not.toHaveURL(/section=/);
  await expect(panel(page).getByRole("region", { name: "Upcoming meetings" })).toBeVisible();
});

test("notes and files are kept inside a meeting", async ({ page }) => {
  const address = `/people/contacts?contact=${contactId}&tab=activity&event=${startedId}`;
  await page.goto(address);
  const notes = panel(page).getByRole("textbox", { name: "Meeting notes" });
  await notes.click();
  await page.keyboard.press("Control+b");
  await page.keyboard.type("Agreed");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" on scope");
  // Leaving with a change asks first; staying keeps it.
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel(page).getByRole("link", { name: /^Back to / }).click();
  await expect(page).toHaveURL(new RegExp(`event=${startedId}$`));
  await panel(page).getByRole("button", { name: "Save" }).click();
  await expect(panel(page).getByRole("status")).toHaveText("Notes saved.");
  await expect(panel(page).getByRole("button", { name: "Save" })).toHaveCount(0);

  const choose = panel(page).getByLabel("Choose a file");
  await choose.setInputFiles({
    name: "brief.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nMaple brief\n%%EOF\n"),
  });
  const brief = panel(page).getByRole("link", { name: "brief.pdf" });
  await expect(brief).toHaveAttribute("href", /^\/api\/activities\/[\w-]+\/files\/[\w-]+$/);
  await expect(brief).toHaveAttribute("rel", "noopener noreferrer");
  const served = await page.request.get((await brief.getAttribute("href"))!);
  expect(served.headers()["content-type"]).toBe("application/pdf");

  // Only the kinds a box on a workflow takes are kept.
  await choose.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("plain text"),
  });
  await expect(panel(page).getByRole("alert")).toHaveText(
    "Only PDFs, pictures and Word, Excel and PowerPoint files are kept.",
  );

  await page.reload();
  await expect(notes).toHaveText("Agreed on scope");
  await expect(notes.locator("strong")).toHaveText("Agreed");
  await expect(brief).toBeVisible();

  await panel(page).getByRole("link", { name: /^Back to / }).click();
  const live = panel(page).getByRole("region", { name: "Live now" });
  await expect(live.getByText("Has notes")).toBeAttached();
  await expect(live.getByTitle("1 file")).toBeVisible();
  // The notes stay with the meeting and aren't repeated under Activities.
  await expect(panel(page).getByRole("region", { name: "Activities" })).toHaveCount(0);

  await page.goto(address);
  await panel(page).getByRole("button", { name: "Remove brief.pdf" }).click();
  await expect(brief).toHaveCount(0);
});

test("notes in a meeting fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/people/organizations?company=${organizationId}&tab=activity&event=${endedId}`);
  await expect(panel(page).getByRole("textbox", { name: "Meeting notes" })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Bold" })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Add file" })).toBeVisible();
  expect(await fits(page)).toBe(true);
});

test("a meeting that isn't there opens nothing", async ({ page }) => {
  // The app's loading screen has already answered 200 by the time the page knows.
  await page.goto(`/meetings/${OTHER_MEETING}`);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Meeting notes" })).toHaveCount(0);

  await page.goto(`/people/contacts?contact=${contactId}&tab=activity&event=${OTHER_MEETING}`);
  await expect(panel(page).getByRole("heading", { name: "Ava Stone" })).toBeVisible();

  await page.goto(`/people/contacts?contact=${contactId}&tab=activity&event=not-an-id`);
  await expect(panel(page).getByRole("heading", { name: "Ava Stone" })).toBeVisible();
});

test("the card goes when Google is disconnected", async ({ page }) => {
  await pool.query(`delete from integration_connections`);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Meetings", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Maple review" })).toHaveCount(0);
});
