import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const bar = (page: Page) => page.getByRole("region", { name: "Selected rows" });
const row = (page: Page, name: string) =>
  page.getByRole("row", { name: new RegExp(name) });
const tick = (page: Page, name: string) =>
  page.getByRole("checkbox", { name: `Select ${name}`, exact: true });
const head = (page: Page, name: string) =>
  page.getByRole("columnheader", { name, exact: true });

async function addCompany(page: Page, name: string) {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name })).toBeVisible();
}

async function showColumn(page: Page, name: string) {
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await page.keyboard.press("Escape");
}

test("a column is hidden from the Columns menu, and each list keeps its own choice", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations");
  await expect(head(page, "Industry")).toBeVisible();
  await expect(page.getByRole("button", { name: "Columns (6)" })).toBeVisible();

  await showColumn(page, "Industry");
  await expect(head(page, "Industry")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Columns (5)" })).toBeVisible();
  // The rest of the table is as it was.
  await expect(head(page, "Company")).toBeVisible();
  await expect(head(page, "Domain")).toBeVisible();

  await page.reload();
  await expect(head(page, "Domain")).toBeVisible();
  await expect(head(page, "Industry")).toHaveCount(0);

  await page.goto("/people/contacts");
  await expect(head(page, "Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Columns (4)" })).toBeVisible();
  await showColumn(page, "Email");
  await expect(head(page, "Email")).toHaveCount(0);
  await expect(head(page, "Relationship")).toBeVisible();

  // Put back the same way.
  await showColumn(page, "Email");
  await expect(head(page, "Email")).toBeVisible();
  await page.goto("/people/organizations");
  await showColumn(page, "Industry");
  await expect(head(page, "Industry")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

// A company and two people of this file's own, so nothing the earlier files made is touched.
test("several people are archived, restored and deleted together", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await addCompany(page, "Harbour Kiln");
  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  for (const [first, last] of [
    ["Odette", "Harbour"],
    ["Zane", "Kiln"],
  ]) {
    await form.getByLabel("First name").fill(first);
    await form.getByLabel("Last name").fill(last);
    await form.getByRole("button", { name: "Add contact" }).click();
    await expect(
      panel(page).getByRole("link", { name: `${first} ${last}` }),
    ).toBeVisible();
  }

  await page.goto("/people/contacts");
  await tick(page, "Odette Harbour").check();
  // Ticking a row is not opening it.
  await expect(page).toHaveURL(/\/people\/contacts$/);
  await expect(bar(page)).toContainText("1 selected");
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("alertdialog").getByRole("heading", { name: "Delete 1 person?" }),
  ).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  await tick(page, "Zane Kiln").check();
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Archive" }).click();
  await expect(row(page, "Odette Harbour")).toHaveCount(0);
  await expect(row(page, "Zane Kiln")).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
  await expect(row(page, "Priya Sharma")).toBeVisible();

  await page.getByRole("button", { name: "Archived" }).click();
  await expect(page).toHaveURL(/archived=1/);
  await tick(page, "Odette Harbour").check();
  await tick(page, "Zane Kiln").check();
  await bar(page).getByRole("button", { name: "Restore" }).click();
  await expect(row(page, "Odette Harbour")).toHaveCount(0);
  await expect(row(page, "Zane Kiln")).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  await expect(row(page, "Odette Harbour")).toBeVisible();
  await tick(page, "Odette Harbour").check();
  await tick(page, "Zane Kiln").check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("heading", { name: "Delete 2 people?" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  // Thinking again leaves them there and still ticked.
  await expect(row(page, "Odette Harbour")).toBeVisible();
  await expect(bar(page)).toContainText("2 selected");

  await bar(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete 2 people" }).click();
  await expect(row(page, "Odette Harbour")).toHaveCount(0);
  await expect(row(page, "Zane Kiln")).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
  await expect(row(page, "Priya Sharma")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("several companies are archived, restored and deleted together", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await addCompany(page, "Zephyr Labs");
  await page.goto("/people/organizations");
  await tick(page, "Harbour Kiln").check();
  await expect(page).toHaveURL(/\/people\/organizations$/);
  await tick(page, "Zephyr Labs").check();
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Archive" }).click();
  await expect(row(page, "Harbour Kiln")).toHaveCount(0);
  await expect(row(page, "Zephyr Labs")).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
  await expect(row(page, "Acme Design")).toBeVisible();

  await page.getByRole("button", { name: "Archived" }).click();
  await expect(page).toHaveURL(/archived=1/);
  // The box in the heading ticks the whole page, and Clear unticks it.
  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await expect(tick(page, "Harbour Kiln")).toBeChecked();
  await expect(tick(page, "Zephyr Labs")).toBeChecked();
  await bar(page).getByRole("button", { name: "Clear" }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(tick(page, "Harbour Kiln")).not.toBeChecked();

  await tick(page, "Harbour Kiln").check();
  await tick(page, "Zephyr Labs").check();
  await bar(page).getByRole("button", { name: "Restore" }).click();
  await expect(row(page, "Harbour Kiln")).toHaveCount(0);
  await expect(row(page, "Zephyr Labs")).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  await expect(row(page, "Harbour Kiln")).toBeVisible();
  await tick(page, "Harbour Kiln").check();
  await tick(page, "Zephyr Labs").check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("heading", { name: "Delete 2 companies?" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, "Harbour Kiln")).toBeVisible();
  await expect(bar(page)).toContainText("2 selected");

  await bar(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete 2 companies" }).click();
  await expect(row(page, "Harbour Kiln")).toHaveCount(0);
  await expect(row(page, "Zephyr Labs")).toHaveCount(0);
  await expect(row(page, "Acme Design")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the list with its checkboxes and the bar fit the screen", async ({
    page,
  }) => {
    await page.goto("/people/organizations");
    await tick(page, "Acme Design").check();
    await expect(bar(page)).toContainText("1 selected");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    // The bar stands clear of the navigation along the foot of the screen.
    const selection = (await bar(page).boundingBox())!;
    const foot = (await page
      .getByRole("navigation", { name: "Main" })
      .last()
      .boundingBox())!;
    expect(selection.x).toBeGreaterThanOrEqual(0);
    expect(selection.x + selection.width).toBeLessThanOrEqual(390);
    expect(selection.y + selection.height).toBeLessThanOrEqual(foot.y);

    await bar(page).getByRole("button", { name: "Clear" }).click();
    await expect(bar(page)).toHaveCount(0);
  });
});
