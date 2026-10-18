import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const searchBox = (page: Page) => page.getByPlaceholder("Search or jump to…");
const group = (page: Page, heading: string) =>
  page.locator("[cmdk-group]").filter({
    has: page.locator("[cmdk-group-heading]", { hasText: heading }),
  });

async function openPalette(page: Page) {
  await page.goto("/");
  // The shortcut is bound after hydration, so an early key press can be missed.
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test("a company is found by the start of its name and opens in its panel", async ({
  page,
}) => {
  await openPalette(page);
  await searchBox(page).fill("acm");
  const acme = group(page, "Companies").getByRole("option", { name: /^Acme Design/ });
  await expect(acme).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/people/organizations\\?company=${ID}$`));
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Acme Design" }),
  ).toBeVisible();
});

test("a person is found by name, and by a mistyped one", async ({ page }) => {
  await openPalette(page);
  await searchBox(page).fill("Pryia");
  await expect(
    group(page, "People").getByRole("option", { name: /^Priya Sharma/ }),
  ).toBeVisible();

  await searchBox(page).fill("priya");
  await group(page, "People").getByRole("option", { name: /^Priya Sharma/ }).click();
  await expect(page).toHaveURL(new RegExp(`/people/contacts\\?contact=${ID}$`));
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Priya Sharma" }),
  ).toBeVisible();
});

test("an activity is found by a word in its notes", async ({ page }) => {
  await page.goto("/activities/new");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByPlaceholder("Search contacts…").fill("Priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
  await page.getByLabel("Type").selectOption("note");
  await page.getByLabel("Summary").fill("Search probe");
  await page.getByLabel("Notes").fill("Discussed the zanzibar retainer");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page).not.toHaveURL(/\/activities\/new$/);

  await openPalette(page);
  await searchBox(page).fill("zanzib");
  await group(page, "Activities").getByRole("option", { name: /^Search probe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${ID}$`));
  await expect(page.getByRole("heading", { name: "Search probe" })).toBeVisible();
});

test("screens still filter, and nothing found says so", async ({ page }) => {
  await openPalette(page);
  await searchBox(page).fill("work");
  await expect(
    group(page, "Screens").getByRole("option", { name: "Workflows", exact: true }),
  ).toBeVisible();
  await expect(group(page, "Screens").getByRole("option")).toHaveCount(1);

  await searchBox(page).fill("qqxxzz");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
});

test("on a phone, Go to opens the same search", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .last()
    .getByRole("button", { name: "Go to" })
    .click();
  await searchBox(page).fill("acme");
  await expect(
    group(page, "Companies").getByRole("option", { name: /^Acme Design/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
