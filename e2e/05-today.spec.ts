import { expect, test } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

test("Today shows the week ahead, recent activity and people counts", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/activities/new");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByPlaceholder("Search contacts…").fill("Priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
  await page.getByLabel("Type").selectOption("meeting");
  await page.getByLabel("Summary").fill("Kickoff meeting");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page).toHaveURL(/\/timeline$/);

  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Prepare kickoff notes");
  await page.getByLabel("Due date").fill(localDate(1));
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(/\/tasks\/all$/);

  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Tomorrow" })).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Prepare kickoff notes" }),
  ).toBeVisible();
  // A task due tomorrow is not counted as due today.
  await expect(
    main.getByRole("button", { name: "Snooze until tomorrow: Prepare kickoff notes" }),
  ).toHaveCount(0);

  await expect(main.getByText("Recent activity")).toBeVisible();
  await main.getByRole("link", { name: "Kickoff meeting" }).click();
  await expect(page).toHaveURL(/\/activities\/[0-9a-f-]+$/);
  await expect(page.getByLabel("Summary")).toHaveValue("Kickoff meeting");

  await page.goto("/");
  await expect(
    main.getByRole("link", { name: /^Companies\s*\d+$/ }),
  ).toBeVisible();
  await main.getByRole("link", { name: /^Contacts\s*\d+$/ }).click();
  await expect(page).toHaveURL(/\/people\/contacts$/);
  expect(consoleErrors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Today fits the screen with every card filled", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Recent activity")).toBeVisible();
    await expect(page.getByRole("link", { name: "Kickoff meeting" })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
