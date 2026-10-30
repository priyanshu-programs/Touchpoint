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
  const {
    rows: [{ id: connectionId }],
  } = await pool.query(`
    insert into integration_connections
      (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
    select ${owner}, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now()
    returning id
  `);
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
  await pool.query(
    `insert into calendar_event_contacts (event_id, contact_id, owner_id)
     select unnest($1::uuid[]), $2, ${owner}`,
    [[startedId, comingId], contactId],
  );
});

test.afterAll(async () => {
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
    await expect(page.getByRole("link", { name: "Log notes" })).toHaveCount(0);

    for (const address of [
      `/people/contacts?contact=${contactId}&tab=activity`,
      `/people/organizations?company=${organizationId}&tab=activity`,
    ]) {
      await page.goto(address);
      await expect(panel(page).getByRole("link", { name: "Maple kickoff" })).toBeVisible();
      await expect(panel(page).getByRole("link", { name: "Maple review" })).toHaveCount(0);
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

test("Log notes opens Log activity filled in, and saving keeps it", async ({ page }) => {
  await page.goto(`/people/contacts?contact=${contactId}&tab=activity&event=${startedId}`);
  await panel(page).getByRole("link", { name: "Log notes" }).click();
  await expect(page).toHaveURL(new RegExp(`event=${startedId}&activity=new$`));

  await expect(panel(page).getByLabel("Type")).toHaveValue("meeting");
  await expect(panel(page).getByLabel("Summary")).toHaveValue("Maple kickoff");
  await expect(panel(page).getByText("Maple Studio")).toBeVisible();
  await expect(panel(page).getByText("Ava Stone").first()).toBeVisible();

  await panel(page).getByRole("button", { name: "Log activity" }).click();
  await expect(page).toHaveURL(new RegExp(`contact=${contactId}.*tab=activity`));
  await expect(panel(page).getByText("Meeting", { exact: true })).toHaveCount(2);
  await expect(panel(page).getByRole("link", { name: "Maple kickoff" })).toHaveCount(2);
});

test("a meeting that isn't there opens nothing", async ({ page }) => {
  // The app's loading screen has already answered 200 by the time the page knows.
  await page.goto(`/meetings/${OTHER_MEETING}`);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log notes" })).toHaveCount(0);

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
