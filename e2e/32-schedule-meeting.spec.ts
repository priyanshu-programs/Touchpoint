import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const READ = "https://www.googleapis.com/auth/calendar.readonly";
const WRITE = "https://www.googleapis.com/auth/calendar.events";
const DAY = 24 * 60 * 60_000;

const DEVICES = [
  { name: "a desktop", width: 1280, height: 800 },
  { name: "a phone", width: 390, height: 844 },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const owner = `(select id from "user" limit 1)`;
let withEmail: string;
let withoutEmail: string;
let company: string;

const panel = (page: Page) => page.getByRole("dialog");
const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
const scheduleLink = (page: Page) => page.getByRole("link", { name: "Schedule meeting" });

async function connection(scopes: string[], status = "connected") {
  await pool.query(`delete from integration_connections`);
  await pool.query(
    `insert into integration_connections
       (owner_id, provider, account_email, scopes, status, key_version, connected_at)
     select ${owner}, 'google', 'owner@gmail.test', $1::text[], $2, 1, now()`,
    [scopes, status],
  );
}

const withinZone = (ms: number) => {
  const local = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
};

test.beforeAll(async () => {
  ({
    rows: [{ id: withEmail }],
  } = await pool.query(
    `insert into contacts (owner_id, first_name, last_name)
     select ${owner}, 'Asha', 'Schedule' returning id`,
  ));
  await pool.query(
    `insert into contact_emails (owner_id, contact_id, email, is_primary)
     select ${owner}, $1, 'asha@schedule.test', true`,
    [withEmail],
  );
  ({
    rows: [{ id: withoutEmail }],
  } = await pool.query(
    `insert into contacts (owner_id, first_name, last_name)
     select ${owner}, 'Noemail', 'Schedule' returning id`,
  ));
  ({
    rows: [{ id: company }],
  } = await pool.query(
    `insert into organizations (owner_id, name)
     select ${owner}, 'Schedule Empty Co' returning id`,
  ));
});

test.afterAll(async () => {
  await pool.query(`delete from integration_connections`);
  await pool.query(`delete from contacts where id = any($1)`, [[withEmail, withoutEmail]]);
  await pool.query(`delete from organizations where id = $1`, [company]);
  await pool.end();
});

test("without Google there is nothing to press", async ({ page }) => {
  await pool.query(`delete from integration_connections`);
  await page.goto(`/people/contacts?contact=${withEmail}&tab=activity`);
  await expect(panel(page).getByRole("link", { name: "Log activity" })).toBeVisible();
  await expect(scheduleLink(page)).toHaveCount(0);

  await page.goto("/tasks/calendar");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expect(scheduleLink(page)).toHaveCount(0);

  await page.goto("/meetings/new");
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
});

test("an expired connection offers nothing either", async ({ page }) => {
  await connection([READ, WRITE], "expired");
  await page.goto(`/people/contacts?contact=${withEmail}&tab=activity`);
  await expect(panel(page).getByRole("link", { name: "Log activity" })).toBeVisible();
  await expect(scheduleLink(page)).toHaveCount(0);
});

test("reading alone explains the permission and asks Google for it", async ({ page }) => {
  await connection([READ]);
  await page.goto(`/people/contacts?contact=${withEmail}&tab=activity`);
  await panel(page).getByRole("link", { name: "Schedule meeting" }).click();
  await expect(page).toHaveURL(/schedule=new/);
  await expect(panel(page).getByText("So far Touchpoint can only read your calendar.")).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Allow scheduling" })).toHaveAttribute(
    "href",
    "/api/integrations/google/connect?for=scheduling",
  );
});

for (const device of DEVICES) {
  test(`the form checks first and says what Google will do, on ${device.name}`, async ({ page }) => {
    await connection([READ, WRITE]);
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`/people/contacts?contact=${withEmail}&tab=activity`);
    await panel(page).getByRole("link", { name: "Schedule meeting" }).click();
    await expect(panel(page).getByRole("heading", { name: "Schedule meeting" })).toBeVisible();

    await expect(panel(page).getByRole("listitem").getByText("Asha Schedule")).toBeVisible();
    await expect(panel(page).getByLabel("Email the invitation to guests")).toBeChecked();
    await expect(panel(page).getByLabel("Add a Google Meet link")).toBeChecked();
    expect(await fits(page)).toBe(true);

    await panel(page).getByLabel("Title").fill("Intro call");
    await panel(page).getByRole("button", { name: "Continue" }).click();

    const summary = panel(page).getByRole("status");
    await expect(summary).toContainText('Google will add "Intro call" to your calendar (owner@gmail.test)');
    await expect(summary).toContainText("with a Google Meet link");
    await expect(summary).toContainText(
      "It will email an invitation to Asha Schedule (asha@schedule.test).",
    );
    await expect(panel(page).getByRole("button", { name: "Schedule", exact: true })).toBeVisible();
    await expect(panel(page).getByLabel("Title")).toBeHidden();
    expect(await fits(page)).toBe(true);

    await panel(page).getByRole("button", { name: "Go back" }).click();
    await expect(panel(page).getByLabel("Title")).toHaveValue("Intro call");

    await panel(page).getByLabel("Email the invitation to guests").uncheck();
    await panel(page).getByLabel("Add a Google Meet link").uncheck();
    await panel(page).getByRole("button", { name: "Continue" }).click();
    await expect(panel(page).getByRole("status")).toContainText(
      "It will list Asha Schedule (asha@schedule.test) as invited and email nobody.",
    );
    await expect(panel(page).getByRole("status")).not.toContainText("Google Meet");
  });
}

test("a wrong form is refused with its reason, and what was typed stays", async ({ page }) => {
  await connection([READ, WRITE]);
  await page.goto(`/people/contacts?contact=${withoutEmail}&tab=activity&schedule=new`);
  const form = panel(page);
  await form.getByLabel("Title").fill("Intro call");

  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Noemail Schedule has no email address, so Google can't invite them. Add one, or take them off.",
  );
  await expect(form.getByLabel("Title")).toHaveValue("Intro call");

  await form.getByRole("button", { name: "Remove contact: Noemail Schedule" }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose at least one person to invite.");
});

test("the times are checked", async ({ page }) => {
  await connection([READ, WRITE]);
  const now = Date.now();
  const cases = [
    {
      starts: withinZone(now + 2 * DAY),
      ends: withinZone(now + DAY),
      message: "A meeting has to end after it starts.",
    },
    {
      starts: withinZone(now - 2 * DAY),
      ends: withinZone(now - DAY),
      message: "That start time has already passed.",
    },
    {
      starts: withinZone(now + 100 * DAY),
      ends: withinZone(now + 101 * DAY),
      message:
        "Touchpoint can schedule up to 90 days ahead. For a later meeting, use Google Calendar.",
    },
  ];
  for (const { starts, ends, message } of cases) {
    await page.goto(`/people/contacts?contact=${withEmail}&tab=activity&schedule=new`);
    const form = panel(page);
    await form.getByLabel("Title").fill("Intro call");
    await form.getByLabel("Starts").fill(starts);
    await form.getByLabel("Ends").fill(ends);
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByRole("alert")).toHaveText(message);
  }
});

test("a company with nobody to invite says so", async ({ page }) => {
  await connection([READ, WRITE]);
  await page.goto(`/people/organizations?company=${company}&tab=activity`);
  await panel(page).getByRole("link", { name: "Schedule meeting" }).click();
  await expect(panel(page).getByRole("heading", { name: "Schedule meeting" })).toBeVisible();
  await expect(
    panel(page).getByText("Nobody at Schedule Empty Co has an email address yet."),
  ).toBeVisible();
});

test("the Calendar tab opens the form on its own page", async ({ page }) => {
  await connection([READ, WRITE]);
  await page.goto("/tasks/calendar");
  await scheduleLink(page).click();
  await expect(page).toHaveURL(/\/meetings\/new$/);
  await expect(page.getByRole("heading", { name: "Schedule meeting" })).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();

  await page.getByLabel("Title").fill("Intro call");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose at least one person to invite.")).toBeVisible();

  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/tasks\/calendar$/);
});

test("Settings offers Allow scheduling only while it isn't allowed", async ({ page }) => {
  await pool.query(
    `insert into integration_clients (owner_id, provider, client_id, client_secret_enc, key_version)
     select ${owner}, 'google', '1234567890-abcdefgh.apps.googleusercontent.com', 'unreadable', 1
     on conflict do nothing`,
  );
  await connection([READ, WRITE]);
  await page.goto("/settings/integrations");
  await expect(page.getByText("Add meetings to your calendar")).toBeVisible();
  await expect(page.getByRole("link", { name: "Allow scheduling" })).toHaveCount(0);

  await page.goto("/settings/integrations?google=scheduling_not_granted");
  await expect(
    page.getByText("Google didn't allow adding meetings, so Touchpoint can still only read your calendar."),
  ).toBeVisible();
  await page.goto("/settings/integrations?google=scheduling_allowed");
  await expect(page.getByText("You can now schedule meetings from Touchpoint.")).toBeVisible();
  await pool.query(`delete from integration_clients`);
});
