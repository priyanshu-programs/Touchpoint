import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const main = (page: Page) => page.getByRole("main");
const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const COMPANY = "Northwind Studio";

async function chooseCompany(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose company" }).click();
  await page.getByPlaceholder("Search companies…").fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).first().click();
}

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

let engagementUrl = "";

test("an engagement is created from Work for a company", async ({ page }) => {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill(COMPANY);
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: COMPANY })).toBeVisible();

  await page.goto("/work");
  await expect(page.getByText("No engagements yet.")).toBeVisible();
  await main(page).getByRole("link", { name: "New engagement" }).click();
  await expect(page).toHaveURL(/\/work\/new$/);

  await chooseCompany(page, COMPANY);
  await page.getByLabel("Title").fill("Website redesign");
  await page.getByLabel("Status").selectOption("active");
  await page.getByLabel("Start date").fill("2026-11-01");
  await page.getByLabel("Target end date").fill("2027-01-20");
  await page.getByLabel("Currency").selectOption("INR");
  // A value that is not an amount is refused and the form keeps what was typed.
  await page.getByLabel("Value").fill("lots");
  await page.getByRole("button", { name: "Create engagement" }).click();
  await expect(
    page.getByText("Enter the value as an amount in INR, such as 150000"),
  ).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Website redesign");
  await expect(
    page.getByRole("button", { name: `company: ${COMPANY}. Change` }),
  ).toBeVisible();

  await page.getByLabel("Value").fill("1,50,000");
  await page.getByLabel("Payment terms").fill("50% upfront, the rest on launch");
  await page.getByLabel("Scope").fill("Five pages and a blog.");
  await page.getByRole("button", { name: "Create engagement" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  engagementUrl = page.url();

  await expect(
    main(page).getByRole("heading", { name: "Website redesign", level: 1 }),
  ).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Status: Active" })).toBeVisible();
  const details = main(page).getByRole("region", { name: "Details" });
  await expect(details.getByText("₹1,50,000")).toBeVisible();
  await expect(details.getByText("Sun, 1 Nov 2026")).toBeVisible();
  await expect(details.getByText("50% upfront, the rest on launch")).toBeVisible();
  await expect(
    main(page).getByRole("region", { name: "Scope" }).getByText("Five pages and a blog."),
  ).toBeVisible();
});

test("an engagement is edited and its status changed in place", async ({ page }) => {
  await page.goto(engagementUrl);
  await main(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel("Value")).toHaveValue("150000");
  await page.getByLabel("Title").fill("Website rebuild");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    main(page).getByRole("heading", { name: "Website rebuild", level: 1 }),
  ).toBeVisible();

  await main(page).getByRole("button", { name: "Status: Active" }).click();
  await page.getByRole("menuitemradio", { name: "Paused" }).click();
  await expect(main(page).getByRole("button", { name: "Status: Paused" })).toBeVisible();
  await page.reload();
  await expect(main(page).getByRole("button", { name: "Status: Paused" })).toBeVisible();
});

test("people are added to an engagement with a role and taken off", async ({ page }) => {
  await page.goto(engagementUrl);
  const people = main(page).getByRole("region", { name: "People" });
  await expect(people.getByText("Nobody on this engagement yet.")).toBeVisible();

  await people.getByRole("button", { name: "Choose person" }).click();
  await page.getByPlaceholder("Search people…").fill("Priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
  await people.getByLabel("Role on the engagement").fill("Sponsor");
  await people.getByRole("button", { name: "Add person" }).click();
  await expect(people.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  await expect(people.getByText("Sponsor")).toBeVisible();

  // The same person twice is refused.
  await people.getByRole("button", { name: "Choose person" }).click();
  await page.getByPlaceholder("Search people…").fill("Priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
  await people.getByRole("button", { name: "Add person" }).click();
  await expect(
    people.getByText("That person is already on this engagement."),
  ).toBeVisible();

  await people.getByRole("button", { name: "Remove Priya Sharma" }).click();
  await expect(people.getByText("Nobody on this engagement yet.")).toBeVisible();
});

test("a company's Engagements tab lists its work and starts another", async ({ page }) => {
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: COMPANY, exact: true }).click();
  await companyTabs(page).getByRole("link", { name: "Engagements" }).click();
  await expect(panel(page).getByRole("link", { name: "Website rebuild" })).toBeVisible();

  await panel(page).getByRole("link", { name: "New engagement" }).click();
  await expect(page).toHaveURL(/\/work\/new\?company=[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("button", { name: `company: ${COMPANY}. Change` }),
  ).toBeVisible();
  await page.getByLabel("Title").fill("Brand book");
  await page.getByLabel("Status").selectOption("completed");
  await page.getByRole("button", { name: "Create engagement" }).click();
  await expect(
    main(page).getByRole("heading", { name: "Brand book", level: 1 }),
  ).toBeVisible();

  // The company's link leads back to its panel.
  await main(page).getByRole("link", { name: COMPANY }).first().click();
  await expect(panel(page).getByRole("heading", { name: COMPANY })).toBeVisible();
});

test("the Work list is searched and narrowed by status", async ({ page }) => {
  await page.goto("/work");
  const table = main(page).getByRole("table");
  // Paused work comes before completed work.
  await expect(table.getByRole("link", { name: /^(Website rebuild|Brand book)$/ })).toHaveText([
    "Website rebuild",
    "Brand book",
  ]);
  await expect(page.getByText("Showing 1–2 of 2")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search engagements by title" }).fill("rebuild");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=rebuild/);
  await expect(table.getByRole("link", { name: "Brand book" })).toHaveCount(0);
  await expect(table.getByRole("link", { name: "Website rebuild" })).toBeVisible();

  await main(page).getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("menuitemradio", { name: "Completed" }).click();
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByText("No engagements match these filters.")).toBeVisible();

  await page.goto("/work?status=completed");
  await expect(main(page).getByRole("link", { name: "Brand book" })).toBeVisible();
  await main(page).getByRole("link", { name: "Brand book" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
});

test("an engagement is deleted after a confirmation", async ({ page }) => {
  await page.goto("/work");
  await main(page).getByRole("link", { name: "Brand book" }).click();
  await main(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading", { name: "Delete Brand book?" })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete engagement" }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(main(page).getByRole("link", { name: "Brand book" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Website rebuild" })).toBeVisible();
});

test("Work fits a phone and is reached through Go to", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/work", engagementUrl, "/work/new"]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }

  await page.goto("/");
  await page.getByRole("button", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
});
