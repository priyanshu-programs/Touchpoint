import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const NUMBER = "INV-2026-101";
const main = (page: Page) => page.getByRole("main");
const panel = (page: Page) => page.getByRole("dialog");
const searchBox = (page: Page) => page.getByPlaceholder("Search or jump to…");

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

const exported = {
  name: `${NUMBER}.pdf`,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\ninvoice\n%%EOF\n"),
};

let companyUrl = "";
let invoiceUrl = "";

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: `More actions for ${NUMBER}` }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

test("an invoice is recorded from a company's Money tab, with lines, a discount and its PDF", async ({
  page,
}) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Ledger Works");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Ledger Works" })).toBeVisible();
  companyUrl = page.url().replace(/&.*$/, "");

  await panel(page).getByRole("link", { name: "Money", exact: true }).click();
  await expect(panel(page).getByText("No invoices yet.")).toBeVisible();
  await panel(page).getByRole("link", { name: "New invoice" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/new\\?company=${ID}$`));
  await expect(page.getByRole("button", { name: "client: Ledger Works. Change" })).toBeVisible();
  await expect(page.getByLabel("Currency")).toHaveValue("INR");
  await expect(page.getByLabel("Due on")).not.toHaveValue("");

  await page.getByLabel("Invoice number").fill(NUMBER);
  await page.getByLabel("Line 1 description").fill("Brand identity");
  await page.getByLabel("Line 1 service").fill("Design");
  await page.getByLabel("Line 1 price").fill("1,20,000");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 2 description").fill("Copywriting");
  await page.getByLabel("Line 2 quantity").fill("2");
  await page.getByLabel("Line 2 price").fill("15000");
  await expect(page.getByLabel("Line 2 amount")).toHaveText("₹30,000");
  await page.getByRole("button", { name: "Add discount or write-off" }).click();
  await page.getByLabel("Adjustment 1 reason").fill("Launch discount");
  await page.getByLabel("Adjustment 1 amount").fill("10,000");
  await expect(page.getByLabel("Invoice total")).toHaveText("₹1,40,000");
  await page.getByLabel("Invoice file").setInputFiles(exported);
  await page.getByRole("button", { name: "Save as draft" }).click();

  // Saved first, then the file goes up: two round trips to a slow test database.
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });
  invoiceUrl = page.url();
  await expect(main(page).getByRole("heading", { name: `Invoice ${NUMBER}` })).toBeVisible();
  await expect(main(page).getByText("Draft", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Launch discount")).toBeVisible();
  await expect(main(page).getByRole("cell", { name: "₹1,40,000" })).toBeVisible();

  const file = main(page).getByRole("link", { name: exported.name });
  await expect(file).toHaveAttribute("target", "_blank");
  const served = await page.request.get((await file.getAttribute("href"))!);
  expect(served.headers()["content-type"]).toBe("application/pdf");
  expect(served.headers()["cache-control"]).toBe("private, no-store");

  await menu(page, "Mark as issued");
  await expect(main(page).getByText("Issued", { exact: true })).toBeVisible();
});

test("the same number in another case is refused, and the form keeps its lines", async ({
  page,
}) => {
  await page.goto("/money/invoices/new");
  await page.getByLabel("Invoice number").fill(NUMBER.toLowerCase());
  await page.getByRole("button", { name: "Choose client" }).click();
  await page.getByPlaceholder("Search companies and people…").fill("Ledger");
  await page.getByRole("option", { name: /Ledger Works/ }).click();
  await page.getByLabel("Line 1 description").fill("Retainer");
  await page.getByLabel("Line 1 price").fill("50000");
  await page.getByRole("button", { name: "Save as issued" }).click();
  await expect(
    page.getByText("You already have an invoice with that number. Check the number on the invoice."),
  ).toBeVisible();
  await expect(page.getByLabel("Line 1 description")).toHaveValue("Retainer");
  await expect(page.getByRole("button", { name: "client: Ledger Works. Change" })).toBeVisible();

  // A draft can be deleted outright.
  await page.getByLabel("Invoice number").fill("DRAFT-1");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`));
  await page.getByRole("button", { name: "More actions for DRAFT-1" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(/\/money\/invoices$/);
  await expect(main(page).getByText("DRAFT-1")).toHaveCount(0);
});

test("an issued invoice is edited, listed and found in Ctrl+K", async ({ page }) => {
  await page.goto(invoiceUrl);
  await menu(page, "Edit");
  await expect(page.getByLabel("Line 1 price")).toHaveValue("120000");
  await expect(page.getByRole("button", { name: "Save as draft" })).toHaveCount(0);
  await page.getByLabel("Line 1 price").fill("1,30,000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(invoiceUrl);
  await expect(main(page).getByRole("cell", { name: "₹1,50,000" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Money" })
    .click();
  await expect(page).toHaveURL(/\/money\/invoices$/);
  const row = main(page).getByRole("row", { name: new RegExp(NUMBER) });
  await expect(row).toContainText("Ledger Works");
  await expect(row).toContainText("₹1,50,000");
  await expect(row).toContainText("Issued");

  await page.goto(`${companyUrl}&tab=money`);
  await expect(panel(page).getByRole("link", { name: NUMBER })).toBeVisible();

  await page.goto("/");
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await searchBox(page).fill("2026-101");
  await page.getByRole("option", { name: new RegExp(NUMBER) }).click();
  await expect(page).toHaveURL(invoiceUrl);
});

test("a company its invoices bill cannot be deleted", async ({ page }) => {
  await page.goto(companyUrl);
  await panel(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Ledger Works cannot be deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete company" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
});

test("an issued invoice is voided after a confirmation, and stays void", async ({ page }) => {
  await page.goto(invoiceUrl);
  await menu(page, "Void");
  await page.getByRole("button", { name: "Void invoice" }).click();
  await expect(main(page).getByText("Void", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: `More actions for ${NUMBER}` })).toHaveCount(0);
});

test("Money fits a phone and is reached through Go to", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/money/invoices", invoiceUrl, "/money/invoices/new"]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Money", exact: true }).click();
  await expect(page).toHaveURL(/\/money\/invoices$/);
});
