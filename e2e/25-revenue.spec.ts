import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const THIS_MONTH = "INV-2026-301";
const LONG_AGO = "INV-2026-302";
const main = (page: Page) => page.getByRole("main");
const card = (page: Page, title: string) =>
  main(page).locator("[data-slot=card]").filter({ has: page.getByText(title, { exact: true }) });

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

// The owner's zone is UTC (01-foundation). Seventy days back is always two months or
// more before this one, so that invoice falls in no recent period.
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

let companyId = "";
let overview = "";

async function issueInvoice(page: Page, number: string, price: string, dates?: [string, string]) {
  await page.goto(`/money/invoices/new?company=${companyId}`);
  await expect(page.getByRole("button", { name: "client: Birch Consulting. Change" })).toBeVisible();
  await page.getByLabel("Invoice number").fill(number);
  if (dates) {
    await page.getByLabel("Issued on").fill(dates[0]);
    await page.getByLabel("Due on").fill(dates[1]);
  }
  await page.getByLabel("Line 1 description").fill("Strategy workshop");
  await page.getByLabel("Line 1 price").fill(price);
  await page.getByRole("button", { name: "Save as issued" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });
}

test("the overview counts one client's money, and each figure opens its rows", async ({ page }) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Birch Consulting");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Birch Consulting" })).toBeVisible();
  companyId = new URL(page.url()).searchParams.get("company")!;

  await issueInvoice(page, THIS_MONTH, "80,000");
  await main(page).getByRole("link", { name: "Record payment" }).click();
  // The client's open invoices load after the form; the amount is typed once they are there.
  await expect(page.getByLabel(`Amount for ${THIS_MONTH}`)).toHaveValue("80000");
  await page.getByLabel("Amount", { exact: true }).fill("30,000");
  await expect(page.getByLabel(`Amount for ${THIS_MONTH}`)).toHaveValue("30000");
  await page.getByLabel("Reference (optional)").fill("UTR-BIRCH");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Partly paid", { exact: true })).toBeVisible({ timeout: 15_000 });
  await issueInvoice(page, LONG_AGO, "20,000", [daysAgo(70), daysAgo(55)]);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Money" }).click();
  await expect(page).toHaveURL(/\/money$/);
  await expect(page.getByRole("button", { name: "This month" })).toBeVisible();
  await page.getByRole("button", { name: "Choose client" }).click();
  await page.getByPlaceholder("Search companies and people…").fill("Birch");
  await page.getByRole("option", { name: /Birch Consulting/ }).click();
  await expect(page).toHaveURL(new RegExp(`/money\\?period=this-month&company=${companyId}$`));
  overview = page.url();

  await expect(card(page, "Received")).toContainText("₹30,000");
  await expect(card(page, "Received")).toContainText("1 payment");
  await expect(card(page, "Invoiced")).toContainText("₹80,000");
  await expect(card(page, "Invoiced")).toContainText("1 invoice");
  await expect(card(page, "Outstanding today")).toContainText("₹70,000");
  await expect(card(page, "Outstanding today")).toContainText("2 invoices");
  await expect(card(page, "Outstanding today")).toContainText("₹20,000 overdue (1 invoice)");

  await card(page, "Received").getByRole("link", { name: "₹30,000" }).click();
  await expect(page).toHaveURL(/\/money\/payments\?.*from=/);
  await expect(main(page).getByText(/^Received from/)).toBeVisible();
  await expect(main(page).getByRole("row", { name: /UTR-BIRCH/ })).toBeVisible();
  await expect(main(page).getByText("Showing 1–1 of 1")).toBeVisible();

  await page.goto(overview);
  await card(page, "Invoiced").getByRole("link", { name: "₹80,000" }).click();
  await expect(page).toHaveURL(/\/money\/invoices\?status=issued/);
  await expect(main(page).getByRole("row", { name: new RegExp(THIS_MONTH) })).toBeVisible();
  await expect(main(page).getByText(LONG_AGO)).toHaveCount(0);

  await page.goto(overview);
  await card(page, "Outstanding today").getByRole("link", { name: /overdue/ }).click();
  await expect(page).toHaveURL(/\/money\/invoices\?status=overdue/);
  await expect(main(page).getByRole("row", { name: new RegExp(LONG_AGO) })).toContainText("Overdue");
  await expect(main(page).getByText(THIS_MONTH)).toHaveCount(0);

  await page.goto(overview);
  await card(page, "Outstanding today").getByRole("link", { name: "₹70,000" }).click();
  await expect(page).toHaveURL(/\/money\/invoices\?status=outstanding/);
  await expect(main(page).getByRole("row")).toHaveCount(3);
});

test("another period changes what came in and was billed, not what is owed", async ({ page }) => {
  await page.goto(overview);
  await page.getByRole("button", { name: "This month" }).click();
  await page.getByRole("menuitemradio", { name: "Last month" }).click();
  await expect(page).toHaveURL(/period=last-month/);
  await expect(card(page, "Received")).toContainText("₹0");
  await expect(card(page, "Invoiced")).toContainText("No invoices issued");
  await expect(card(page, "Outstanding today")).toContainText("₹70,000");

  await page.getByLabel("From").fill(daysAgo(80));
  await page.getByLabel("To").fill(daysAgo(60));
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("button", { name: "Your dates" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`company=${companyId}`));
  await expect(card(page, "Invoiced")).toContainText("₹20,000");

  await page.getByRole("button", { name: "Clear client" }).click();
  await expect(page).not.toHaveURL(/company=/);
  await expect(main(page).getByText(/for every client/)).toBeVisible();
});

test("Today shows this month's money, each tile opening its rows", async ({ page }) => {
  await page.goto("/");
  const money = main(page).getByRole("list", { name: "Money" });
  await expect(money.getByRole("link", { name: /Received this month/ })).toBeVisible();
  await expect(money.getByRole("link", { name: /Invoiced this month/ })).toBeVisible();
  await money.getByRole("link", { name: /Outstanding today/ }).click();
  await expect(page).toHaveURL(/\/money\/invoices\?status=outstanding&currency=INR$/);
  await expect(main(page).getByRole("row", { name: new RegExp(LONG_AGO) })).toBeVisible();
});

test("the overview fits a phone and is reached through Go to", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [overview, "/money?period=all", "/"]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.getByRole("button", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Money", exact: true }).click();
  await expect(page).toHaveURL(/\/money$/);
  await expect(card(page, "Outstanding today")).toBeVisible();
});
