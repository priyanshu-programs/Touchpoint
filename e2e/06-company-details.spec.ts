import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION, recordAction } from "./support";

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

  await panel(page).getByRole("button", { name: "Re-enrich" }).click();
  await expect(
    panel(page).getByText("That was tried a moment ago. Wait a minute and try again."),
  ).toBeVisible();

  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByText("No contacts at this company yet.")).toBeVisible();

  const logo = await page.request.get(`/api/organizations/${companyId}/logo`);
  expect(logo.status()).toBe(404);
  expect(consoleErrors).toEqual([]);
});

test("the overview lists the company's details, with a phone and email once given", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const details = panel(page).getByRole("region", { name: "Details" });

  await page.goto(`/people/organizations?company=${companyId}`);
  await expect(
    panel(page).getByRole("region", { name: "About" }),
  ).toContainText("No description yet.");
  await expect(details.getByText("Phone", { exact: true })).toBeVisible();
  await expect(details.getByText("Email", { exact: true })).toBeVisible();
  // Only the website so far; the empty rows show a dash.
  await expect(details.getByRole("link")).toHaveCount(1);

  await recordAction(page, "Edit");
  await page.getByLabel("Phone").fill("12345");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Enter a phone number, such as +91 20 5550 1234"),
  ).toBeVisible();
  await page.getByLabel("Phone").fill("+91 (20) 5550-1234");
  await page.getByLabel("Email").fill("Hello@Nowhere.invalid");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(
    details.getByRole("link", { name: "+91 (20) 5550-1234" }),
  ).toHaveAttribute("href", "tel:+912055501234");
  await expect(
    details.getByRole("link", { name: "hello@nowhere.invalid" }),
  ).toHaveAttribute("href", "mailto:hello@nowhere.invalid");
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

test("people a read found on the website are offered on Contacts and added on request", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  // Placed directly, standing in for a read that found a team page, and dated
  // before the failed read so that one stays the company's latest.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query(
    `insert into enrichment_runs (owner_id, organization_id, status, input, raw_result, created_at, finished_at)
     select owner_id, id, 'done', $2::jsonb, $3::jsonb, now() - interval '1 day', now() - interval '1 day'
     from organizations where id = $1`,
    [
      companyId,
      JSON.stringify({ url: "https://nowhere.invalid/" }),
      JSON.stringify({
        people: [
          { name: "Leela Menon", title: "Founder" },
          { name: "Dev Kapoor", title: "Studio Manager" },
          { name: "Noor Fatima", title: null },
        ],
      }),
    ],
  );
  await pool.end();
  const found = panel(page).getByRole("region", { name: "Found on the website" });
  const contactsTab = companyTabs(page).getByRole("link", { name: "Contacts" });

  await page.goto(`/people/organizations?company=${companyId}&tab=contacts`);
  await expect(found.getByRole("listitem")).toHaveCount(3);
  await expect(found.getByText("Studio Manager")).toBeVisible();
  // Offered, not added.
  await expect(page.getByText("No contacts at this company yet.")).toBeVisible();

  await found.getByRole("button", { name: "Add Leela Menon" }).click();
  await expect(panel(page).getByText("1 added.")).toBeVisible();
  await expect(found.getByRole("listitem")).toHaveCount(2);
  await expect(
    panel(page).getByRole("button", { name: "Primary contact: Leela Menon" }),
  ).toHaveAttribute("aria-pressed", "true");

  await found.getByRole("button", { name: "Add all" }).click();
  await expect(panel(page).getByText("2 added.")).toBeVisible();
  await expect(found).toHaveCount(0);
  await expect(contactsTab).toContainText("3");
  await expect(panel(page).getByRole("row", { name: /Dev Kapoor/ })).toContainText(
    "Studio Manager",
  );
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
      panel(page).getByRole("button", { name: "Re-enrich" }),
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
  await recordAction(page, "Delete");
  await expect(
    // The three people added from the website above.
    confirmation.getByText("Its contacts (3), tasks and logged activity are kept"),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await expect(
    panel(page).getByRole("heading", { name: "Nowhere Works" }),
  ).toBeVisible();

  await recordAction(page, "Delete");
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
