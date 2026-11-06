import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const NUMBER = "INV-2026-421";
const DRAFT = "INV-2026-422";
const PERSONAL = "INV-2026-423";
const panel = (page: Page) => page.getByRole("dialog");
const COMPANY_PANEL = new RegExp(`/people/organizations\\?company=${ID}`);

let companyId = "";
let contactId = "";

async function newInvoice(page: Page, number: string, price: string, status: string) {
  await panel(page).getByRole("link", { name: "New invoice" }).click();
  await expect(panel(page).getByRole("heading", { name: "New invoice" })).toBeVisible();
  await panel(page).getByLabel("Invoice number").fill(number);
  await panel(page).getByLabel("Line 1 description").fill("Site build");
  await panel(page).getByLabel("Line 1 price").fill(price);
  await panel(page).getByRole("button", { name: status }).click();
  await expect(panel(page).getByRole("link", { name: number })).toBeVisible({ timeout: 15_000 });
}

test("an invoice is made, opened, edited and paid without leaving a company's panel", async ({
  page,
}) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Juniper Studio");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Juniper Studio" })).toBeVisible();
  companyId = new URL(page.url()).searchParams.get("company")!;

  await panel(page).getByRole("link", { name: "Invoices", exact: true }).click();
  await panel(page).getByRole("link", { name: "New invoice" }).click();
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(page).toHaveURL(/invoice=new/);
  await expect(
    panel(page).getByRole("button", { name: "client: Juniper Studio. Change" }),
  ).toBeVisible();
  await panel(page).getByRole("link", { name: "Back to Juniper Studio" }).click();
  await expect(panel(page).getByText("No invoices yet.")).toBeVisible();

  await newInvoice(page, NUMBER, "50,000", "Save as issued");
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(page).toHaveURL(/tab=money/);

  await panel(page).getByRole("link", { name: NUMBER }).click();
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(panel(page).getByRole("heading", { name: `Invoice ${NUMBER}` })).toBeVisible();
  await expect(panel(page).getByText("Unpaid", { exact: true })).toBeVisible();

  await panel(page).getByRole("button", { name: `More actions for ${NUMBER}` }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(panel(page).getByRole("heading", { name: `Edit invoice ${NUMBER}` })).toBeVisible();
  await panel(page).getByLabel("Line 1 price").fill("60,000");
  await panel(page).getByRole("button", { name: "Save changes" }).click();
  await expect(panel(page).getByRole("heading", { name: `Invoice ${NUMBER}` })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(panel(page).locator("dl")).toContainText("₹60,000");

  await panel(page).getByRole("link", { name: "Record payment" }).click();
  await expect(panel(page).getByRole("heading", { name: "Record payment" })).toBeVisible();
  await expect(panel(page).getByLabel(`Amount for ${NUMBER}`)).toHaveValue("60000");
  await panel(page).getByLabel("Amount", { exact: true }).fill("25,000");
  await panel(page).getByLabel("Reference (optional)").fill("UTR-JUNIPER");
  await panel(page).getByRole("button", { name: "Record payment" }).click();
  await expect(panel(page).getByRole("heading", { name: `Invoice ${NUMBER}` })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(panel(page).getByText("Partly paid", { exact: true })).toBeVisible();
  await expect(panel(page).locator("dl")).toContainText("₹35,000");

  await panel(page).getByRole("link", { name: `Back to Juniper Studio` }).click();
  await expect(panel(page).getByRole("list", { name: "Payments" }).getByRole("listitem")).toHaveCount(1);
});

test("a payment opens in the panel and is deleted there", async ({ page }) => {
  await page.goto(`/people/organizations?company=${companyId}&tab=money`);
  await panel(page)
    .getByRole("list", { name: "Payments" })
    .getByRole("link")
    .first()
    .click();
  await expect(panel(page).getByRole("heading", { name: "₹25,000 received" })).toBeVisible();
  await expect(page).toHaveURL(COMPANY_PANEL);
  await expect(panel(page).getByRole("link", { name: NUMBER })).toBeVisible();

  await panel(page).getByRole("button", { name: "More actions for the payment of ₹25,000" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete payment" }).click();
  await expect(panel(page).getByText("No payments yet.")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(COMPANY_PANEL);
});

test("a draft is deleted from the panel, and lands back on the Invoices tab", async ({ page }) => {
  await page.goto(`/people/organizations?company=${companyId}&tab=money`);
  await newInvoice(page, DRAFT, "5,000", "Save as draft");
  await panel(page).getByRole("link", { name: DRAFT }).click();
  await expect(panel(page).getByText("Draft", { exact: true })).toBeVisible();
  await panel(page).getByRole("button", { name: `More actions for ${DRAFT}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(panel(page).getByRole("link", { name: NUMBER })).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).getByRole("link", { name: DRAFT })).toHaveCount(0);
  await expect(page).toHaveURL(COMPANY_PANEL);
});

test("a person's invoice opens in their panel, and not under another record", async ({
  page,
}) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Wren");
  await page.getByLabel("Last name").fill("Hollis");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Wren Hollis" })).toBeVisible();
  contactId = new URL(page.url()).searchParams.get("contact")!;

  await page.goto(`/people/contacts?contact=${contactId}&tab=money`);
  await newInvoice(page, PERSONAL, "8,000", "Save as issued");
  await expect(page).toHaveURL(new RegExp(`/people/contacts\\?contact=${contactId}`));
  await panel(page).getByRole("link", { name: PERSONAL }).click();
  await expect(panel(page).getByRole("heading", { name: `Invoice ${PERSONAL}` })).toBeVisible();
  const invoiceId = new URL(page.url()).searchParams.get("invoice")!;

  // The same invoice asked for under a company it does not bill opens the company.
  await page.goto(`/people/organizations?company=${companyId}&invoice=${invoiceId}`);
  await expect(panel(page).getByRole("heading", { name: "Juniper Studio" })).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: `Invoice ${PERSONAL}` })).toHaveCount(0);
});
