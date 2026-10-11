import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The sidebar also has links named like the tabs, so tab clicks are scoped to the record's own tab bar.
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact" });
const organizationTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });

// The owner's time zone was set to Asia/Calcutta in 01-foundation.
const ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const localDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

async function openContactTimeline(page: Page, name: string) {
  await page.goto("/people/contacts");
  await page.getByRole("link", { name, exact: true }).click();
  await contactTabs(page).getByRole("link", { name: "Timeline" }).click();
}

test("log a call from a contact; the timeline and the task list update together", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openContactTimeline(page, "Priya Sharma");
  await expect(page.getByText("Nothing logged yet.")).toBeVisible();

  await page.getByRole("link", { name: "Log activity" }).click();
  // The contact and their organization arrive filled in.
  await expect(
    page.getByRole("button", { name: "Remove contact: Priya Sharma" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /company: Acme Design/ }),
  ).toBeVisible();

  await page.getByLabel("Type").selectOption("call");
  await page.getByLabel("Direction").selectOption("outbound");
  await page.getByLabel("Summary").fill("Intro call");
  await page.getByLabel("Notes").fill("Walked through the brief.\nShe leads the redesign.");
  await page.getByLabel("Outcome").fill("Wants a proposal by Friday");
  await page.getByLabel("Follow-up date").fill(localDate(3));
  await page.getByLabel("Follow-up task").fill("Send the proposal draft");
  await page.getByRole("button", { name: "Log activity" }).click();

  await expect(page).toHaveURL(/\/people\/contacts\/[0-9a-f-]+\/timeline$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Intro call" })).toBeVisible();
  await expect(page.getByText("Wants a proposal by Friday")).toBeVisible();
  await expect(page.getByText("She leads the redesign.")).toBeVisible();

  await contactTabs(page).getByRole("link", { name: "Tasks" }).click();
  await expect(
    page.getByRole("link", { name: "Send the proposal draft" }),
  ).toBeVisible();

  // The same call is part of the organization's history.
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Acme Design" }).click();
  await organizationTabs(page).getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByRole("link", { name: "Intro call" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("an activity can involve a second contact, be edited and be deleted", async ({
  page,
}) => {
  await openContactTimeline(page, "Priya Sharma");
  await page.getByRole("link", { name: "Intro call" }).click();

  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByPlaceholder("Search contacts…").fill("Arjun");
  await page.getByRole("option", { name: /Arjun Rao/ }).click();
  await page.getByLabel("Summary").fill("Discovery call");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await openContactTimeline(page, "Arjun Rao");
  await expect(page.getByRole("link", { name: "Discovery call" })).toBeVisible();

  await page.getByRole("link", { name: "Discovery call" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/people\/contacts\/[0-9a-f-]+\/timeline$/);
  await expect(page.getByText("Nothing logged yet.")).toBeVisible();
});

test("a rejected activity form explains why and keeps what was typed", async ({
  page,
}) => {
  await page.goto("/activities/new");
  await page.getByLabel("Type").selectOption("meeting");
  await page.getByLabel("Summary").fill("Unattached meeting");
  await page.getByRole("button", { name: "Log activity" }).click();

  await expect(
    page.getByText("Choose a contact or a company"),
  ).toBeVisible();
  await expect(page.getByLabel("Summary")).toHaveValue("Unattached meeting");
  await expect(page.getByLabel("Type")).toHaveValue("meeting");

  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByPlaceholder("Search contacts…").fill("Priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
  await page.getByLabel("Follow-up task").fill("No date given");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Choose a date for the follow-up")).toBeVisible();
  // The chosen contact survives the rejection.
  await expect(
    page.getByRole("button", { name: /Remove contact: Priya Sharma/ }),
  ).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("activity screens fit the screen", async ({ page }) => {
    await page.goto("/activities/new");
    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByPlaceholder("Search contacts…").fill("Priya");
    await page.getByRole("option", { name: /Priya Sharma/ }).first().click();
    await page
      .getByLabel("Summary")
      .fill("A long note about a conversation that ran over several topics");
    await page.getByRole("button", { name: "Log activity" }).click();
    await expect(page).toHaveURL(/\/timeline$/);

    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    expect(await fits()).toBe(true);
    await page.getByRole("link", { name: /A long note about/ }).click();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    expect(await fits()).toBe(true);
    await page.goto("/activities/new");
    await expect(page.getByRole("main")).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
