import { expect, test } from "@playwright/test";
import { CRON_SECRET } from "../playwright.config";
import { owner, OWNER_SESSION } from "./support";

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

test("the brand mark and its icons are served", async ({ page, request }) => {
  for (const [path, type] of [
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
  ]) {
    const answer = await request.get(path);
    expect(answer.status()).toBe(200);
    expect(answer.headers()["content-type"]).toContain(type);
  }
  expect((await request.get("/favicon.ico")).status()).toBe(200);

  const mark = await request.get("/Images/touchpoint-mark.svg");
  expect(mark.status()).toBe(200);
  expect(mark.headers()["cache-control"]).toBe("public, max-age=86400");

  for (const path of ["/sign-in", "/about", "/privacy", "/no-such-page"]) {
    await page.goto(path);
    const image = page.locator('img[src*="touchpoint-mark"]');
    await expect(image).toBeVisible();
    expect(
      await image.evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(page.getByText("Touchpoint", { exact: true })).toBeVisible();
  }
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

  test("the brand mark is in the top bar", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").locator('img[src*="touchpoint-mark"]'),
    ).toBeVisible();
  });

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

  test("the sidebar resizes by dragging, persists and still navigates", async ({
    page,
  }) => {
    await page.goto("/");
    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(handle).toBeVisible();

    // The account menu is at the foot of the sidebar and out of the top bar.
    const account = { name: "Account" };
    await expect(
      page.getByRole("complementary").getByRole("button", account),
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("button", account),
    ).toBeHidden();

    // Collapse with a double-click; the control is wired up after hydration,
    // so an early interaction can be missed.
    await expect(async () => {
      await handle.dblclick();
      await expect(handle).toHaveAttribute("aria-valuenow", "56", {
        timeout: 1_000,
      });
    }).toPass();

    await page.reload();
    await expect(handle).toHaveAttribute("aria-valuenow", "56");

    // Expand with the keyboard fallback, then navigate.
    await page.keyboard.press("Control+b");
    await expect(handle).not.toHaveAttribute("aria-valuenow", "56");
    await page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name: "Tasks" })
      .click();
    await expect(page).toHaveURL(/\/tasks$/);

    // Collapse again via the keyboard fallback.
    await page.keyboard.press("Control+b");
    await expect(handle).toHaveAttribute("aria-valuenow", "56");
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the bottom bar replaces the sidebar", async ({ page }) => {
      await page.goto("/");
      const bottomBar = page.getByRole("navigation", { name: "Main" }).last();
      await expect(bottomBar).toBeVisible();
      await expect(
        page.getByRole("separator", { name: "Resize sidebar" }),
      ).toBeHidden();
      // With no sidebar, the account menu stays in the top bar.
      await expect(
        page.getByRole("banner").getByRole("button", { name: "Account" }),
      ).toBeVisible();

      await bottomBar.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings\/profile$/);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows).toBe(false);
    });
  });
});
