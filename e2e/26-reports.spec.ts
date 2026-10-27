import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
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

// A month no other file writes to, so the three rates can be checked exactly. Logging
// activities, follow-ups and sends is covered by their own files; here they are placed in
// the database with the dates the reports count by.
const MARCH = "from=2025-03-01&to=2025-03-31";

test("follow-up compliance, reply rate and proposal acceptance, each opening its rows", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query(`
    with owner as (select id from "user" order by created_at limit 1),
    ava as (insert into contacts (owner_id, first_name, last_name) select id, 'Ava', 'Linwood' from owner returning id, owner_id),
    ben as (insert into contacts (owner_id, first_name, last_name) select id, 'Ben', 'Ortega' from owner returning id, owner_id),
    follow_ups as (
      insert into tasks (owner_id, title, due_on, status, completed_at, origin, contact_id)
      select owner_id, 'Send Ava the timeline', '2025-03-10'::date, 'done', '2025-03-09T10:00:00Z'::timestamptz, 'follow_up', id from ava
      union all
      select owner_id, 'Chase Ben about the brief', '2025-03-12'::date, 'open', null, 'follow_up', id from ben
    ),
    calls as (
      insert into activities (owner_id, kind, direction, occurred_at, title)
      select id, 'email', 'outbound', '2025-03-05T06:00:00Z'::timestamptz, 'Intro to Ava' from owner
      union all select id, 'email', 'inbound', '2025-03-06T06:00:00Z'::timestamptz, 'Ava wrote back' from owner
      union all select id, 'call', 'outbound', '2025-03-07T06:00:00Z'::timestamptz, 'Called Ben' from owner
      returning id, title, owner_id
    ),
    linked as (
      insert into activity_contacts (activity_id, contact_id, owner_id)
      select calls.id, case when calls.title = 'Called Ben' then ben.id else ava.id end, calls.owner_id
      from calls, ava, ben
    ),
    material as (
      insert into materials (owner_id, name, type) select id, 'Linwood proposal', 'proposal' from owner returning id, owner_id
    ),
    version as (
      insert into material_versions (owner_id, material_id, label, url)
      select owner_id, id, 'v1', 'https://example.com/linwood' from material returning id, owner_id
    ),
    sends as (
      insert into material_sends (owner_id, version_id, sent_at, channel, status)
      select owner_id, id, '2025-03-08T06:00:00Z'::timestamptz, 'email', 'accepted' from version
      union all select owner_id, id, '2025-03-09T06:00:00Z'::timestamptz, 'email', 'rejected' from version
      union all select owner_id, id, '2025-03-10T06:00:00Z'::timestamptz, 'email', 'sent' from version
      returning id, owner_id, status
    )
    insert into material_send_recipients (send_id, contact_id, owner_id)
    select sends.id, case when sends.status = 'rejected' then ben.id else ava.id end, sends.owner_id
    from sends, ava, ben
  `);
  await pool.end();

  await page.goto(`/money/reports?${MARCH}`);
  await expect(page.getByRole("heading", { name: "Follow-ups and sales" })).toBeVisible();
  const compliance = card(page, "Follow-up compliance");
  await expect(compliance.getByRole("link", { name: "50% on time" })).toBeVisible();
  await expect(compliance).toContainText("1 of 2 follow-ups due");
  await expect(card(page, "Reply rate").getByRole("link", { name: "50% replied" })).toBeVisible();
  await expect(card(page, "Reply rate")).toContainText("1 of 2 people you reached out to");
  const acceptance = card(page, "Proposal acceptance");
  await expect(acceptance.getByRole("link", { name: "50% accepted" })).toBeVisible();
  await expect(acceptance).toContainText("1 of 2 proposals");
  await expect(acceptance).toContainText("1 waiting for an answer");

  await compliance.getByRole("link", { name: "50% on time" }).click();
  await expect(page).toHaveURL(/\/money\/reports\/follow-ups\?from=2025-03-01&to=2025-03-31/);
  await expect(main(page).getByRole("row", { name: /Send Ava the timeline/ })).toContainText("On time");
  await expect(main(page).getByRole("row", { name: /Chase Ben about the brief/ })).toContainText("Not done");
  await main(page).getByRole("link", { name: "Chase Ben about the brief" }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${ID}$`));

  await page.goto(`/money/reports?${MARCH}`);
  await card(page, "Reply rate").getByRole("link", { name: "50% replied" }).click();
  await expect(page).toHaveURL(/\/money\/reports\/replies/);
  await expect(main(page).getByRole("row", { name: /Ava Linwood/ })).toContainText("Email");
  await expect(main(page).getByRole("row", { name: /Ben Ortega/ })).toContainText("No reply yet");
  await main(page).getByRole("link", { name: "Ava Linwood" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Ava Linwood" })).toBeVisible();

  await page.goto(`/money/reports?${MARCH}`);
  await acceptance.getByRole("link", { name: "50% accepted" }).click();
  await expect(page).toHaveURL(/\/money\/reports\/proposals/);
  await expect(main(page).getByRole("row", { name: /Linwood proposal/ })).toHaveCount(3);
  await expect(main(page).getByText("Listed but not counted: 1 waiting for an answer.")).toBeVisible();
  await main(page).getByRole("link", { name: "Linwood proposal" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/materials/${ID}$`));

  // The month before has none of it.
  await page.goto("/money/reports?from=2025-02-01&to=2025-02-28");
  for (const title of ["Follow-up compliance", "Reply rate", "Proposal acceptance"]) {
    await expect(card(page, title)).toContainText("Not enough data.");
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
    `/money/reports?${MARCH}`,
    `/money/reports/follow-ups?${MARCH}`,
    `/money/reports/replies?${MARCH}`,
    `/money/reports/proposals?${MARCH}`,
  ]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.goto("/money");
  await main(page).getByRole("navigation", { name: "Money" }).getByRole("link", { name: "Reports" }).click();
  await expect(card(page, "Revenue by service")).toBeVisible();
});
