import { expect, test } from "@playwright/test";
import { CRON_SECRET } from "../playwright.config";

const owner = {
  name: "Priya Owner",
  email: "owner@example.com",
  password: "correct-horse-battery-staple",
};
// Sign-in is rate limited, so later tests reuse the session created during first run.
const OWNER_SESSION = "e2e/.auth/owner.json";

test.describe.configure({ mode: "serial" });

test("first run: create the owner and finish onboarding", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Your name").fill(owner.name);
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Create owner account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Base currency").selectOption("INR");
  await page.getByLabel("Time zone").selectOption("UTC");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  // A CSP violation would surface here as a console error.
  expect(consoleErrors).toEqual([]);

  await page.context().storageState({ path: OWNER_SESSION });
});

test("sign-up is closed once the owner exists", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/sign-in$/);

  const response = await request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: {
      name: "Intruder",
      email: "intruder@example.com",
      password: "another-long-password-123",
    },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).message).toContain("already has an owner");
});

test("protected pages need a session, and a wrong password is refused", async ({
  page,
}) => {
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill("wrong-password-entirely");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the scheduler endpoint rejects a missing or wrong secret", async ({
  request,
}) => {
  expect((await request.post("/api/jobs/tick")).status()).toBe(401);
  const wrong = await request.post("/api/jobs/tick", {
    headers: { authorization: "Bearer wrong" },
  });
  expect(wrong.status()).toBe(401);
  expect(wrong.headers()["content-security-policy"]).toContain(
    "default-src 'none'",
  );
});

test("security headers are set on pages", async ({ request }) => {
  const headers = (await request.get("/sign-in")).headers();
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-/,
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test.describe("signed in", () => {
  test.use({ storageState: OWNER_SESSION });

  test("settings persist and are audited", async ({ page }) => {
    await page.goto("/settings/profile");
    await page.getByLabel("Time zone").selectOption("Asia/Calcutta");
    await page.getByLabel("Financial year starts in").selectOption("4");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Calcutta");
    await expect(page.getByLabel("Financial year starts in")).toHaveValue("4");
    await expect(page.getByLabel("Base currency")).toHaveValue("INR");

    await page.goto("/settings/audit");
    await expect(
      page.getByRole("cell", { name: "settings.update" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "settings.create" }),
    ).toBeVisible();
  });

  test("a scheduler run shows up in System status", async ({ page, request }) => {
    await page.goto("/settings/system");
    await expect(page.getByText("Reachable")).toBeVisible();
    await expect(page.getByText("No run recorded yet")).toBeVisible();

    const tick = await request.post("/api/jobs/tick", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(tick.status()).toBe(200);
    expect(await tick.json()).toEqual({ done: 1, retried: 0, failed: 0 });

    await page.reload();
    await expect(page.getByText("Running", { exact: true })).toBeVisible();
  });

  test("the security page lists this device", async ({ page }) => {
    await page.goto("/settings/security");
    await expect(page.getByText("This device")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Change password" }),
    ).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the bottom bar replaces the sidebar", async ({ page }) => {
      await page.goto("/");
      const bottomBar = page.getByRole("navigation", { name: "Main" }).last();
      await expect(bottomBar).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();

      await bottomBar.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings\/profile$/);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows).toBe(false);
    });
  });

  // Last in this group: signing out ends the shared session.
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
