import { expect, test } from "@playwright/test";

const fits = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

test("About and Privacy open signed out, and say what Touchpoint does with Google", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { name: "Touchpoint: a private business system for one person" }),
  ).toBeVisible();
  await expect(page.getByText("reads their Google Calendar")).toBeVisible();

  await page.getByRole("link", { name: "How data is handled" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText("including the Limited Use requirements")).toBeVisible();
  await expect(page.getByText("Ask the person who runs this copy of Touchpoint.")).toBeVisible();

  await page.getByRole("contentinfo").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
});

test("every page carries the Search Console tag for the owner's site", async ({ page }) => {
  for (const path of ["/about", "/privacy", "/sign-in"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute(
      "content",
      "e2e-site-token",
    );
  }
});

test("both pages fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/about", "/privacy"]) {
    await page.goto(path);
    expect(await fits(page)).toBe(true);
  }
});
