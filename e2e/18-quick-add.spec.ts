import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const ID = "[0-9a-f-]{36}";
const WORKFLOW = "Lead intake";

async function openFromButton(page: Page) {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Quick add" }).click();
  await expect(page.getByRole("heading", { name: "Quick add" })).toBeVisible();
}

test("a person, a new company, a workflow and a follow-up in one form", async ({ page }) => {
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill(WORKFLOW);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${ID}$`));

  await openFromButton(page);
  await page.getByLabel("First name").fill("Nisha");
  await page.getByLabel("Last name").fill("Kapoor");
  await page.getByLabel("Email").fill("nisha@quickadd.test");
  await page.getByLabel("Job title").fill("Founder");
  await expect(page.getByRole("radio", { name: "New company" })).toBeChecked();
  await page.getByLabel("Company name").fill("Quickadd Studio");
  await page.getByLabel("Domain").fill("quickadd.test");
  await page.getByLabel("Start a workflow").selectOption({ label: WORKFLOW });
  await expect(page.getByLabel("Follow up on")).not.toHaveValue("");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`/people/organizations\\?company=(${ID})&contact=${ID}$`),
  );
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Nisha Kapoor" })).toBeVisible();
  const [, company, contact] = /company=([^&]+)&contact=(.+)$/.exec(page.url())!;

  await page.goto(`/people/organizations?company=${company}&tab=workflows`);
  await expect(page.getByRole("dialog").getByText(WORKFLOW)).toBeVisible();

  await page.goto(`/people/organizations?company=${company}&contact=${contact}&tab=tasks`);
  await expect(page.getByRole("dialog").getByText("Follow up with Nisha Kapoor")).toBeVisible();
});

test("from the palette, at an existing company, with no task", async ({ page }) => {
  await page.goto("/");
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder("Search or jump to…")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByPlaceholder("Search or jump to…").fill("quick");
  await page.getByRole("option", { name: "Quick add" }).click();
  await expect(page).toHaveURL(/\/quick-add$/);

  await page.getByLabel("First name").fill("Owen");
  await page.getByLabel("Last name").fill("Pereira");
  await page.getByText("Existing company").click();
  await page.getByRole("button", { name: "Choose company" }).click();
  await page.getByPlaceholder("Search companies…").fill("Acme");
  await page.getByRole("option", { name: /Acme Design/ }).first().click();
  await page.getByLabel("Follow up on").fill("");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/people/organizations\\?company=${ID}&contact=${ID}$`));
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Owen Pereira" })).toBeVisible();
  await page.goto(`${page.url()}&tab=tasks`);
  await expect(page.getByRole("dialog").getByText("Follow up with Owen")).toHaveCount(0);
});

test("an email already held is refused with a link to its person, and nothing is added", async ({ page }) => {
  await openFromButton(page);
  await page.getByLabel("First name").fill("Tara");
  await page.getByLabel("Email").fill("nisha@quickadd.test");
  await page.getByText("No company").click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("That email already belongs to Nisha Kapoor.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Nisha Kapoor" })).toBeVisible();
  await expect(page).toHaveURL(/\/quick-add$/);
  await expect(page.getByLabel("First name")).toHaveValue("Tara");
  await expect(page.getByRole("radio", { name: "No company" })).toBeChecked();
});

test("a look-alike name asks first, then Add anyway adds them", async ({ page }) => {
  await openFromButton(page);
  await page.getByLabel("First name").fill("Nisha");
  await page.getByLabel("Last name").fill("Kapoor");
  await page.getByText("No company").click();
  await page.getByLabel("Follow up on").fill("");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("A person with a similar name already exists.")).toBeVisible();
  await expect(page.getByLabel("Last name")).toHaveValue("Kapoor");
  await page.getByRole("button", { name: "Add anyway" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/contacts\\?contact=${ID}$`));
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Nisha Kapoor" })).toBeVisible();
});

test("on a phone, the + button opens the form and it fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFromButton(page);
  await expect(page.getByLabel("First name")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
