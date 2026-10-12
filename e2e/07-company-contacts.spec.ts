import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION, recordAction } from "./support";

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
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

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
  await recordAction(page, "Edit");
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

test("the status of a company and of a person is switched from its badge", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const badge = (label: string, value: string) =>
    panel(page).getByRole("button", { name: `${label}: ${value}`, exact: true });
  const choose = (value: string) =>
    page.getByRole("menuitemradio", { name: value, exact: true }).click();

  await openContacts(page);
  await badge("Status", "Prospect").click();
  await choose("Past client");
  await expect(badge("Status", "Past client")).toBeVisible();
  // It holds after a reload, and goes back so the other files find the company as it was.
  await page.reload();
  await badge("Status", "Past client").click();
  await choose("Prospect");
  await expect(badge("Status", "Prospect")).toBeVisible();

  await panel(page).getByRole("link", { name: "Arjun Rao" }).click();
  await badge("Relationship", "Prospect").click();
  await choose("Referrer");
  await expect(badge("Relationship", "Referrer")).toBeVisible();
  await badge("Relationship", "Referrer").click();
  await choose("Prospect");
  await expect(badge("Relationship", "Prospect")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a picture read from the company's site shows for the person and can be removed", async ({
  page,
  browser,
  baseURL,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  // Placed directly, standing in for a read that found one beside the name.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const { rows } = await pool.query(
    `insert into contact_photos (contact_id, owner_id, content_type, bytes, sha256, source_url)
     select id, owner_id, 'image/png', $1, 'abcdef0123456789', 'https://acme.test/people/arjun.png'
     from contacts where full_name = 'Arjun Rao'
     returning contact_id`,
    [ONE_PIXEL_PNG],
  );
  await pool.end();
  const src = `/api/contacts/${rows[0].contact_id}/photo?v=abcdef012345`;

  await openContacts(page);
  const inTable = panel(page).getByRole("row", { name: /Arjun Rao/ }).locator("img");
  await expect(inTable).toHaveAttribute("src", src);
  // Decoded by the browser: the page's CSP let it load and the bytes are an image.
  await expect
    .poll(() => inTable.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);
  // The others keep their initials.
  await expect(panel(page).getByRole("row").locator("img")).toHaveCount(1);

  const response = await page.request.get(src);
  expect(response.headers()).toMatchObject({
    "content-type": "image/png",
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  const signedOut = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  expect((await signedOut.request.get(`${baseURL}${src}`)).status()).toBe(401);
  await signedOut.close();

  await panel(page).getByRole("link", { name: "Arjun Rao" }).click();
  const inHeader = panel(page).locator("header img");
  await expect(inHeader).toHaveAttribute("src", src);
  await recordAction(page, "Remove photo");
  await expect(inHeader).toHaveCount(0);
  // With no picture left there is nothing to remove.
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove photo" })).toHaveCount(0);
  expect((await page.request.get(src)).status()).toBe(404);
  expect(consoleErrors).toEqual([]);
});

test("a person is deleted from the three-dots menu after confirming", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete Zara Quill?",
  });

  await openContacts(page);
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Zara");
  await form.getByLabel("Last name").fill("Quill");
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(panel(page).getByText("Zara added.")).toBeVisible();
  await panel(page).getByRole("link", { name: "Zara Quill" }).click();
  await expect(panel(page).getByRole("heading", { name: "Zara Quill" })).toBeVisible();

  await recordAction(page, "Delete");
  await expect(confirmation.getByText("Their tasks are kept")).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await expect(panel(page).getByRole("heading", { name: "Zara Quill" })).toBeVisible();

  await recordAction(page, "Delete");
  await confirmation.getByRole("button", { name: "Delete contact" }).click();

  // Back in the company she was opened from, without her.
  await expect(page).toHaveURL(/\?company=[0-9a-f-]+&tab=contacts$/);
  await expect(panel(page).getByRole("link", { name: "Arjun Rao" })).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Zara Quill" })).toHaveCount(0);
  await page.goto("/people/contacts?q=zara");
  await expect(page.getByText("No contacts match these filters.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
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
