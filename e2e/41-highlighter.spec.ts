import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.use({ storageState: OWNER_SESSION });

type Stroke = {
  id: string;
  type: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  isDeleted?: boolean;
};

const MARKER = { type: "freedraw", strokeColor: "#fab005", strokeWidth: 6, opacity: 40 };
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const highlighter = (page: Page) => page.getByRole("button", { name: "Highlighter" });
const boardIdOf = (page: Page) => page.url().split("/").pop()!;

async function stroke(page: Page, y: number) {
  await page.mouse.move(420, y);
  await page.mouse.down();
  await page.mouse.move(760, y, { steps: 10 });
  await page.mouse.up();
}

const strokes = (elements: Stroke[]) =>
  elements
    .filter(({ type, isDeleted }) => type === "freedraw" && !isDeleted)
    .map(({ type, strokeColor, strokeWidth, opacity }) => ({
      type,
      strokeColor,
      strokeWidth,
      opacity,
    }));

test("a brainstorm board's highlighter draws a wide see-through yellow stroke, and the pen comes back as it was", async ({
  page,
}) => {
  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(`Highlights ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create board" }).click();
  // The first open after a build can take a while on a slow machine.
  await expect(whiteboard(page)).toBeVisible({ timeout: 20_000 });
  const stored = async () =>
    strokes(
      (
        (await (
          await page.request.get(`/api/brainstorm/${boardIdOf(page)}/elements?since=0`)
        ).json()) as { elements: Stroke[] }
      ).elements,
    );

  await highlighter(page).click();
  await expect(highlighter(page)).toHaveAttribute("aria-pressed", "true");
  await stroke(page, 300);
  await expect.poll(stored, { timeout: 20_000 }).toEqual([MARKER]);

  // Pressed again, it gives the pen back with what it had before.
  await highlighter(page).click();
  await expect(highlighter(page)).toHaveAttribute("aria-pressed", "false");
  await page.locator('label:has([data-testid="toolbar-freedraw"])').click();
  await stroke(page, 420);
  // The server lists strokes by id, so the order is the toss of a coin.
  await expect.poll(stored, { timeout: 20_000 }).toHaveLength(2);
  expect(await stored()).toEqual(
    expect.arrayContaining([
      MARKER,
      { type: "freedraw", strokeColor: "#1e1e1e", strokeWidth: 2, opacity: 100 },
    ]),
  );

  // Choosing another tool also puts the highlighter away.
  await highlighter(page).click();
  await page.locator('label:has([data-testid="toolbar-selection"])').click();
  await expect(highlighter(page)).toHaveAttribute("aria-pressed", "false");

  // Still there after a reload.
  await page.reload();
  // The first open after a build can take a while on a slow machine.
  await expect(whiteboard(page)).toBeVisible({ timeout: 20_000 });
  await expect.poll(stored).toHaveLength(2);
});

test("a workflow's highlighter is saved with the drawing, and on a phone it waits above the bar", async ({
  page,
}) => {
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill(`Highlights ${Date.now()}`);
  await page.getByRole("button", { name: "Create workflow" }).click();
  // The first open after a build can take a while on a slow machine.
  await expect(whiteboard(page)).toBeVisible({ timeout: 20_000 });
  const stored = async () =>
    strokes(
      (
        (await (
          await page.request.get(`/api/workflows/${boardIdOf(page)}/scene`)
        ).json()) as { elements: Stroke[] }
      ).elements,
    );

  await highlighter(page).click();
  await stroke(page, 300);
  await expect.poll(stored, { timeout: 20_000 }).toEqual([MARKER]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(highlighter(page)).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
