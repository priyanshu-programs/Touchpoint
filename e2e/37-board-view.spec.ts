import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.use({ storageState: OWNER_SESSION });

const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const savedWord = (page: Page) => page.getByText("Saved", { exact: true });
const zoomLevel = (page: Page) =>
  page.locator(".excalidraw .reset-zoom-button").innerText();

// The exact zoom and position: a layer under the drawing is placed by them.
const view = (page: Page) =>
  page
    .locator(".sticky-shadows .sticky-layer")
    .evaluate((layer: HTMLElement) => layer.style.transform);

async function drawBox(page: Page) {
  await page.keyboard.press("r");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(savedWord(page)).toBeVisible();
}

async function moveAndZoom(page: Page) {
  const before = await view(page);
  await page.mouse.move(600, 400);
  await page.mouse.wheel(170, 90);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -30);
  await page.keyboard.up("Control");
  await expect.poll(() => view(page)).not.toBe(before);
}

const BOARDS = [
  {
    kind: "brainstorm board",
    list: "Brainstorming",
    make: async (page: Page, name: string) => {
      await page.goto("/brainstorm");
      await page.getByRole("main").getByRole("button", { name: "New board" }).click();
      const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Create board" }).click();
      await expect(page).toHaveURL(/\/brainstorm\/[0-9a-f-]{36}$/);
    },
  },
  {
    kind: "workflow",
    list: "Workflows",
    make: async (page: Page, name: string) => {
      await page.goto("/workflows/new");
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Create workflow" }).click();
      await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
    },
  },
];

for (const { kind, list, make } of BOARDS) {
  test.describe(kind, () => {
    test("first opens with the whole drawing in view, and that is not remembered", async ({
      page,
    }) => {
      await make(page, `${kind} never moved`);
      await expect(whiteboard(page)).toBeVisible();
      await drawBox(page);

      await page.reload();
      await expect(whiteboard(page)).toBeVisible();
      await expect(zoomLevel(page)).resolves.toBe("100%");
      // Fitted, so centred on the box and not at the board's origin.
      await expect.poll(() => view(page)).not.toBe("scale(1) translate(0px, 0px)");
      await page.waitForTimeout(800);
      const kept = await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith("board-view:")),
      );
      expect(kept.some((key) => page.url().endsWith(key.slice("board-view:".length)))).toBe(
        false,
      );
    });

    test("reopens at the exact zoom and place, even when reloaded straight after moving", async ({
      page,
    }) => {
      // The wait before a view is written never ends here, so only the write as
      // the page goes can keep it.
      await page.addInitScript(() => {
        const real = window.setTimeout;
        window.setTimeout = ((run: TimerHandler, wait?: number, ...rest: unknown[]) =>
          wait === 500 ? 0 : real(run, wait, ...rest)) as typeof window.setTimeout;
      });
      await make(page, `${kind} moved`);
      await expect(whiteboard(page)).toBeVisible();
      await drawBox(page);

      await moveAndZoom(page);
      const left = await view(page);
      const zoom = await zoomLevel(page);
      expect(zoom).not.toBe("100%");

      await page.reload();
      await expect(whiteboard(page)).toBeVisible();
      await expect.poll(() => view(page)).toBe(left);
      expect(await zoomLevel(page)).toBe(zoom);

      // And again, with nothing moved in between.
      await page.reload();
      await expect(whiteboard(page)).toBeVisible();
      await expect.poll(() => view(page)).toBe(left);
    });

    test("left over an empty part of the board, it reopens there with a way back", async ({
      page,
    }) => {
      await make(page, `${kind} far away`);
      await expect(whiteboard(page)).toBeVisible();
      await drawBox(page);

      await page.mouse.move(600, 400);
      for (let i = 0; i < 5; i += 1) await page.mouse.wheel(3000, 2000);
      const back = page.getByRole("button", { name: "Scroll back to content" });
      await expect(back).toBeVisible();
      const left = await view(page);

      // Left by the page's own link, then opened again.
      const address = page.url();
      await page.getByRole("link", { name: list, exact: true }).click();
      await expect(page).not.toHaveURL(address);
      await page.goto(address);
      await expect(whiteboard(page)).toBeVisible();
      await expect.poll(() => view(page)).toBe(left);
      await expect(back).toBeVisible();

      await back.click();
      await expect(back).toBeHidden();
    });

    test("an empty board opens where it was left too", async ({ page }) => {
      await make(page, `${kind} empty`);
      await expect(whiteboard(page)).toBeVisible();
      await expect(savedWord(page)).toBeVisible();

      await moveAndZoom(page);
      const left = await view(page);
      await page.reload();
      await expect(whiteboard(page)).toBeVisible();
      await expect.poll(() => view(page)).toBe(left);
    });
  });
}
