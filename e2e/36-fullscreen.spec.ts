import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

const isFullscreen = (page: Page) =>
  page.evaluate(() => document.fullscreenElement === document.documentElement);

test("the manifest and its icons load signed out", async ({ request }) => {
  const answer = await request.get("/manifest.webmanifest");
  expect(answer.status()).toBe(200);
  const manifest = await answer.json();
  expect(manifest.display).toBe("fullscreen");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
  }
});

test.describe("signed in", () => {
  test.use({ storageState: OWNER_SESSION });

  test("the top bar's button enters and leaves, and fullscreen survives moving page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    expect(await isFullscreen(page)).toBe(true);

    await page.getByRole("complementary").getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks/);
    expect(await isFullscreen(page)).toBe(true);

    await page.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();
    expect(await isFullscreen(page)).toBe(false);
  });

  test("a brainstorm board and a workflow have the button, with dialogs still on top", async ({
    page,
  }) => {
    await page.goto("/brainstorm");
    await page.getByRole("main").getByRole("button", { name: "New board" }).click();
    const create = page.getByRole("dialog", { name: "New brainstorm board" });
    await create.getByLabel("Name").fill("Fullscreen check");
    await create.getByRole("button", { name: "Create board" }).click();
    await expect(page).toHaveURL(/\/brainstorm\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await page.getByRole("banner").getByRole("button", { name: "Board actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/brainstorm$/);
    expect(await isFullscreen(page)).toBe(true);
    await page.getByRole("button", { name: "Exit fullscreen" }).click();

    await page.goto("/workflows/new");
    await page.getByLabel("Name").fill("Fullscreen workflow");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await page.getByRole("button", { name: "Workflow actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  });

  test("where a browser can't go fullscreen, the button explains the Home Screen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      for (const name of ["fullscreenEnabled", "webkitFullscreenEnabled"]) {
        Object.defineProperty(Document.prototype, name, { get: () => false });
      }
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    const help = page.getByRole("dialog", { name: "Use Touchpoint fullscreen" });
    await expect(help).toContainText("Add to Home Screen");
    expect(await isFullscreen(page)).toBe(false);
  });

  test("a browser that refuses the request gets the same steps", async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("refused"));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(page.getByRole("dialog", { name: "Use Touchpoint fullscreen" })).toBeVisible();
  });

  test("opened from the Home Screen, there is no button", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "standalone", { get: () => true });
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Quick add" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter fullscreen" })).toHaveCount(0);
  });

  test("on a phone the button fits in the top bar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/");
    const button = page.getByRole("button", { name: "Enter fullscreen" });
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Account" })).toBeInViewport({ ratio: 1 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
