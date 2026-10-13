import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The company's panel; only one dialog is open whenever this is used.
const panel = (page: Page) => page.getByRole("dialog");
const badge = (page: Page, value: string) =>
  panel(page).getByRole("button", { name: `Status: ${value}`, exact: true });
const statuses = (page: Page) =>
  page.getByRole("dialog", { name: "Company statuses" });
const listed = (page: Page) =>
  statuses(page).getByRole("list", { name: "Statuses" }).getByRole("listitem");
const row = (page: Page) => page.getByRole("row", { name: /Acme Design/ });

async function openCompany(page: Page) {
  await page.goto("/people/organizations");
  await page.getByRole("cell", { name: "acme.test" }).click();
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
}

async function editStatuses(page: Page, current: string) {
  await badge(page, current).click();
  await page.getByRole("menuitem", { name: "Edit statuses…" }).click();
  await expect(statuses(page)).toBeVisible();
}

async function closeStatuses(page: Page) {
  await statuses(page).getByRole("button", { name: "Close" }).click();
  await expect(statuses(page)).toBeHidden();
}

const choose = (page: Page, name: string) =>
  page.getByRole("menuitemradio", { name, exact: true }).click();

test("the owner makes a status with a colour, puts a company on it and finds it in the list", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  // The list says what each company is.
  await page.goto("/people/organizations");
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(row(page).getByRole("cell", { name: "Prospect", exact: true })).toBeVisible();

  await openCompany(page);
  await editStatuses(page, "Prospect");
  await expect(listed(page)).toHaveCount(5);
  await expect(listed(page).first()).toContainText("Prospect");
  await expect(listed(page).first()).toContainText("Built in");

  // A name a built-in status has is refused, and what was typed stays.
  const name = statuses(page).getByRole("textbox", { name: "New status" });
  await name.fill("client");
  await statuses(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(statuses(page).getByRole("alert")).toHaveText(
    "There is already a status called client.",
  );
  await expect(name).toHaveValue("client");

  await statuses(page)
    .getByRole("button", { name: "Colour of the new status: Gray" })
    .click();
  await choose(page, "Red");
  await name.fill("Hot lead");
  await statuses(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(listed(page)).toHaveCount(6);
  await expect(statuses(page).getByLabel("Name of Hot lead")).toHaveValue("Hot lead");
  await expect(
    statuses(page).getByRole("button", { name: "Colour of Hot lead: Red" }),
  ).toBeVisible();
  await expect(name).toHaveValue("");
  await closeStatuses(page);

  await badge(page, "Prospect").click();
  await choose(page, "Hot lead");
  await expect(badge(page, "Hot lead")).toBeVisible();

  // In the list it carries its colour, and the list can be narrowed to it.
  await page.goto("/people/organizations");
  const cell = row(page).getByRole("cell", { name: "Hot lead", exact: true });
  await expect(cell).toBeVisible();
  await expect(cell.locator(".bg-red-500")).toHaveCount(1);
  await page.getByRole("button", { name: "Filters" }).click();
  await choose(page, "Hot lead");
  await expect(page).toHaveURL(/[?&]status=hot_lead(&|$)/);
  await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();
  await expect(row(page)).toBeVisible();

  // It is offered on the full forms too.
  await page.goto("/people/organizations/new");
  await expect(page.getByLabel("Status").getByRole("option")).toHaveText([
    "Prospect",
    "Client",
    "Past client",
    "Partner",
    "Other",
    "Hot lead",
  ]);
  expect(consoleErrors).toEqual([]);
});

test("a status is recoloured and renamed, and deleting it moves its companies to Other", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openCompany(page);
  await editStatuses(page, "Hot lead");

  // A built-in status takes a colour and keeps its name.
  await statuses(page)
    .getByRole("button", { name: "Colour of Client: Green" })
    .click();
  await choose(page, "Pink");
  await expect(
    statuses(page).getByRole("button", { name: "Colour of Client: Pink" }),
  ).toBeVisible();
  await expect(statuses(page).getByLabel("Name of Client")).toHaveCount(0);

  // The owner's own is renamed, unless another status has the name.
  await statuses(page).getByLabel("Name of Hot lead").fill("Partner");
  await page.keyboard.press("Enter");
  await expect(statuses(page).getByRole("alert")).toHaveText(
    "There is already a status called Partner.",
  );
  // The box keeps what was typed and the cursor, so the name can be put right at once.
  await expect(statuses(page).getByLabel("Name of Hot lead")).toHaveValue("Partner");
  await expect(statuses(page).getByLabel("Name of Hot lead")).toBeFocused();
  await statuses(page).getByLabel("Name of Hot lead").fill("Warm lead");
  await page.keyboard.press("Enter");
  await expect(statuses(page).getByLabel("Name of Warm lead")).toHaveValue(
    "Warm lead",
  );
  await expect(statuses(page).getByLabel("Name of Warm lead")).toBeFocused();
  await expect(statuses(page).getByRole("alert")).toHaveCount(0);
  await closeStatuses(page);
  await expect(badge(page, "Warm lead")).toBeVisible();

  // Deleted only after confirming.
  await editStatuses(page, "Warm lead");
  const confirm = page.getByRole("alertdialog", { name: "Delete Warm lead?" });
  const remove = () =>
    statuses(page).getByRole("button", { name: "Delete Warm lead" }).click();
  await remove();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(listed(page)).toHaveCount(6);
  await remove();
  await confirm.getByRole("button", { name: "Delete status" }).click();
  await expect(confirm).toBeHidden();
  await expect(listed(page)).toHaveCount(5);
  await closeStatuses(page);
  await expect(badge(page, "Other")).toBeVisible();

  // An address that still names it narrows nothing.
  await page.goto("/people/organizations?status=hot_lead");
  await expect(row(page).getByRole("cell", { name: "Other", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters" })).toHaveText("Filters");

  // Back as it was, for the files that follow.
  await page.getByRole("cell", { name: "acme.test" }).click();
  await badge(page, "Other").click();
  await choose(page, "Prospect");
  await expect(badge(page, "Prospect")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the statuses fit the screen", async ({ page }) => {
    await page.goto("/people/organizations");
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeHidden();
    await page.getByRole("link", { name: "Acme Design" }).click();
    await editStatuses(page, "Prospect");
    await expect(listed(page)).toHaveCount(5);
    await expect(statuses(page).getByRole("button", { name: "Add", exact: true })).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
