import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const details = (page: Page) =>
  panel(page).getByRole("region", { name: "Details" });
const row = (page: Page, label: string) =>
  details(page).locator("div").filter({ has: page.locator("dt", { hasText: label }) });

async function newField(
  page: Page,
  name: string,
  kind: string,
  options?: string,
) {
  await panel(page).getByRole("button", { name: "New field" }).click();
  const dialog = page.getByRole("dialog", { name: "New field" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Kind").selectOption(kind);
  if (options) await dialog.getByLabel("Options").fill(options);
  await dialog.getByRole("button", { name: "Add field" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a company's own fields are set and cleared where Details shows them", async ({
  page,
}) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Inline Works");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(
    panel(page).getByRole("heading", { name: "Inline Works" }),
  ).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await newField(page, "Contract notes", "Text");
  await newField(page, "Account tier", "Dropdown", "Gold\nSilver");
  await newField(page, "Seats", "Number");
  await panel(page).getByRole("link", { name: "Back to Inline Works" }).click();

  // Text: pressed, typed, saved with Enter; the value and its button come back.
  const notes = details(page).getByRole("button", { name: "Edit Contract notes" });
  await expect(notes).toHaveText("—");
  await notes.click();
  await details(page).getByLabel("Contract notes").fill("Renews in March");
  await details(page).getByLabel("Contract notes").press("Enter");
  await expect(notes).toHaveText("Renews in March");
  await expect(notes).toBeFocused();

  // Escape leaves the value as it was, and the panel open.
  await notes.click();
  await details(page).getByLabel("Contract notes").fill("Something else");
  await details(page).getByLabel("Contract notes").press("Escape");
  await expect(notes).toHaveText("Renews in March");
  await expect(notes).toBeFocused();
  await expect(panel(page)).toBeVisible();

  const tier = details(page).getByRole("button", { name: "Edit Account tier" });
  await tier.click();
  await details(page).getByLabel("Account tier").selectOption("Silver");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(tier).toHaveText("Silver");

  const seats = details(page).getByRole("button", { name: "Edit Seats" });
  await seats.click();
  await details(page).getByLabel("Seats").fill("1250");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(seats).toHaveText("1,250");

  await page.reload();
  await expect(row(page, "Contract notes").locator("dd")).toHaveText("Renews in March");
  await expect(row(page, "Account tier").locator("dd")).toHaveText("Silver");

  // "Not set" clears it; Cancel closes without saving.
  await tier.click();
  await details(page).getByLabel("Account tier").selectOption("Not set");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(tier).toHaveText("—");
  await seats.click();
  await details(page).getByLabel("Seats").fill("3");
  await details(page).getByRole("button", { name: "Cancel" }).click();
  await expect(seats).toHaveText("1,250");
});

test("a person's own field is set in their panel", async ({ page }) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Ina");
  await page.getByLabel("Last name").fill("Line");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(panel(page).getByRole("heading", { name: "Ina Line" })).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await newField(page, "Met on", "Date");
  await panel(page).getByRole("link", { name: "Back to Ina Line" }).click();

  const met = details(page).getByRole("button", { name: "Edit Met on" });
  await met.click();
  await details(page).getByLabel("Met on").fill("2026-10-20");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(met).toHaveText("Tue, 20 Oct 2026");
  await page.reload();
  await expect(met).toHaveText("Tue, 20 Oct 2026");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a value is edited in place without the panel spilling sideways", async ({
    page,
  }) => {
    await page.goto("/people/organizations?q=inline");
    await page.getByRole("link", { name: "Inline Works" }).click();
    const notes = details(page).getByRole("button", { name: "Edit Contract notes" });
    await notes.click();
    await expect(details(page).getByRole("button", { name: "Save" })).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await details(page).getByLabel("Contract notes").fill("Phone edit");
    await details(page).getByRole("button", { name: "Save" }).click();
    await expect(notes).toHaveText("Phone edit");
  });
});
