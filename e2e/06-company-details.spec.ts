import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let companyId: string;

// The app refuses loopback addresses, so a successful read cannot be staged here;
// that path is covered in the unit tests. This covers a site that cannot be read.
test("a website that cannot be read is reported and the company still works", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Nowhere Works");
  // A reserved name that never resolves.
  await page.getByLabel("Website").fill("nowhere.invalid");
  await page.getByRole("button", { name: "Create company" }).click();

  await expect(
    panel(page).getByRole("heading", { name: "Nowhere Works" }),
  ).toBeVisible();
  companyId = new URL(page.url()).searchParams.get("company")!;

  // The panel checks back by itself until the read has finished.
  await expect(
    panel(page).getByText(/^Could not read nowhere\.invalid: .+\.$/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel(page).locator("img")).toHaveCount(0);
  await expect(panel(page).getByText("From website")).toHaveCount(0);

  await panel(page).getByRole("button", { name: "Try again" }).click();
  await expect(
    panel(page).getByText("That was tried a moment ago. Wait a minute and try again."),
  ).toBeVisible();

  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByText("No contacts at this company yet.")).toBeVisible();

  const logo = await page.request.get(`/api/organizations/${companyId}/logo`);
  expect(logo.status()).toBe(404);
  expect(consoleErrors).toEqual([]);
});

test("a logo is only served to the signed-in owner", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const response = await context.request.get(
    `${baseURL}/api/organizations/${companyId}/logo`,
  );
  expect(response.status()).toBe(401);
  await context.close();
});

test("a stored logo replaces the initials in the panel and the list", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  // Placed directly, standing in for a read that found one.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query(
    `insert into organization_logos (organization_id, owner_id, content_type, bytes, sha256, source_url)
     select id, owner_id, 'image/png', $2, 'abcdef0123456789', 'https://nowhere.invalid/icon.png'
     from organizations where id = $1`,
    [companyId, ONE_PIXEL_PNG],
  );
  await pool.end();
  const src = `/api/organizations/${companyId}/logo?v=abcdef012345`;

  await page.goto(`/people/organizations?company=${companyId}`);
  const logo = panel(page).locator("img");
  await expect(logo).toHaveAttribute("src", src);
  // Decoded by the browser: the page's CSP let it load and the bytes are an image.
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);

  const response = await page.request.get(src);
  expect(response.headers()).toMatchObject({
    "content-type": "image/png",
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  expect(await response.body()).toEqual(ONE_PIXEL_PNG);

  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("row", { name: /Nowhere Works/ }).locator("img"),
  ).toHaveAttribute("src", src);
  expect(consoleErrors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the website line fits the panel", async ({ page }) => {
    await page.goto(`/people/organizations?company=${companyId}`);
    await expect(
      panel(page).getByText(/^Could not read nowhere\.invalid/),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});

// Last, because it removes the company the tests above use.
test("a company can be deleted after confirming", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete Nowhere Works?",
  });

  await page.goto(`/people/organizations?company=${companyId}`);
  await panel(page).getByRole("button", { name: "Delete" }).click();
  await expect(
    confirmation.getByText("Its tasks and logged activity are kept"),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await expect(
    panel(page).getByRole("heading", { name: "Nowhere Works" }),
  ).toBeVisible();

  await panel(page).getByRole("button", { name: "Delete" }).click();
  await confirmation.getByRole("button", { name: "Delete company" }).click();

  await expect(page).toHaveURL(/\/people\/organizations$/);
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nowhere Works" })).toHaveCount(0);
  // Its old address shows the list, with nothing to open.
  await page.goto(`/people/organizations?company=${companyId}`);
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
