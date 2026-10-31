import { expect, test, type Page } from "@playwright/test";
import { CRON_SECRET } from "../playwright.config";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The sidebar also has a "Tasks" link, so tab clicks are scoped to the record's own tab bar.
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact" });

// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );
const localDateTime = (offsetMs: number) =>
  new Date(Date.now() + offsetMs)
    .toLocaleString("sv-SE", { timeZone: ZONE })
    .replace(" ", "T")
    .slice(0, 16);

test("add a task from a contact and complete it on Today", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/contacts");
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("No open tasks.")).toBeVisible();

  await page.getByRole("link", { name: "Add task" }).click();
  // The form opens in the person's panel, not on a page of its own.
  await expect(page).toHaveURL(
    /\/people\/contacts\?contact=[0-9a-f-]+&tab=tasks&task=new$/,
  );
  await expect(
    page.getByRole("button", { name: /contact: Priya Sharma/ }),
  ).toBeVisible();
  // A task for a person is also linked to their organization.
  await expect(
    page.getByRole("button", { name: /company: Acme Design/ }),
  ).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Send proposal");
  await page.getByLabel("Due date").fill(localDate());
  await page.getByRole("button", { name: "Add task" }).click();

  // Back in the person's panel, on the tab the task was added from.
  await expect(page).toHaveURL(
    /\/people\/contacts\?contact=[0-9a-f-]+&tab=tasks$/,
  );
  await expect(page.getByRole("link", { name: "Send proposal" })).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Due today (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete: Send proposal" }).click();
  await expect(page.getByText("Nothing is due today.")).toBeVisible();

  await page.goto("/tasks/all?status=done");
  await expect(page.getByRole("link", { name: "Send proposal" })).toBeVisible();
  await page.getByRole("link", { name: "Priya Sharma" }).click();
  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("Recently done")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("an overdue task can be snoozed off Today and brought back", async ({
  page,
}) => {
  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Renew domain");
  await page.getByLabel("Due date").fill(localDate(-1));
  await page.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(/\/tasks\/all$/);
  await expect(page.getByText(/^Overdue: /)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Task views" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page.getByRole("heading", { name: "Overdue (1)" })).toBeVisible();
  await page
    .getByRole("button", { name: "Snooze until tomorrow: Renew domain" })
    .click();
  await expect(page.getByText("Nothing is due today.")).toBeVisible();

  await page.goto("/tasks/all");
  await expect(page.getByText(/^Snoozed until /)).toBeVisible();
  await page.getByRole("link", { name: "Renew domain" }).click();
  await page.getByRole("button", { name: "Stop snoozing" }).click();
  await expect(page.getByRole("button", { name: "Stop snoozing" })).toBeHidden();

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Overdue (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Complete: Renew domain" }).click();
  await expect(page.getByText("Nothing is due today.")).toBeVisible();
});

test("a repeating task continues when it is completed", async ({ page }) => {
  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Daily standup");
  await page.getByLabel("Due date").fill(localDate());
  await page.getByLabel("Due time").fill("09:30");
  await page.getByLabel("Repeats").selectOption("DAILY");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Daily", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Complete: Daily standup" }).click();
  // The open list now holds the next occurrence, due tomorrow at the same time.
  const tomorrow = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: ZONE,
  }).format(new Date(Date.now() + DAY));
  await expect(page.getByText(`${tomorrow}, 09:30`)).toBeVisible();

  await page.goto("/tasks/week");
  await expect(page.getByRole("heading", { name: "Tomorrow" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Daily standup" })).toBeVisible();

  // The form reads the next occurrence back in the owner's time zone.
  await page.getByRole("link", { name: "Daily standup" }).click();
  await expect(page.getByLabel("Due date")).toHaveValue(localDate(1));
  await expect(page.getByLabel("Due time")).toHaveValue("09:30");
  await expect(page.getByLabel("Repeats")).toHaveValue("DAILY");
  await page.getByRole("button", { name: "Cancel task" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
});

test("a reminder appears on Today after the scheduler runs", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Call the bank");
  await page.getByLabel("Reminder").fill(localDateTime(-2 * 60_000));
  await page.getByRole("button", { name: "Add task" }).click();

  await page.getByRole("link", { name: "Call the bank" }).click();
  await expect(page.getByText(/Reminder is due/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Dismiss reminder/ })).toHaveCount(0);

  const tick = await request.post("/api/jobs/tick", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(tick.status()).toBe(200);

  await page.reload();
  await expect(page.getByText("Reminders")).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss reminder: Call the bank" })
    .click();
  await expect(page.getByRole("button", { name: /Dismiss reminder/ })).toHaveCount(0);

  await page.goto("/tasks/all");
  await page.getByRole("link", { name: "Call the bank" }).click();
  await expect(page.getByText(/Reminder sent /)).toBeVisible();
});

test("a rejected task form explains why and keeps what was typed", async ({
  page,
}) => {
  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Half-specified");
  await page.getByLabel("Due time").fill("09:30");
  await page.getByLabel("Priority").selectOption("low");
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(
    page.getByText("Choose a due date to go with the time"),
  ).toBeVisible();
  await expect(page.getByLabel("Task", { exact: true })).toHaveValue(
    "Half-specified",
  );
  await expect(page.getByLabel("Due time")).toHaveValue("09:30");
  await expect(page.getByLabel("Priority")).toHaveValue("low");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("task screens fit the screen", async ({ page }) => {
    for (const path of ["/", "/tasks", "/tasks/week", "/tasks/all", "/tasks/calendar", "/tasks/new"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows, path).toBe(false);
    }
    await page.goto("/tasks/all");
    await page.getByRole("link", { name: "Call the bank" }).click();
    await expect(page.getByRole("heading", { name: "Call the bank" })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
