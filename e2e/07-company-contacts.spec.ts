import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });
const star = (page: Page, name: string) =>
  panel(page).getByRole("button", {
    name: `Primary contact: ${name}`,
    exact: true,
  });
const IN_PANEL = /\?company=[0-9a-f-]+&contact=[0-9a-f-]+$/;

async function openContacts(page: Page) {
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Acme Design" }).click();
  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
}

// Acme Design has Priya Sharma (starred when she was added) and Arjun Rao from the People tests.
test("the star moves to another contact, and a contact opens inside the company panel", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openContacts(page);
  await expect(
    companyTabs(page).getByRole("link", { name: "Contacts" }),
  ).toContainText("2");
  await expect(star(page, "Priya Sharma")).toHaveAttribute("aria-pressed", "true");
  await expect(star(page, "Arjun Rao")).toHaveAttribute("aria-pressed", "false");

  await star(page, "Arjun Rao").click();
  await expect(star(page, "Arjun Rao")).toHaveAttribute("aria-pressed", "true");
  await expect(star(page, "Priya Sharma")).toHaveAttribute("aria-pressed", "false");

  // The star did its own job without opening anyone; a click anywhere else on the row opens the person.
  await panel(page)
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("cell")
    .nth(1)
    .click();
  await expect(page).toHaveURL(IN_PANEL);
  await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  await expect(
    panel(page).getByText("Primary contact at Acme Design"),
  ).toBeVisible();
  const details = panel(page).getByRole("region", { name: "Details" });
  for (const label of ["First name", "Last name", "Title", "LinkedIn", "GitHub"]) {
    await expect(details.getByText(label, { exact: true })).toBeVisible();
  }

  await panel(page).getByLabel("Link type").selectOption("github");
  await panel(page).getByLabel("New link").fill("https://github.com/arjunrao");
  await panel(page).getByRole("button", { name: "Add link" }).click();
  await expect(
    details.getByRole("link", { name: "github.com/arjunrao" }),
  ).toHaveAttribute("href", "https://github.com/arjunrao");

  // Editing from the panel comes back to it.
  await panel(page).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Job title").fill("Head of Security");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(IN_PANEL);
  await expect(
    panel(page).getByText("Head of Security at Acme Design"),
  ).toBeVisible();

  await contactTabs(page).getByRole("link", { name: "Activity" }).click();
  await expect(panel(page).getByText("Nothing logged yet.")).toBeVisible();
  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
  await expect(
    contactTabs(page).getByRole("link", { name: "Tasks" }),
  ).toHaveAttribute("aria-current", "page");

  await panel(page).getByRole("link", { name: "Back to Acme Design" }).click();
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(
    panel(page)
      .getByRole("row", { name: /Arjun Rao/ })
      .getByRole("cell", { name: "Head of Security" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("an address naming someone who is not at the company shows the company", async ({
  page,
}) => {
  await openContacts(page);
  const company = new URL(page.url()).searchParams.get("company");
  await page.goto(
    `/people/organizations?company=${company}&contact=00000000-0000-4000-8000-000000000000`,
  );
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(companyTabs(page)).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the contacts table and a contact fit the panel", async ({ page }) => {
    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );

    await openContacts(page);
    await expect(panel(page).getByRole("link", { name: "Arjun Rao" })).toBeVisible();
    expect(await fits(), "contacts table").toBe(true);

    await panel(page).getByRole("link", { name: "Arjun Rao" }).click();
    await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
    expect(await fits(), "contact").toBe(true);
    // The details are taller than the screen; the tab bar must keep its place above them.
    await contactTabs(page).getByRole("link", { name: "Activity" }).click();
    await expect(panel(page).getByText("Nothing logged yet.")).toBeVisible();
  });
});
