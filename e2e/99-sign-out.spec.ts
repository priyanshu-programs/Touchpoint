import { expect, test } from "@playwright/test";
import { owner, OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });

test.describe("signed in", () => {
  test.use({ storageState: OWNER_SESSION });

  // Signing out ends the session every other file shares, so this file runs last.
  test("the command palette navigates, and signing out ends the session", async ({
    page,
  }) => {
    await page.goto("/");
    const filter = page.getByPlaceholder("Type to filter…");
    // The shortcut is bound after hydration, so an early key press can be missed.
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(filter).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await filter.fill("sett");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/profile$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test("repeated sign-in attempts are rate limited", async ({ request, baseURL }) => {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL! },
      data: { email: owner.email, password: "wrong-password-entirely" },
    });
    statuses.push(response.status());
  }
  expect(statuses).toContain(429);
});
