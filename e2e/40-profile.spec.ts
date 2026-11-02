import { expect, test, type Page } from "@playwright/test";
import { owner, OWNER_SESSION } from "./support";

test.use({ storageState: OWNER_SESSION });
// Every test renames the one owner, so they take turns.
test.describe.configure({ mode: "serial" });

const save = (page: Page) =>
  page.getByRole("button", { name: "Save profile" }).click();
const fullName = (page: Page) => page.getByLabel("Full name *");
const calledAs = (page: Page) =>
  page.getByLabel("You want to be referred to as *");

// An open panel hides the top bar from role lookups, so it is found by its element. Two of
// the day's lines name nobody ("Hello, night owl"), and the server's clock picks the line.
const greetingOf = (page: Page) => page.locator("header");
const greets = (name: string) => new RegExp(`${name}|night owl|early bird`);

async function openFrom(page: Page, place: "complementary" | "banner") {
  // Wired up after hydration, so an early click can be missed.
  await expect(async () => {
    await page.getByRole(place).getByRole("button", { name: "Account" }).click();
    await expect(fullName(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.afterAll(async ({ browser }) => {
  // The last test's phone width would otherwise carry over, and a phone has no sidebar.
  const context = await browser.newContext({
    storageState: OWNER_SESSION,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await openFrom(page, "complementary");
  await fullName(page).fill(owner.name);
  await calledAs(page).fill("Priya");
  await save(page);
  await expect(page.getByText("Saved.")).toBeVisible();
  await context.close();
});

test("the name given in the profile is the one the greeting uses", async ({
  page,
}) => {
  await page.goto("/");
  await openFrom(page, "complementary");
  await expect(page.getByText(owner.email)).toBeVisible();

  // A refusal says why and keeps what was typed.
  await fullName(page).fill("Maple Owner");
  await calledAs(page).fill("   ");
  await page.getByLabel("Business name (optional)").fill("Maple Studio");
  await save(page);
  await expect(
    page.getByText("Enter the name you want to be referred to as"),
  ).toBeVisible();
  await expect(page.getByLabel("Business name (optional)")).toHaveValue(
    "Maple Studio",
  );

  await calledAs(page).fill("Boss");
  await page.getByLabel("Website (optional)").fill("maple.test");
  await save(page);
  await expect(
    page.getByText("Enter a link that starts with http:// or https://"),
  ).toBeVisible();

  // Optional fields can stay empty, and the greeting follows without a reload.
  await page.getByLabel("Website (optional)").fill("");
  await calledAs(page).fill("Mr Maple");
  await save(page);
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(greetingOf(page)).toContainText(greets("Mr Maple"));

  await page.reload();
  await expect(greetingOf(page)).toContainText(greets("Mr Maple"));
  await expect(page.getByText("Welcome, Mr Maple.")).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("Maple Owner");

  await openFrom(page, "complementary");
  await expect(fullName(page)).toHaveValue("Maple Owner");
  await expect(calledAs(page)).toHaveValue("Mr Maple");
  await expect(page.getByLabel("Business name (optional)")).toHaveValue(
    "Maple Studio",
  );
  await expect(page.getByLabel("Job title (optional)")).toHaveValue("");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the profile opens from the top bar and fits the screen", async ({
    page,
  }) => {
    await page.goto("/");
    await openFrom(page, "banner");
    await calledAs(page).fill("Phone Maple");
    await page.getByLabel("Location (optional)").fill("Pune");
    await save(page);
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
    await expect(greetingOf(page)).toContainText(greets("Phone Maple"));
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
