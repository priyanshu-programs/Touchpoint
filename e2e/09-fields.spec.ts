import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const details = (page: Page) =>
  panel(page).getByRole("region", { name: "Details" });
const fieldTabs = (page: Page) =>
  panel(page).getByRole("navigation", { name: "Fields" });
const fields = (page: Page) => panel(page).getByRole("listitem");

const COMPANY_FIELDS = [
  "Name",
  "Domain",
  "Website",
  "Phone",
  "Email",
  "Industry",
  "City",
  "Region",
  "Country",
];

// Every change in the Fields panel is saved by a server action of its own.
const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  );

test("a company's fields are put in order and hidden from the gear on Details", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations");
  await page.getByRole("cell", { name: "acme.test" }).click();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);

  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+&fields=companies$/);
  await expect(panel(page).getByRole("heading", { name: "Fields" })).toBeVisible();
  await expect(
    fieldTabs(page).getByRole("link", { name: "Companies" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  // The section says how many fields it holds, and folds away and back.
  const section = panel(page).getByText("Standard fields");
  await expect(
    panel(page).getByText("9 · reorder and hide only"),
  ).toBeVisible();
  await section.click();
  await expect(fields(page)).toHaveCount(0);
  await section.click();
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  // With the keyboard: from its handle, Name goes down two places and back up one.
  const name = panel(page).getByRole("button", { name: "Move Name" });
  await name.focus();
  let save = saved(page);
  await page.keyboard.press("ArrowDown");
  await save;
  await expect(name).toBeFocused();
  await expect(
    panel(page).getByText("Name moved to place 2 of 9."),
  ).toBeAttached();
  save = saved(page);
  await page.keyboard.press("ArrowDown");
  await save;
  await expect(fields(page)).toHaveText([
    "Domain",
    "Website",
    "Name",
    ...COMPANY_FIELDS.slice(3),
  ]);
  save = saved(page);
  await page.keyboard.press("ArrowUp");
  await save;
  await expect(fields(page)).toHaveText(["Domain", "Name", ...COMPANY_FIELDS.slice(2)]);

  const domain = panel(page).getByRole("button", { name: "Show Domain" });
  await expect(domain).toHaveAttribute("aria-pressed", "true");
  save = saved(page);
  await domain.click();
  await save;
  await expect(domain).toHaveAttribute("aria-pressed", "false");

  // Back on the company, Domain is gone and the rest keeps its order.
  await panel(page).getByRole("link", { name: "Back to Acme Design" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+$/);
  await expect(details(page).locator("dt")).toHaveText([
    "Name",
    ...COMPANY_FIELDS.slice(2),
  ]);
  await page.reload();
  await expect(details(page).locator("dt")).toHaveText([
    "Name",
    ...COMPANY_FIELDS.slice(2),
  ]);

  // Shown again, and dragged with the mouse back above Domain.
  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(fields(page)).toHaveText(["Domain", "Name", ...COMPANY_FIELDS.slice(2)]);
  save = saved(page);
  await domain.click();
  await save;

  const from = (await name.boundingBox())!;
  const to = (await panel(page)
    .getByRole("button", { name: "Move Domain" })
    .boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  save = saved(page);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, {
    steps: 8,
  });
  await page.mouse.up();
  await save;
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  await panel(page).getByRole("link", { name: "Back to Acme Design" }).click();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);
  expect(consoleErrors).toEqual([]);
});

test("a person's fields are arranged apart from a company's", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/contacts?q=arj");
  await page
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("cell", { name: "Prospect" })
    .click();
  await expect(details(page).getByText("Department", { exact: true })).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(page).toHaveURL(/[?&]fields=contacts(&|$)/);
  await expect(
    fieldTabs(page).getByRole("link", { name: "Contacts" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fields(page).first()).toHaveText("First name");

  const department = panel(page).getByRole("button", { name: "Show Department" });
  const save = saved(page);
  await department.click();
  await save;
  await expect(department).toHaveAttribute("aria-pressed", "false");

  // The other tab is the company's list, left as the last test arranged it.
  await fieldTabs(page).getByRole("link", { name: "Companies" }).click();
  await expect(page).toHaveURL(/[?&]fields=companies(&|$)/);
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);
  await expect(
    panel(page).getByRole("button", { name: "Show Domain" }),
  ).toHaveAttribute("aria-pressed", "true");

  await panel(page).getByRole("link", { name: "Back to Arjun Rao" }).click();
  await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  await expect(details(page).getByText("First name", { exact: true })).toBeVisible();
  await expect(details(page).getByText("Department", { exact: true })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the fields panel fits the screen", async ({ page }) => {
    await page.goto("/people/organizations");
    await page.getByRole("link", { name: "Acme Design" }).click();
    await details(page).getByRole("link", { name: "Fields" }).click();
    await expect(fields(page)).toHaveText(COMPANY_FIELDS);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      panel(page).getByRole("button", { name: "Show Country" }),
    ).toBeInViewport();
  });
});
