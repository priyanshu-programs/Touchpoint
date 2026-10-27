import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const NUMBER = "INV-2026-401";
const main = (page: Page) => page.getByRole("main");
const card = (page: Page, title: string) =>
  main(page).locator("[data-slot=card]").filter({ has: page.getByText(title, { exact: true }) });

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

// Other files leave invoices and payments behind, so this one checks only its own
// client, invoice and services, never a page's totals.
let reports = "";

async function pay(page: Page, amount: string, reference: string) {
  await main(page).getByRole("link", { name: "Record payment" }).click();
  // The client's open invoices load after the form; the amount is typed once they are there.
  await expect(page.getByLabel(`Amount for ${NUMBER}`)).not.toHaveValue("");
  await page.getByLabel("Amount", { exact: true }).fill(amount);
  await expect(page.getByLabel(`Amount for ${NUMBER}`)).toHaveValue(amount.replace(",", ""));
  await page.getByLabel("Reference (optional)").fill(reference);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });
}

test("the reports split one client's money by month, client and service, and time it", async ({ page }) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Cedar Works");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Cedar Works" })).toBeVisible();
  const companyId = new URL(page.url()).searchParams.get("company")!;

  await page.goto(`/money/invoices/new?company=${companyId}`);
  await expect(page.getByRole("button", { name: "client: Cedar Works. Change" })).toBeVisible();
  await page.getByLabel("Invoice number").fill(NUMBER);
  await page.getByLabel("Line 1 description").fill("Brand identity");
  await page.getByLabel("Line 1 service").fill("Cedar branding");
  await page.getByLabel("Line 1 price").fill("60,000");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 2 description").fill("A year of hosting");
  await page.getByLabel("Line 2 service").fill("Cedar hosting");
  await page.getByLabel("Line 2 price").fill("40,000");
  await page.getByRole("button", { name: "Save as issued" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });

  await pay(page, "50,000", "UTR-CEDAR-1");
  await expect(main(page).locator("header").getByText("Partly paid", { exact: true })).toBeVisible();
  await pay(page, "50,000", "UTR-CEDAR-2");
  await expect(main(page).locator("header").getByText("Paid", { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Money" }).click();
  await main(page).getByRole("navigation", { name: "Money" }).getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/money\/reports$/);
  await expect(page.getByRole("button", { name: "This month" })).toBeVisible();
  reports = page.url();

  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(),
  );
  await expect(card(page, "Revenue by month").getByRole("row", { name: new RegExp(month) })).toBeVisible();

  const client = card(page, "Revenue by client").getByRole("row", { name: /Cedar Works/ });
  await expect(client).toContainText("₹1,00,000");
  await client.getByRole("link", { name: "Cedar Works" }).click();
  await expect(page).toHaveURL(new RegExp(`/money/payments\\?.*company=${companyId}`));
  await expect(main(page).getByText("Showing 1–2 of 2")).toBeVisible();

  await page.goto(reports);
  const branding = card(page, "Revenue by service").getByRole("row", { name: /Cedar branding/ });
  await expect(branding).toContainText("₹60,000");
  await expect(card(page, "Revenue by service").getByRole("row", { name: /Cedar hosting/ })).toContainText(
    "₹40,000",
  );
  await branding.getByRole("link", { name: "Cedar branding" }).click();
  await expect(page).toHaveURL(/\/money\/reports\/services\?.*service=Cedar\+branding/);
  await expect(page.getByRole("heading", { name: "Revenue by service: Cedar branding" })).toBeVisible();
  await expect(main(page).getByRole("row", { name: new RegExp(`${NUMBER}.*₹30,000`) })).toHaveCount(2);
  await main(page).getByRole("link", { name: NUMBER }).first().click();
  await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`));

  await page.goto(reports);
  await card(page, "Time to payment").getByRole("link", { name: /days?$/ }).click();
  await expect(page).toHaveURL(/\/money\/reports\/time-to-payment/);
  await expect(main(page).getByRole("row", { name: new RegExp(NUMBER) })).toContainText(/0$/);
});

test("another period or dates of the owner's own, and Not enough data where nothing counts", async ({
  page,
}) => {
  await page.goto(reports);
  await page.getByRole("button", { name: "This month" }).click();
  await page.getByRole("menuitemradio", { name: "Last 12 months" }).click();
  await expect(page).toHaveURL(/period=last-12-months/);
  await expect(card(page, "Revenue by client").getByRole("row", { name: /Cedar Works/ })).toBeVisible();

  await page.getByLabel("From").fill("2001-01-01");
  await page.getByLabel("To").fill("2001-01-31");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("button", { name: "Your dates" })).toBeVisible();
  for (const title of ["Revenue by month", "Revenue by client", "Revenue by service", "Time to payment"]) {
    await expect(card(page, title)).toContainText("Not enough data.");
  }

  // A service's rows keep the service when the dates change.
  await page.goto("/money/reports/services?service=Cedar+hosting");
  await expect(main(page).getByRole("row", { name: new RegExp(NUMBER) })).toHaveCount(2);
  await page.getByLabel("From").fill("2001-01-01");
  await page.getByLabel("To").fill("2001-01-31");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page).toHaveURL(/service=Cedar\+hosting/);
  await expect(main(page).getByText("Nothing counts towards this report")).toBeVisible();

  // No such report, and a service's rows that name no service.
  for (const path of ["/money/reports/nothing-here", "/money/reports/services"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  }
});

test("the reports fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    reports,
    "/money/reports?period=all",
    "/money/reports/clients",
    "/money/reports/services?service=Cedar+branding",
    "/money/reports/unallocated?period=all",
    "/money/reports/time-to-payment",
  ]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.goto("/money");
  await main(page).getByRole("navigation", { name: "Money" }).getByRole("link", { name: "Reports" }).click();
  await expect(card(page, "Revenue by service")).toBeVisible();
});
