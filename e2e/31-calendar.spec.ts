import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// A week no other spec writes to, far enough ahead to be beyond what Google is read for.
const WEEK = "2030-03-04";
const NEXT_WEEK = "2030-03-11";
const PREVIOUS_WEEK = "2030-02-25";

const DEVICES = [
  { name: "a desktop", width: 1280, height: 800 },
  { name: "a phone", width: 390, height: 844 },
];

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
const day = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let taskId: string;
let meetingId: string;

test.beforeAll(async () => {
  const owner = `(select id from "user" limit 1)`;
  ({
    rows: [{ id: taskId }],
  } = await pool.query(
    `insert into tasks (owner_id, title, due_on)
     select ${owner}, 'Send Maple contract', '2030-03-05' returning id`,
  ));
  const {
    rows: [{ id: connectionId }],
  } = await pool.query(`
    insert into integration_connections
      (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
    select ${owner}, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now()
    returning id
  `);
  ({
    rows: [{ id: meetingId }],
  } = await pool.query(
    `insert into calendar_events
       (owner_id, connection_id, external_id, title, all_day, starts_at, ends_at, attendees)
     select ${owner}, $1, 'e2e-timed', 'Maple kickoff', false,
       '2030-03-06T12:00:00Z', '2030-03-06T13:00:00Z', '[]'::jsonb
     returning id`,
    [connectionId],
  ));
  await pool.query(
    `insert into calendar_events
       (owner_id, connection_id, external_id, title, all_day, starts_on, ends_on, attendees)
     select ${owner}, $1, 'e2e-all-day', 'Maple offsite', true,
       '2030-03-08', '2030-03-13', '[]'::jsonb`,
    [connectionId],
  );
});

test.afterAll(async () => {
  await pool.query(`delete from tasks where id = $1 or title = 'Book Maple venue'`, [taskId]);
  await pool.query(`delete from integration_connections`);
  await pool.end();
});

for (const device of DEVICES) {
  test(`a week of tasks and meetings, on ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`/tasks/calendar?week=${WEEK}`);
    await expect(page.getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { name: "Mon, 4 Mar 2030 to Sun, 10 Mar 2030" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "View", exact: true }).getByRole("link", { name: "Week" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect(
      day(page, "Tue, 5 Mar 2030").getByRole("link", { name: "Send Maple contract" }),
    ).toBeVisible();
    const kickoff = day(page, "Wed, 6 Mar 2030");
    await expect(kickoff.getByRole("link", { name: /Maple kickoff/ })).toBeVisible();
    if (device.width < 1024) {
      await expect(kickoff.getByText("Meeting", { exact: true })).toBeVisible();
    }

    for (const name of ["Fri, 8 Mar 2030", "Sat, 9 Mar 2030", "Sun, 10 Mar 2030"]) {
      await expect(day(page, name).getByRole("link", { name: /Maple offsite/ })).toBeVisible();
      await expect(day(page, name).getByText("All day")).toBeVisible();
    }
    await expect(page.getByText("up to 90 days ahead")).toBeVisible();

    // Every day shows, so an empty one can take a task.
    await expect(
      day(page, "Mon, 4 Mar 2030").getByRole("link", { name: "Add task on Mon, 4 Mar 2030", exact: true }),
    ).toBeVisible();
    expect(await fits(page)).toBe(true);
  });

  test(`a month of tasks and meetings, on ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto("/tasks/calendar?view=month&on=2030-03-20");
    await expect(page.getByRole("heading", { name: "March 2030" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "View", exact: true }).getByRole("link", { name: "Month" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Whole weeks from Monday: the month's grid starts in February and ends on its last Sunday.
    await expect(day(page, "Mon, 25 Feb 2030")).toBeVisible();
    await expect(day(page, "Sun, 31 Mar 2030")).toBeVisible();

    if (device.width >= 640) {
      await expect(
        day(page, "Tue, 5 Mar 2030").getByRole("link", { name: "Send Maple contract" }),
      ).toBeVisible();
      await expect(
        day(page, "Wed, 6 Mar 2030").getByRole("link", { name: /Maple kickoff/ }),
      ).toBeVisible();
      await expect(
        day(page, "Tue, 12 Mar 2030").getByRole("link", { name: /Maple offsite/ }),
      ).toBeVisible();
      await expect(
        day(page, "Wed, 13 Mar 2030").getByRole("link", { name: /Maple offsite/ }),
      ).toHaveCount(0);
    } else {
      // On a phone a day opens below the grid.
      await page.getByRole("link", { name: "Show Tue, 5 Mar 2030" }).click();
      await expect(page).toHaveURL(/view=month&on=2030-03-05$/);
      await expect(page.getByRole("heading", { name: "Tue, 5 Mar 2030" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Send Maple contract" })).toBeVisible();
    }
    expect(await fits(page)).toBe(true);
  });
}

test("the week moves, and the address says which", async ({ page }) => {
  await page.goto(`/tasks/calendar?week=${WEEK}`);

  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/calendar\\?view=week&on=${NEXT_WEEK}$`));
  // The offsite's last two days fall in this week, and its end date doesn't count.
  await expect(
    day(page, "Tue, 12 Mar 2030").getByRole("link", { name: /Maple offsite/ }),
  ).toBeVisible();
  await expect(
    day(page, "Wed, 13 Mar 2030").getByRole("link", { name: /Maple offsite/ }),
  ).toHaveCount(0);

  await page.goto(`/tasks/calendar?week=${WEEK}`);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/calendar\\?view=week&on=${PREVIOUS_WEEK}$`));
  await expect(page.getByText("Nothing this week.")).toBeVisible();

  await page.getByRole("navigation", { name: "Week", exact: true }).getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/tasks\/calendar\?view=week$/);
  await expect(page.locator("section[aria-current=date]:visible")).toHaveCount(1);
});

test("the month moves, across a year", async ({ page }) => {
  await page.goto("/tasks/calendar?view=month&on=2030-12-15");
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/view=month&on=2031-01-01$/);
  await expect(page.getByRole("heading", { name: "January 2031" })).toBeVisible();
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("heading", { name: "December 2030" })).toBeVisible();
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("heading", { name: "November 2030" })).toBeVisible();
});

test("the calendar opens on this month", async ({ page }) => {
  await page.goto("/tasks/calendar");
  await expect(page.getByRole("navigation", { name: "View", exact: true }).getByRole("link", { name: "Month" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("section[aria-current=date]")).toHaveCount(1);
});

test("any day of a week shows that whole week", async ({ page }) => {
  await page.goto("/tasks/calendar?week=2030-03-07");
  await expect(
    page.getByRole("heading", { name: "Mon, 4 Mar 2030 to Sun, 10 Mar 2030" }),
  ).toBeVisible();
});

test("an entry opens its own page", async ({ page }) => {
  await page.goto(`/tasks/calendar?week=${WEEK}`);
  await page.getByRole("link", { name: "Send Maple contract" }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}$`));
  await expect(page.getByRole("heading", { name: "Send Maple contract" })).toBeVisible();

  await page.goto(`/tasks/calendar?week=${WEEK}`);
  await page.getByRole("link", { name: /Maple kickoff/ }).click();
  await expect(page).toHaveURL(new RegExp(`/meetings/${meetingId}$`));
  await expect(page.getByRole("heading", { name: "Maple kickoff" })).toBeVisible();
});

test("an empty day adds a task on that day, and an hour at that time", async ({ page }) => {
  await page.goto("/tasks/calendar?view=month&on=2030-03-01");
  await page.getByRole("link", { name: "Add task on Thu, 7 Mar 2030", exact: true }).click();
  await expect(page.getByLabel("Deadline date")).toHaveValue("2030-03-07");
  await expect(page.getByLabel("Deadline time")).toHaveValue("");
  await page.getByLabel("Task").fill("Book Maple venue");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(/\/tasks\/calendar\?view=month&on=2030-03-07$/);
  await expect(
    day(page, "Thu, 7 Mar 2030").getByRole("link", { name: "Book Maple venue" }),
  ).toBeVisible();

  await page.goto(`/tasks/calendar?week=${WEEK}`);
  await page.getByRole("link", { name: "Add task on Thu, 7 Mar 2030 at 15:00" }).click();
  await expect(page.getByLabel("Deadline date")).toHaveValue("2030-03-07");
  await expect(page.getByLabel("Deadline time")).toHaveValue("15:00");
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/tasks\/calendar\?view=week&on=2030-03-07$/);
});

test("a day or hour the address can't name leaves the form empty", async ({ page }) => {
  await page.goto("/tasks/new?due=2030-02-31&time=25:00");
  await expect(page.getByLabel("Deadline date")).toHaveValue("");
  await expect(page.getByLabel("Deadline time")).toHaveValue("");
});

test("a week the address can't name shows today", async ({ page }) => {
  for (const week of ["nonsense", "2030-02-31", "9999-12-31"]) {
    await page.goto(`/tasks/calendar?week=${week}`);
    await expect(page.locator("section[aria-current=date]:visible")).toHaveCount(1);
  }
});

test("without Google, tasks stay and it says how to see meetings", async ({ page }) => {
  await pool.query(`delete from integration_connections`);
  await page.goto(`/tasks/calendar?week=${WEEK}`);
  await expect(page.getByRole("link", { name: "Send Maple contract" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Maple kickoff/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute(
    "href",
    "/settings/integrations",
  );
});
