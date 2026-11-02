import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(Date.now() + offsetDays * DAY));
const JOIN_LINK = "https://meet.google.com/abc-defg-hij";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const owner = `(select id from "user" limit 1)`;

const nextUp = (page: Page) => page.getByRole("region", { name: "Next up" });
const main = (page: Page) => page.getByRole("main");

async function addTask(title: string, dueOn: string) {
  const { rows } = await pool.query(
    `insert into tasks (owner_id, title, due_on) select ${owner}, $1, $2 returning id`,
    [title, dueOn],
  );
  return rows[0].id as string;
}

async function clearEverything() {
  await pool.query(`delete from tasks`);
  await pool.query(`delete from integration_connections`);
  await pool.query(`delete from payment_allocations`);
  await pool.query(`delete from payments`);
  await pool.query(`delete from invoices`);
}

let consoleErrors: string[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test.beforeAll(clearEverything);
test.afterAll(async () => {
  await clearEverything();
  await pool.query(`delete from organizations where name = 'Today Dashboard Co'`);
  await pool.end();
});

test("with nothing to do, Today says so and offers the next step", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(main(page).getByText("Nothing due today.")).toBeVisible();
  await expect(main(page).getByText("Nothing is due today.")).toBeVisible();

  await expect(nextUp(page).getByText("You're clear.")).toBeVisible();
  await expect(nextUp(page).getByRole("link", { name: "Add task" })).toHaveAttribute("href", "/tasks/new");

  await expect(main(page).getByText("No money recorded yet.")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Add your first invoice" })).toHaveAttribute(
    "href",
    "/money/invoices/new",
  );
  await expect(main(page).getByText("Money received")).toHaveCount(0);
});

test("Next up takes the most overdue task, and opens it", async ({ page }) => {
  await addTask("Send proposal", localDate());
  const overdue = await addTask("Renew domain", localDate(-3));
  await addTask("Prepare notes", localDate(2));

  await page.goto("/");
  await expect(main(page).getByText("1 overdue, 1 due today.")).toBeVisible();
  await expect(nextUp(page).getByText("Overdue")).toBeVisible();
  await expect(nextUp(page).getByText("Renew domain")).toBeVisible();
  // The task keeps one link and one Complete button, in the list.
  await expect(main(page).getByRole("link", { name: "Renew domain" })).toHaveCount(1);
  await expect(main(page).getByRole("button", { name: "Complete: Renew domain" })).toHaveCount(1);
  await expect(nextUp(page).getByRole("link", { name: "Join meeting" })).toHaveCount(0);

  await nextUp(page).getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${overdue}$`));
});

test("completing the task moves Next up on to the one after", async ({ page }) => {
  await page.goto("/");
  await main(page).getByRole("button", { name: "Complete: Renew domain" }).click();
  await expect(nextUp(page).getByText("Send proposal")).toBeVisible();
  await expect(nextUp(page).getByText("Due today")).toBeVisible();

  await main(page).getByRole("button", { name: "Complete: Send proposal" }).click();
  await expect(nextUp(page).getByText("Prepare notes")).toBeVisible();
  await expect(nextUp(page).getByText("Coming up")).toBeVisible();
  await expect(main(page).getByText("Nothing due today.")).toBeVisible();
});

test("the connect card shows until Google is connected, then a meeting comes first", async ({ page }) => {
  await addTask("Call the bank", localDate(-1));
  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "Connect Google Calendar" })).toBeVisible();
  await expect(main(page).getByText("Meetings", { exact: true })).toHaveCount(0);
  await main(page).getByRole("link", { name: "Connect calendar" }).click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);

  const {
    rows: [{ id: connection }],
  } = await pool.query(`
    insert into integration_connections
      (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
    select ${owner}, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now()
    returning id`);
  const {
    rows: [{ id: meeting }],
  } = await pool.query(
    `insert into calendar_events
       (owner_id, connection_id, external_id, title, meeting_url, all_day, starts_at, ends_at, attendees)
     select ${owner}, $1, 'e2e-next-up', 'Maple kickoff', $2, false, $3::timestamptz, $4::timestamptz, '[]'::jsonb
     returning id`,
    [
      connection,
      JOIN_LINK,
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 3_600_000).toISOString(),
    ],
  );

  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "Connect Google Calendar" })).toHaveCount(0);
  await expect(main(page).getByText("Meetings", { exact: true })).toBeVisible();
  await expect(main(page).getByText("1 overdue, 1 meeting today.")).toBeVisible();
  await expect(nextUp(page).getByText("On now")).toBeVisible();
  await expect(nextUp(page).getByText("Maple kickoff")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Maple kickoff" })).toHaveCount(1);
  const join = nextUp(page).getByRole("link", { name: "Join meeting" });
  await expect(join).toHaveAttribute("href", JOIN_LINK);
  await expect(join).toHaveAttribute("rel", "noopener noreferrer");
  await nextUp(page).getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting}$`));

  // A copy of the calendar left behind by a lost connection isn't shown.
  await pool.query(`update integration_connections set status = 'revoked'`);
  await page.goto("/");
  await expect(nextUp(page).getByText("Call the bank")).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Connect Google Calendar" })).toBeVisible();
  await pool.query(`delete from integration_connections`);
});

test("Quick actions go where they say", async ({ page }) => {
  const actions = page.getByRole("listitem").filter({ has: page.getByRole("link") });
  for (const [name, address] of [
    ["Add task", /\/tasks\/new$/],
    ["Log activity", /\/activities\/new$/],
    ["New company", /\/people\/organizations/],
    ["New invoice", /\/money\/invoices\/new$/],
  ] as const) {
    await page.goto("/");
    await actions.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(address);
  }
});

test("the chart shows twelve months with this one marked, and a bar opens its payments", async ({ page }) => {
  const {
    rows: [{ id: company }],
  } = await pool.query(
    `insert into organizations (owner_id, name) select ${owner}, 'Today Dashboard Co' returning id`,
  );
  const pay = (receivedOn: string, minor: number) =>
    pool.query(
      `insert into payments (owner_id, organization_id, received_on, amount_minor, currency, method, idempotency_key)
       select ${owner}, $1, $2, $3, 'INR', 'bank_transfer', gen_random_uuid()`,
      [company, receivedOn, minor],
    );
  const today = localDate();
  const [year, month] = today.split("-").map(Number);
  const earlier = new Date(Date.UTC(year, month - 4, 15)).toISOString().slice(0, 10);
  await pay(today, 5_000_000);
  await pay(earlier, 2_000_000);

  await page.goto("/");
  await expect(main(page).getByText("Money received", { exact: true })).toBeVisible();
  await expect(main(page).getByText("₹70,000", { exact: true })).toBeVisible();
  await expect(main(page).getByText("In the last 12 months, from 2 payments.")).toBeVisible();

  const table = main(page).getByRole("table", { name: /last 12 months/ });
  await expect(table.getByRole("row")).toHaveCount(13);

  const from = `${today.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const chart = main(page).locator("[aria-hidden=true]").filter({ has: page.locator(`a[href*="from=${from}"]`) });
  // This month's figure is up by itself, the same as the tile's.
  await expect(chart.getByText("₹50,000")).toBeVisible();
  await chart.locator(`a[href*="from=${earlier.slice(0, 7)}-01"]`).hover();
  await expect(chart.getByText("₹20,000")).toBeVisible();
  await expect(chart.getByText("1 payment")).toBeVisible();
  await expect(chart.getByText("₹50,000")).toHaveCount(0);

  await chart.locator(`a[href*="from=${from}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/money/payments\\?from=${from}&to=${to}$`));
  await expect(main(page).getByText("Today Dashboard Co").first()).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the work comes first and nothing runs off the screen", async ({ page }) => {
    await page.goto("/");
    await expect(nextUp(page)).toBeVisible();
    const top = async (text: string) =>
      (await main(page).locator("[data-slot=card]").filter({ hasText: text }).first().boundingBox())!.y;
    const nextUpTop = (await nextUp(page).boundingBox())!.y;
    const quick = await top("Quick actions");
    const tasks = await top("Tasks");
    const money = (await main(page).getByRole("list", { name: "Money" }).locator("li").first().boundingBox())!.y;
    const chart = await top("Money received");
    expect(nextUpTop).toBeLessThan(quick);
    expect(quick).toBeLessThan(tasks);
    expect(tasks).toBeLessThan(money);
    expect(money).toBeLessThan(chart);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
