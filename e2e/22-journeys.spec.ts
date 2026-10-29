import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

// PRD journeys 2, 3, 4, 7, 8 and 9, each told as one story, on a desktop and on a phone.
// Phase 3 is accepted on 2 to 4 and 8, Phase 4 on 7 and 9. Prospecting comes from e2e/13
// and Acme Design from e2e/02.
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

const main = (page: Page) => page.getByRole("main");
const header = (page: Page) => main(page).locator("header");
const card = (page: Page, title: string) =>
  main(page).locator("[data-slot=card]").filter({ has: page.getByText(title, { exact: true }) });
const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
// The panel eases in from the right and is wider than itself while it does.
const panelFits = (page: Page) =>
  expect
    .poll(() =>
      page
        .locator('[data-slot="sheet-content"]')
        .evaluate((sheet) => sheet.scrollWidth <= sheet.clientWidth),
    )
    .toBe(true);

const devices = [
  {
    label: "desktop",
    phone: false,
    viewport: { width: 1280, height: 800 },
    first: "Meera",
    last: "Kulkarni",
    company: "Kulkarni Labs",
    domain: "kulkarni-labs.invalid",
    found: "Sunil Varma",
    material: "Kulkarni Labs proposal",
    invoice: "KL-2024-05",
    month: "2024-05",
    monthName: "May 2024",
  },
  {
    label: "phone",
    phone: true,
    viewport: { width: 390, height: 844 },
    first: "Farhan",
    last: "Qureshi",
    company: "Qureshi Works",
    domain: "qureshi-works.invalid",
    found: "Lata Bose",
    material: "Qureshi Works proposal",
    invoice: "QW-2024-06",
    month: "2024-06",
    monthName: "June 2024",
  },
];

for (const device of devices) {
  test.describe(`on a ${device.label}`, () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: device.viewport });

    const person = `${device.first} ${device.last}`;
    let companyUrl = "";
    let invoiceUrl = "";
    let overviewUrl = "";
    let consoleErrors: string[] = [];

    test.beforeEach(({ page }) => {
      consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
    });
    test.afterEach(() => {
      expect(consoleErrors).toEqual([]);
    });

    // The sidebar on a desktop; the bar at the foot and "Go to" on a phone.
    async function goTo(page: Page, label: string) {
      // An open panel keeps the rest of the page out of reach, as it does for a person.
      if ((await panel(page).count()) > 0) {
        await panel(page).getByRole("button", { name: "Close", exact: true }).click();
        await expect(panel(page)).toHaveCount(0);
      }
      const bar = page.getByRole("navigation", { name: "Main" });
      if (device.phone && ["Workflows", "Materials", "Money", "Brainstorming"].includes(label)) {
        await bar.last().getByRole("button", { name: "Go to" }).click();
        await page.getByRole("option", { name: label, exact: true }).click();
      } else {
        await (device.phone ? bar.last() : bar.first())
          .getByRole("link", { name: label, exact: true })
          .click();
      }
    }

    async function checkFits(page: Page, where: string) {
      if (!device.phone) return;
      expect(await fits(page), where).toBe(true);
      if ((await panel(page).count()) > 0) await panelFits(page);
    }

    async function openCompany(page: Page) {
      await goTo(page, "Companies");
      await expect(page).toHaveURL(/\/people\/organizations$/);
      const search = page.getByLabel("Search companies by name or domain");
      await search.fill(device.company);
      await search.press("Enter");
      await page.getByRole("link", { name: device.company, exact: true }).click();
      await expect(panel(page).getByRole("heading", { name: device.company })).toBeVisible();
    }

    async function openPerson(page: Page, name: string) {
      await openCompany(page);
      await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
      await panel(page).getByRole("link", { name, exact: true }).click();
      await expect(panel(page).getByRole("heading", { name })).toBeVisible();
    }

    test("journey 2: add and qualify a prospect", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("banner").getByRole("link", { name: "Quick add" }).click();
      await expect(page.getByRole("heading", { name: "Quick add" })).toBeVisible();
      await checkFits(page, "quick add");

      await page.getByLabel("First name").fill(device.first);
      await page.getByLabel("Last name").fill(device.last);
      await page.getByLabel("Email").fill(`${device.first.toLowerCase()}@${device.domain}`);
      await page.getByLabel("Job title").fill("Founder");
      await page.getByLabel("Company name").fill(device.company);
      // A duplicate is flagged and nothing is added.
      await page.getByLabel("Domain").fill("acme.test");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByText("That domain already belongs to Acme Design.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
      await expect(page).toHaveURL(/\/quick-add$/);

      await page.getByLabel("Domain").fill(device.domain);
      await page.getByLabel("Start a workflow").selectOption({ label: "Prospecting" });
      await expect(page.getByLabel("Follow up on")).toHaveValue(localDate(3));
      await page.getByRole("button", { name: "Add", exact: true }).click();

      await expect(page).toHaveURL(
        new RegExp(`/people/organizations\\?company=(${ID})&contact=${ID}$`),
        // Quick add writes a company, a person, a board and a task; the Neon test host can be slow.
        { timeout: 15_000 },
      );
      await expect(panel(page).getByRole("heading", { name: person })).toBeVisible();
      await checkFits(page, "the person after quick add");
      const companyId = new URL(page.url()).searchParams.get("company")!;
      companyUrl = `/people/organizations?company=${companyId}`;

      await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
      await expect(panel(page).getByRole("link", { name: `Follow up with ${person}` })).toBeVisible();

      await page.goto(companyUrl);
      await companyTabs(page).getByRole("link", { name: "Workflows" }).click();
      await expect(panel(page).getByText("Prospecting")).toBeVisible();

      // The app refuses loopback addresses, so a successful website read cannot be staged;
      // a finished read is placed directly, as in e2e/06, and its people are offered for review.
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
      await pool.query(
        `insert into enrichment_runs (owner_id, organization_id, status, input, raw_result, created_at, finished_at)
         select owner_id, id, 'done', $2::jsonb, $3::jsonb, now() - interval '1 day', now() - interval '1 day'
         from organizations where id = $1`,
        [
          companyId,
          JSON.stringify({ url: `https://${device.domain}/` }),
          JSON.stringify({ people: [{ name: device.found, title: "Operations Lead" }] }),
        ],
      );
      await pool.end();

      await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
      const found = panel(page).getByRole("region", { name: "Found on the website" });
      await expect(found.getByText("Operations Lead")).toBeVisible();
      await checkFits(page, "people found on the website");
      await found.getByRole("button", { name: `Add ${device.found}` }).click();
      await expect(panel(page).getByText("1 added.")).toBeVisible();
      await expect(panel(page).getByRole("link", { name: device.found, exact: true })).toBeVisible();
    });

    test("journey 3: the daily review opens each record in context", async ({ page }) => {
      const overdue = `Chase ${device.first}'s brief`;
      const dueToday = `Call ${device.first} back`;

      await page.goto("/");
      await openPerson(page, person);
      await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
      for (const [title, due] of [
        [overdue, localDate(-1)],
        [dueToday, localDate()],
      ]) {
        await panel(page).getByRole("link", { name: "Add task" }).click();
        await panel(page).getByLabel("Task", { exact: true }).fill(title);
        await panel(page).getByLabel("Due date").fill(due);
        await panel(page).getByRole("button", { name: "Add task" }).click();
        await expect(panel(page).getByRole("link", { name: title })).toBeVisible();
      }

      await goTo(page, "Today");
      await expect(page).toHaveURL(/\/$/);
      const overdueSection = main(page).getByRole("region", { name: /^Overdue/ });
      const todaySection = main(page).getByRole("region", { name: /^Due today/ });
      await expect(overdueSection.getByRole("link", { name: overdue })).toBeVisible();
      await expect(todaySection.getByRole("link", { name: dueToday })).toBeVisible();
      // Quick add's follow-up, three days out, is in the week ahead.
      await expect(main(page).getByRole("link", { name: `Follow up with ${person}` })).toBeVisible();
      await checkFits(page, "Today");

      const row = todaySection.getByRole("listitem").filter({ hasText: dueToday });
      await row.getByRole("link", { name: person }).click();
      await expect(panel(page).getByRole("heading", { name: person })).toBeVisible();
      await checkFits(page, "the person opened from Today");

      await goTo(page, "Today");
      await row.getByRole("link", { name: device.company }).click();
      await expect(panel(page).getByRole("heading", { name: device.company })).toBeVisible();

      await goTo(page, "Today");
      await row.getByRole("link", { name: dueToday }).click();
      await expect(page).toHaveURL(new RegExp(`/tasks/${ID}$`));
      await expect(page.getByLabel("Task", { exact: true })).toHaveValue(dueToday);

      await goTo(page, "Today");
      await page.getByRole("button", { name: `Complete: ${dueToday}` }).click();
      await expect(main(page).getByRole("link", { name: dueToday })).toHaveCount(0);
      await page.getByRole("button", { name: `Snooze until tomorrow: ${overdue}` }).click();
      await expect(main(page).getByRole("link", { name: overdue })).toHaveCount(0);
    });

    test("journey 4: a call, its outcome and a follow-up in one form", async ({ page }) => {
      const followUp = `Send ${device.first} the scope`;
      const call = `Qualifying call with ${device.first}`;

      await page.goto("/");
      await openPerson(page, person);
      await contactTabs(page).getByRole("link", { name: "Activity" }).click();
      await panel(page).getByRole("link", { name: "Log activity" }).click();
      await expect(page).toHaveURL(/tab=activity&activity=new$/);
      await expect(
        panel(page).getByRole("button", { name: `Remove contact: ${person}` }),
      ).toBeVisible();
      await checkFits(page, "the activity form");

      await panel(page).getByLabel("Type").selectOption("call");
      await panel(page).getByLabel("Summary").fill(call);
      await panel(page).getByLabel("Notes").fill("Budget agreed in principle.");
      await panel(page).getByLabel("Outcome").fill("Wants a proposal");
      await panel(page).getByLabel("Follow-up date").fill(localDate(2));
      await panel(page).getByLabel("Follow-up task").fill(followUp);
      await panel(page).getByRole("button", { name: "Log activity" }).click();

      await expect(page).toHaveURL(new RegExp(`company=${ID}&contact=${ID}&tab=activity$`));
      await expect(panel(page).getByRole("link", { name: call })).toBeVisible();
      await expect(panel(page).getByText("Wants a proposal")).toBeVisible();
      await checkFits(page, "the timeline");

      await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
      await expect(panel(page).getByRole("link", { name: followUp })).toBeVisible();

      await page.goto(companyUrl);
      await companyTabs(page).getByRole("link", { name: "Activity" }).click();
      await expect(panel(page).getByRole("link", { name: call })).toBeVisible();

      await goTo(page, "Today");
      await expect(main(page).getByRole("link", { name: followUp })).toBeVisible();
      await expect(main(page).getByRole("link", { name: call })).toBeVisible();
    });

    test("journey 8: a proposal sent to two people shows on both", async ({ page }) => {
      await page.goto("/");
      await goTo(page, "Materials");
      await expect(page).toHaveURL(/\/materials$/);
      await main(page).getByRole("link", { name: "New material" }).click();
      await expect(page).toHaveURL(/\/materials\/new$/);
      // The form clears what was typed before it has finished loading.
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Name").fill(device.material);
      await page.getByLabel("Type").selectOption("proposal");
      await page.getByLabel("Link (optional)").fill("drive.example.com/proposal");
      await page.getByRole("button", { name: "Create material" }).click();
      await expect(page).toHaveURL(new RegExp(`/materials/${ID}$`), { timeout: 15_000 });
      await expect(main(page).getByText("Proposal", { exact: true })).toBeVisible();
      await checkFits(page, "the material");

      await openCompany(page);
      await companyTabs(page).getByRole("link", { name: "Activity" }).click();
      await panel(page).getByRole("link", { name: "Log a send" }).click();
      await panel(page)
        .getByLabel("Material", { exact: true })
        .selectOption({ label: device.material });
      for (const name of [person, device.found]) {
        await panel(page).getByRole("button", { name: "Add contact" }).click();
        await page.getByPlaceholder("Search contacts…").fill(name);
        await page.getByRole("option", { name: new RegExp(name) }).click();
      }
      await panel(page).getByLabel("How").selectOption("email");
      await checkFits(page, "the send form");
      await panel(page).getByRole("button", { name: "Log send" }).click();
      await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=activity$`));

      const entry = `${device.material} · v1`;
      for (const name of [person, device.found]) {
        await page.goto(companyUrl);
        await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
        await panel(page).getByRole("link", { name, exact: true }).click();
        await contactTabs(page).getByRole("link", { name: "Activity" }).click();
        const send = panel(page).getByRole("listitem").filter({ hasText: entry });
        await expect(send).toContainText("Sent material");
        await expect(send).toContainText("Email");
        await checkFits(page, `the send on ${name}`);
      }
    });

    // Other files leave money behind, so 7 and 9 work in a past month nobody else writes to.
    const day = (n: number) => `${device.month}-${String(n).padStart(2, "0")}`;

    async function setDates(page: Page) {
      await page.getByLabel("From").fill(day(1));
      await page.getByLabel("To").fill(day(28));
      await page.getByRole("button", { name: "Show", exact: true }).click();
      await expect(page.getByRole("button", { name: "Your dates" })).toBeVisible();
    }

    async function recordPayment(page: Page, receivedOn: string, amount: string, reference: string) {
      await page.goto(invoiceUrl);
      await main(page).getByRole("link", { name: "Record payment" }).click();
      // The client's open invoices load after the form; the amount is typed once they are there.
      await expect(page.getByLabel(`Amount for ${device.invoice}`)).not.toHaveValue("");
      await checkFits(page, "the payment form");
      await page.getByLabel("Received on").fill(receivedOn);
      await page.getByLabel("Amount", { exact: true }).fill(amount);
      await expect(page.getByLabel(`Amount for ${device.invoice}`)).toHaveValue(amount.replace(",", ""));
      await page.getByLabel("Reference (optional)").fill(reference);
      await page.getByRole("button", { name: "Record payment" }).click();
    }

    test("journey 7: an invoice is paid, what is owed falls and what came in rises", async ({ page }) => {
      await page.goto("/");
      await openCompany(page);
      await companyTabs(page).getByRole("link", { name: "Invoices" }).click();
      await panel(page).getByRole("link", { name: "New invoice" }).click();
      await expect(page).toHaveURL(new RegExp(`/money/invoices/new\\?company=${ID}$`));
      await expect(page.getByRole("button", { name: `client: ${device.company}. Change` })).toBeVisible();
      await page.getByLabel("Invoice number").fill(device.invoice);
      await page.getByLabel("Issued on").fill(day(6));
      await page.getByLabel("Due on").fill(day(21));
      await page.getByLabel("Line 1 description").fill("Brand identity");
      await page.getByLabel("Line 1 service").fill("Branding");
      await page.getByLabel("Line 1 price").fill("60,000");
      await page.getByRole("button", { name: "Add line" }).click();
      await page.getByLabel("Line 2 description").fill("Company website");
      await page.getByLabel("Line 2 service").fill("Websites");
      await page.getByLabel("Line 2 price").fill("40,000");
      await expect(page.getByLabel("Invoice total")).toHaveText("₹1,00,000");
      await checkFits(page, "the invoice form");
      await page.getByRole("button", { name: "Save as issued" }).click();
      await expect(page).toHaveURL(new RegExp(`/money/invoices/${ID}$`), { timeout: 15_000 });
      invoiceUrl = page.url();
      // Its due date is long past, and stays so while it is partly paid.
      await expect(header(page).getByText("Overdue", { exact: true })).toBeVisible();
      await checkFits(page, "the invoice");

      await goTo(page, "Money");
      await expect(page).toHaveURL(/\/money$/);
      await setDates(page);
      await page.getByRole("button", { name: "Choose client" }).click();
      await page.getByPlaceholder("Search companies and people…").fill(device.company);
      await page.getByRole("option", { name: new RegExp(device.company) }).click();
      await expect(page).toHaveURL(new RegExp(`/money\\?from=${day(1)}&to=${day(28)}&company=${ID}$`));
      overviewUrl = page.url();
      await expect(card(page, "Received")).toContainText("₹0");
      await expect(card(page, "Received")).toContainText("0 payments");
      await expect(card(page, "Invoiced")).toContainText("₹1,00,000");
      await expect(card(page, "Outstanding today")).toContainText("₹1,00,000 overdue (1 invoice)");
      await checkFits(page, "the overview");

      // What is owed opens the invoice behind it.
      await card(page, "Outstanding today").getByRole("link", { name: "₹1,00,000", exact: true }).click();
      await expect(page).toHaveURL(/\/money\/invoices\?status=outstanding/);
      await main(page).getByRole("link", { name: device.invoice }).click();
      await expect(page).toHaveURL(invoiceUrl);

      const reference = `UTR-${device.invoice}`;
      await recordPayment(page, day(15), "40,000", reference);
      await expect(page).toHaveURL(invoiceUrl, { timeout: 15_000 });
      await expect(main(page).locator("dl")).toContainText("₹60,000");
      await expect(header(page).getByText("Overdue", { exact: true })).toBeVisible();

      await page.goto(overviewUrl);
      await expect(card(page, "Received")).toContainText("₹40,000");
      await expect(card(page, "Received")).toContainText("1 payment");
      await expect(card(page, "Outstanding today")).toContainText("₹60,000 overdue (1 invoice)");

      // The same payment again is stopped before it is saved.
      await recordPayment(page, day(15), "40,000", reference);
      await expect(page.getByText("This looks like a payment you have already recorded")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: "Record anyway" })).toBeVisible();
      await page.getByRole("link", { name: "Cancel" }).click();
      await page.goto(overviewUrl);
      await expect(card(page, "Received")).toContainText("1 payment");
      await card(page, "Received").getByRole("link", { name: "₹40,000" }).click();
      // A phone leaves out the reference column.
      await expect(main(page).getByRole("row", { name: new RegExp(device.company) })).toContainText("₹40,000");
      await expect(main(page).getByText("Showing 1–1 of 1")).toBeVisible();

      await recordPayment(page, day(28), "60,000", `${reference}-2`);
      await expect(page).toHaveURL(invoiceUrl, { timeout: 15_000 });
      await expect(header(page).getByText("Paid", { exact: true })).toBeVisible();
      await expect(main(page).getByRole("list", { name: "Payments" }).getByRole("listitem")).toHaveCount(2);

      await page.goto(overviewUrl);
      await expect(card(page, "Received")).toContainText("₹1,00,000");
      await expect(card(page, "Received")).toContainText("2 payments");
      await expect(card(page, "Outstanding today")).toContainText("Nothing is owed");
    });

    test("journey 9: the month's money in reports, and Not enough data where nothing counts", async ({
      page,
    }) => {
      await page.goto(overviewUrl);
      await main(page).getByRole("navigation", { name: "Money" }).getByRole("link", { name: "Reports" }).click();
      await expect(page).toHaveURL(/\/money\/reports/);
      await setDates(page);
      const reports = page.url();
      await checkFits(page, "the reports");

      const month = card(page, "Revenue by month").getByRole("row", { name: new RegExp(device.monthName) });
      await expect(month).toContainText("₹1,00,000");
      // Each payment is split across the invoice's lines by their amounts.
      const services = card(page, "Revenue by service");
      await expect(services.getByRole("row", { name: /Branding/ })).toContainText("₹60,000");
      await expect(services.getByRole("row", { name: /Websites/ })).toContainText("₹40,000");
      // Issued on the 6th, paid in full on the 28th.
      await expect(card(page, "Time to payment").getByRole("link", { name: "22 days" })).toBeVisible();
      for (const title of ["Follow-up compliance", "Reply rate", "Proposal acceptance"]) {
        await expect(card(page, title)).toContainText("Not enough data.");
      }

      const client = card(page, "Revenue by client").getByRole("row", { name: new RegExp(device.company) });
      await expect(client).toContainText("₹1,00,000");
      await client.getByRole("link", { name: device.company }).click();
      await expect(page).toHaveURL(new RegExp(`/money/payments\\?.*company=${ID}`));
      await expect(main(page).getByText("Showing 1–2 of 2")).toBeVisible();
      await checkFits(page, "the client's payments");

      await page.goto(reports);
      await card(page, "Time to payment").getByRole("link", { name: "22 days" }).click();
      await expect(page).toHaveURL(/\/money\/reports\/time-to-payment/);
      await expect(main(page).getByRole("row", { name: new RegExp(device.invoice) })).toContainText(/22$/);
    });
  });
}
