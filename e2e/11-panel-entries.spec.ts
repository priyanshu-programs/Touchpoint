import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
// The sidebar also has links named like the tabs, so tab clicks are scoped to the record's own tab bar.
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });

// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

const ID = "[0-9a-f-]{36}";
const address = (pattern: string) => new RegExp(`${pattern}$`);

// A company and a person of this file's own, so the counts the earlier files rely on stay as they were.
test("from a company, an activity and its follow-up are logged, opened and changed in the panel", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill("Panel Works");
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(
    panel(page).getByRole("heading", { name: "Panel Works" }),
  ).toBeVisible();

  await companyTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Log activity" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=activity&activity=new`),
  );
  await expect(
    panel(page).getByRole("heading", { name: "Log activity" }),
  ).toBeVisible();
  // The company arrives filled in.
  await expect(
    panel(page).getByRole("button", { name: /company: Panel Works/ }),
  ).toBeVisible();
  await panel(page).getByLabel("Type").selectOption("meeting");
  await panel(page).getByLabel("Summary").fill("Kick-off meeting");
  await panel(page).getByLabel("Follow-up date").fill(localDate(2));
  await panel(page).getByLabel("Follow-up task").fill("Send the notes");
  await panel(page).getByRole("button", { name: "Log activity" }).click();

  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=activity`),
  );
  await panel(page).getByRole("link", { name: "Kick-off meeting" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=activity&activity=${ID}`),
  );
  await expect(
    panel(page).getByRole("heading", { name: "Kick-off meeting" }),
  ).toBeVisible();
  await panel(page).getByLabel("Summary").fill("Kick-off workshop");
  await panel(page).getByRole("button", { name: "Save changes" }).click();
  await expect(panel(page).getByText("Saved.")).toBeVisible();
  await expect(
    panel(page).getByRole("heading", { name: "Kick-off workshop" }),
  ).toBeVisible();
  await panel(page).getByRole("link", { name: "Back to Panel Works" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=activity`),
  );
  await expect(
    panel(page).getByRole("link", { name: "Kick-off workshop" }),
  ).toBeVisible();

  // The follow-up is a task of the company's, and opens the same way.
  await companyTabs(page).getByRole("link", { name: "Tasks" }).click();
  await panel(page).getByRole("link", { name: "Send the notes" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=tasks&task=${ID}`),
  );
  await expect(panel(page).getByLabel("Due date")).toHaveValue(localDate(2));
  await panel(page).getByLabel("Priority").selectOption("high");
  await panel(page).getByRole("button", { name: "Save changes" }).click();
  await expect(panel(page).getByText("Saved.")).toBeVisible();
  await panel(page).getByRole("button", { name: "Complete", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=tasks&task=${ID}`),
  );
  await panel(page).getByRole("link", { name: "Back to Panel Works" }).click();
  await expect(panel(page).getByText("No open tasks.")).toBeVisible();
  await expect(panel(page).getByText("Recently done")).toBeVisible();

  await panel(page).getByRole("link", { name: "Add task" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=tasks&task=new`),
  );
  await expect(panel(page).getByRole("heading", { name: "Add task" })).toBeVisible();
  await panel(page).getByLabel("Task", { exact: true }).fill("Prepare the workshop");
  await panel(page).getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(address(`organizations\\?company=${ID}&tab=tasks`));
  await expect(
    panel(page).getByRole("link", { name: "Prepare the workshop" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a person opened inside a company stays there through a new task and a logged activity", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const inCompany = `organizations\\?company=${ID}&contact=${ID}`;

  await page.goto("/people/organizations?q=Panel");
  await page.getByRole("link", { name: "Panel Works" }).click();
  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Noor");
  await form.getByLabel("Last name").fill("Panelist");
  await form.getByRole("button", { name: "Add contact" }).click();
  await panel(page).getByRole("link", { name: "Noor Panelist" }).click();
  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();

  await panel(page).getByRole("link", { name: "Add task" }).click();
  // The person and the company arrive filled in.
  await expect(
    panel(page).getByRole("button", { name: /contact: Noor Panelist/ }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: /company: Panel Works/ }),
  ).toBeVisible();
  // Giving up goes back to the person, with the list behind still searched.
  await panel(page).getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?q=Panel&company=${ID}&contact=${ID}&tab=tasks`),
  );

  await panel(page).getByRole("link", { name: "Add task" }).click();
  await panel(page).getByLabel("Task", { exact: true }).fill("Call Noor");
  await panel(page).getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(address(`${inCompany}&tab=tasks`));
  await expect(
    panel(page).getByRole("heading", { name: "Noor Panelist" }),
  ).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Call Noor" })).toBeVisible();

  await contactTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Log activity" }).click();
  await panel(page).getByLabel("Summary").fill("Coffee with Noor");
  await panel(page).getByRole("button", { name: "Log activity" }).click();
  await expect(page).toHaveURL(address(`${inCompany}&tab=activity`));
  await expect(
    panel(page).getByRole("link", { name: "Coffee with Noor" }),
  ).toBeVisible();

  // Deleted from the company's timeline, it goes back to the company and not to the person on it.
  await panel(page).getByRole("link", { name: "Back to Panel Works" }).click();
  await companyTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Coffee with Noor" }).click();
  await panel(page).getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(
    address(`organizations\\?company=${ID}&tab=activity`),
  );
  await expect(
    panel(page).getByRole("link", { name: "Kick-off workshop" }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("link", { name: "Coffee with Noor" }),
  ).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("over the people list a task opens in the panel, and one that is not there shows the person", async ({
  page,
}) => {
  const person = `contacts\\?q=Noor&contact=${ID}`;

  await page.goto("/people/contacts?q=Noor");
  await page.getByRole("link", { name: "Noor Panelist", exact: true }).click();
  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
  await panel(page).getByRole("link", { name: "Call Noor" }).click();
  await expect(page).toHaveURL(address(`${person}&tab=tasks&task=${ID}`));
  await expect(panel(page).getByRole("heading", { name: "Call Noor" })).toBeVisible();
  await panel(page).getByRole("link", { name: "Back to Noor Panelist" }).click();
  await expect(page).toHaveURL(address(`${person}&tab=tasks`));

  await page.goto(`${page.url()}&task=00000000-0000-4000-8000-000000000000`);
  await expect(
    panel(page).getByRole("heading", { name: "Noor Panelist" }),
  ).toBeVisible();
  // The address that found nothing is not carried into the panel's links.
  await expect(panel(page).getByRole("link", { name: "Add task" })).toHaveAttribute(
    "href",
    /&tab=tasks&task=new$/,
  );
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the forms fit the panel", async ({ page }) => {
    // Asked until it holds: a view eases in from the right, and is wider than the panel while it does.
    const fits = () =>
      page
        .locator('[data-slot="sheet-content"]')
        .evaluate((sheet) => sheet.scrollWidth <= sheet.clientWidth);

    await page.goto("/people/contacts?q=Noor");
    await page.getByRole("link", { name: "Noor Panelist", exact: true }).click();
    await contactTabs(page).getByRole("link", { name: "Activity" }).click();
    await panel(page).getByRole("link", { name: "Log activity" }).click();
    await expect(
      panel(page).getByRole("heading", { name: "Log activity" }),
    ).toBeVisible();
    await expect.poll(fits).toBe(true);

    await panel(page).getByRole("link", { name: "Back to Noor Panelist" }).click();
    await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
    await panel(page).getByRole("link", { name: "Call Noor" }).click();
    await expect(panel(page).getByRole("heading", { name: "Call Noor" })).toBeVisible();
    await expect.poll(fits).toBe(true);
  });
});
