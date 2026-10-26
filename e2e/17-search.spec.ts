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

test("a company and a person are found by a custom value, in Ctrl+K and in their lists", async ({
  page,
}) => {
  const panel = page.getByRole("dialog");
  const details = panel.getByRole("region", { name: "Details" });
  async function giveValue(link: string, value: string) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await details.getByRole("link", { name: "Fields" }).click();
    await panel.getByRole("button", { name: "New field" }).click();
    const dialog = page.getByRole("dialog", { name: "New field" });
    await dialog.getByLabel("Name").fill("Search note");
    await dialog.getByRole("button", { name: "Add field" }).click();
    await expect(dialog).toHaveCount(0);
    await panel.getByRole("link", { name: `Back to ${link}` }).click();
    await details.getByRole("button", { name: "Edit Search note" }).click();
    await details.getByLabel("Search note").fill(value);
    await details.getByRole("button", { name: "Save" }).click();
    await expect(details.getByRole("button", { name: "Edit Search note" })).toHaveText(
      value,
    );
  }
  await page.goto("/people/organizations");
  await giveValue("Acme Design", "Quokka orchard");
  await page.goto("/people/contacts");
  await giveValue("Priya Sharma", "Marmalade fair");

  await openPalette(page);
  await searchBox(page).fill("quokka");
  await expect(
    group(page, "Companies").getByRole("option", { name: /^Acme Design/ }),
  ).toBeVisible();
  await searchBox(page).fill("marmal");
  await expect(
    group(page, "People").getByRole("option", { name: /^Priya Sharma/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/people/organizations?q=orchard");
  await expect(page.getByRole("link", { name: "Acme Design", exact: true })).toBeVisible();
  await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();
  await page.goto("/people/contacts?q=marmalade");
  await expect(page.getByRole("link", { name: "Priya Sharma", exact: true })).toBeVisible();
  await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();
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
