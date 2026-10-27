import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const FIRST = "INV-2026-201";
const SECOND = "INV-2026-202";
const main = (page: Page) => page.getByRole("main");
const header = (page: Page) => main(page).locator("header");
const panel = (page: Page) => page.getByRole("dialog");

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

let companyId = "";
let firstUrl = "";
let advanceUrl = "";

async function issueInvoice(page: Page, number: string, price: string) {
  await page.goto(`/money/invoices/new?company=${companyId}`);
  await expect(page.getByRole("button", { name: "client: Fern Analytics. Change" })).toBeVisible();
  await page.getByLabel("Invoice number").fill(number);
  await page.getByLabel("Line 1 description").fill("Analytics retainer");
  await page.getByLabel("Line 1 price").fill(price);
  await page.getByRole("button", { name: "Save as issued" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });
  return page.url();
}

test("a payment against an invoice lowers what it owes, until it is paid", async ({ page }) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Fern Analytics");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Fern Analytics" })).toBeVisible();
  companyId = new URL(page.url()).searchParams.get("company")!;

  firstUrl = await issueInvoice(page, FIRST, "1,00,000");
  await expect(header(page).getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(main(page).getByText("No payments yet.")).toBeVisible();

  await main(page).getByRole("link", { name: "Record payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/payments/new\\?invoice=${ID}$`));
  await expect(page.getByRole("button", { name: "client: Fern Analytics. Change" })).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("100000");
  // The invoice it was recorded from takes the amount, and follows it as it changes.
  await expect(page.getByLabel(`Amount for ${FIRST}`)).toHaveValue("100000");
  await page.getByLabel("Amount", { exact: true }).fill("40,000");
  await expect(page.getByLabel(`Amount for ${FIRST}`)).toHaveValue("40000");
  await expect(page.getByText("Unallocated: ₹0")).toBeVisible();
  await page.getByLabel("Reference (optional)").fill("UTR-40K");
  await page.getByRole("button", { name: "Record payment" }).click();

  await expect(page).toHaveURL(firstUrl, { timeout: 15_000 });
  await expect(header(page).getByText("Partly paid", { exact: true })).toBeVisible();
  await expect(main(page).locator("dl")).toContainText("₹60,000");
  await expect(page.getByRole("button", { name: `More actions for ${FIRST}` })).toHaveCount(0);

  await main(page).getByRole("link", { name: "Record payment" }).click();
  await expect(page.getByLabel(`Amount for ${FIRST}`)).toHaveValue("60000");
  await page.getByLabel("Reference (optional)").fill("UTR-60K");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL(firstUrl, { timeout: 15_000 });
  await expect(header(page).getByText("Paid", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("list", { name: "Payments" }).getByRole("listitem")).toHaveCount(2);
  await expect(main(page).getByRole("link", { name: "Record payment" })).toHaveCount(0);
});

test("a second identical payment is stopped before it is saved", async ({ page }) => {
  await page.goto(`/money/payments/new?company=${companyId}`);
  await expect(page.getByText("No open invoices in INR for this client.", { exact: false })).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("40,000");
  await page.getByLabel("Reference (optional)").fill("UTR-40K");
  await page.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByText("This looks like a payment you have already recorded")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Record anyway" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/money\/payments$/);
  await expect(main(page).getByRole("row", { name: /Fern Analytics/ })).toHaveCount(2);
});

test("an advance is kept unallocated, then put towards a later invoice", async ({ page }) => {
  await page.goto(`/money/payments/new?company=${companyId}`);
  await page.getByLabel("Amount", { exact: true }).fill("25,000");
  await page.getByLabel("Reference (optional)").fill("ADV-1");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/payments/${ID}$`), { timeout: 15_000 });
  advanceUrl = page.url();
  await expect(main(page).getByRole("heading", { name: "₹25,000 received" })).toBeVisible();
  await expect(main(page).getByText("Not put towards any invoice yet.")).toBeVisible();

  const second = await issueInvoice(page, SECOND, "20,000");
  await page.goto(advanceUrl);
  await page.getByLabel(`Amount for ${SECOND}`).fill("20,000");
  await page.getByRole("button", { name: "Put towards these invoices" }).click();
  await expect(main(page).getByRole("list", { name: "Invoices paid" })).toContainText(SECOND, {
    timeout: 15_000,
  });
  await expect(main(page).locator("dl")).toContainText("₹5,000");

  await page.goto(second);
  await expect(header(page).getByText("Paid", { exact: true })).toBeVisible();
});

test("payments are listed under Invoices and on the company's tab", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Invoices" })
    .click();
  await expect(page).toHaveURL(/\/money\/invoices$/);
  await page
    .getByRole("navigation", { name: "Invoices and payments" })
    .getByRole("link", { name: "Payments" })
    .click();
  await expect(page).toHaveURL(/\/money\/payments$/);
  await expect(main(page).getByRole("row", { name: /ADV-1/ })).toContainText("₹5,000 unallocated");

  await page.goto(`/people/organizations?company=${companyId}&tab=money`);
  await expect(panel(page).getByRole("list", { name: "Payments" }).getByRole("listitem")).toHaveCount(3);
  await expect(panel(page).getByRole("link", { name: "Record payment" })).toBeVisible();
});

test("a payment is deleted, and its invoice owes that again", async ({ page }) => {
  await page.goto("/money/payments?q=UTR-60K");
  await main(page).getByRole("row", { name: /UTR-60K/ }).getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/money/payments/${ID}$`));
  await page.getByRole("button", { name: /More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete payment" }).click();
  await expect(page).toHaveURL(/\/money\/payments$/, { timeout: 15_000 });
  await expect(main(page).getByText("UTR-60K")).toHaveCount(0);

  await page.goto(firstUrl);
  await expect(header(page).getByText("Partly paid", { exact: true })).toBeVisible();
  await expect(main(page).locator("dl")).toContainText("₹60,000");
});

test("Payments fit a phone and are reached through Go to", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/money/payments", advanceUrl, "/money/payments/new", firstUrl]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Invoices", exact: true }).click();
  await expect(page).toHaveURL(/\/money\/invoices$/);
  await page.getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/\/money\/payments$/);
});
