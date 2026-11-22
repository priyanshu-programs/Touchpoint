import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog").first();
const companyTabs = (page: Page) => page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) => page.getByRole("navigation", { name: "Contact", exact: true });
const COMPANY_FACT = "Invoices go to the finance team";
const PERSON_FACT = "Approves invoices on Mondays";
const FROM_COMPANY = "Signs off designs on Thursdays";

async function openMemory(page: Page) {
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Acme Design" }).click();
  await companyTabs(page).getByRole("link", { name: "Memory" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+&tab=memory/);
}

// Acme Design and its people come from the People tests; nothing about them is remembered yet.
test("a company's Memory tab draws it with everyone at it, adds a memory, and lists who is unknown", async ({
  page,
}) => {
  await openMemory(page);
  await expect(panel(page).getByRole("img", { name: /^Memory graph: 0 memories, \d+ people and companies\./ })).toBeVisible();
  await expect(panel(page).getByText("Hollow dots are people the assistant knows nothing about yet.")).toBeVisible();

  await panel(page).getByLabel("Remember", { exact: true }).fill(COMPANY_FACT);
  await panel(page).getByRole("button", { name: "Add memory" }).click();
  await expect(panel(page).getByRole("status")).toHaveText("Remembered.");
  await expect(panel(page).getByRole("img", { name: /^Memory graph: 1 memory,/ })).toBeVisible();

  await panel(page).getByLabel("Remember", { exact: true }).fill(COMPANY_FACT.toLowerCase());
  await panel(page).getByRole("button", { name: "Add memory" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("That is remembered already.");

  // About one of the company's people, added from the company.
  await panel(page).getByLabel("About", { exact: true }).selectOption("Arjun Rao");
  await panel(page).getByLabel("Remember", { exact: true }).fill(FROM_COMPANY);
  await panel(page).getByRole("button", { name: "Add memory" }).click();
  await expect(panel(page).getByRole("img", { name: /^Memory graph: 2 memories,/ })).toBeVisible();
  await expect(panel(page).getByLabel("About", { exact: true })).toHaveValue("0");

  await panel(page).getByRole("group", { name: "Memory view" }).getByRole("button", { name: "List" }).click();
  await expect(panel(page).getByRole("region", { name: "Acme Design" }).getByText(COMPANY_FACT)).toBeVisible();
  await expect(panel(page).getByRole("region", { name: "Arjun Rao" }).getByText(FROM_COMPANY)).toBeVisible();
  await expect(
    panel(page).getByRole("region", { name: "Nothing remembered yet" }).getByRole("link", { name: "Priya Sharma" }),
  ).toBeVisible();
});

test("a person's Memory tab adds a memory about them, which then hangs off them in the company's graph", async ({
  page,
}) => {
  await openMemory(page);
  await panel(page).getByRole("group", { name: "Memory view" }).getByRole("button", { name: "List" }).click();
  await panel(page).getByRole("region", { name: "Nothing remembered yet" }).getByRole("link", { name: "Priya Sharma" }).click();
  await expect(page).toHaveURL(/[?&]contact=[0-9a-f-]+/);
  await expect(page).toHaveURL(/[?&]tab=memory/);
  await expect(contactTabs(page).getByRole("link", { name: "Memory" })).toHaveAttribute("aria-current", "page");
  await expect(panel(page).getByText("Nothing remembered about Priya Sharma yet.")).toBeVisible();

  await panel(page).getByLabel("Remember", { exact: true }).fill(PERSON_FACT);
  await panel(page).getByRole("button", { name: "Add memory" }).click();
  await expect(panel(page).getByText(PERSON_FACT)).toBeVisible();
  await page.reload();
  await expect(panel(page).getByText(PERSON_FACT)).toBeVisible();

  await panel(page).getByRole("link", { name: "Acme Design" }).last().click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+&tab=memory$/);
  await expect(panel(page).getByRole("img", { name: /^Memory graph: 3 memories,/ })).toBeVisible();
  await panel(page).getByRole("group", { name: "Memory view" }).getByRole("button", { name: "List" }).click();
  await expect(panel(page).getByRole("region", { name: "Priya Sharma" }).getByText(PERSON_FACT)).toBeVisible();
});

test("the graph goes full screen and Escape brings it back without closing the company", async ({ page }) => {
  await openMemory(page);
  await panel(page).getByRole("button", { name: "Full screen" }).click();
  const full = page.getByRole("dialog", { name: "Memory graph, full screen" });
  await expect(full).toBeVisible();
  const box = await full.getByRole("img").boundingBox();
  expect(box?.width).toBe(page.viewportSize()?.width);
  await page.keyboard.press("Escape");
  await expect(full).toHaveCount(0);
  await expect(page).toHaveURL(/company=[0-9a-f-]+&tab=memory/);
  await expect(companyTabs(page)).toBeVisible();
});

test("See in the whole graph opens Settings → Memory on the company, full screen there too", async ({ page }) => {
  await openMemory(page);
  await panel(page).getByRole("link", { name: "See in the whole graph" }).click();
  await expect(page).toHaveURL(/\/settings\/memory\?view=graph&focus=company:[0-9a-f-]+$/);
  await expect(page.getByRole("main").getByText("Acme Design", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("dialog", { name: "Memory graph, full screen" })).toBeVisible();
  await page.getByRole("button", { name: "Leave full screen" }).click();
  await expect(page.getByRole("dialog", { name: "Memory graph, full screen" })).toHaveCount(0);
});

test("the memories are deleted from the company's list", async ({ page }) => {
  await openMemory(page);
  for (const fact of [COMPANY_FACT, PERSON_FACT, FROM_COMPANY]) {
    await panel(page).getByRole("group", { name: "Memory view" }).getByRole("button", { name: "List" }).click();
    await panel(page).getByRole("button", { name: `Delete memory: ${fact}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete memory" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(panel(page).getByText(fact, { exact: true })).toHaveCount(0);
  }
  await page.reload();
  await expect(panel(page).getByRole("img", { name: /^Memory graph: 0 memories,/ })).toBeVisible();
});
