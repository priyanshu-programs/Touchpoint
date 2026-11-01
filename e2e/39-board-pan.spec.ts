import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.use({ storageState: OWNER_SESSION });

const BOARD = /\/brainstorm\/([0-9a-f-]{36})$/;
const FROM = [640, 360] as const;
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const menu = (page: Page) => page.locator(".excalidraw .context-menu");

async function newBrainstorm(page: Page, name: string) {
  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(`${name} ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(whiteboard(page)).toBeVisible();
  return BOARD.exec(page.url())![1];
}

async function newWorkflow(page: Page, name: string) {
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(whiteboard(page)).toBeVisible();
}

const paperX = (page: Page) =>
  page
    .locator(".board-paper")
    .evaluate((layer) => parseFloat(layer.style.getPropertyValue("--paper-x")) || 0);

async function drag(
  page: Page,
  button: "left" | "middle" | "right",
  to: readonly [number, number],
  from: readonly [number, number] = FROM,
) {
  await page.mouse.move(...from);
  await page.mouse.down({ button });
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up({ button });
}

const box = {
  id: "pan-box",
  type: "rectangle",
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  backgroundColor: "#ffec99",
  fillStyle: "solid",
};

const storedBox = async (page: Page, id: string) => {
  const answer = (await (
    await page.request.get(`/api/brainstorm/${id}/elements?since=0`)
  ).json()) as { elements: { id: string; x: number; version: number }[] };
  return answer.elements.find((element) => element.id === box.id)!;
};

test("holding the right button and dragging moves a brainstorm board, and it opens there again", async ({
  page,
}) => {
  const id = await newBrainstorm(page, "Pan brainstorm");
  const kept = () =>
    page.evaluate((key) => localStorage.getItem(key), `board-view:${id}`).then((text) =>
      text ? (JSON.parse(text) as { scrollX: number; scrollY: number }) : null,
    );

  await drag(page, "right", [FROM[0] + 150, FROM[1] + 80]);
  await expect.poll(kept).toMatchObject({ scrollX: 150, scrollY: 80 });
  await expect(menu(page)).toBeHidden();

  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await expect.poll(() => paperX(page)).toBeCloseTo(150, 0);
  expect(await kept()).toMatchObject({ scrollX: 150, scrollY: 80 });
});

test("a drag that starts on a box moves the board and leaves the box alone", async ({ page }) => {
  const id = await newBrainstorm(page, "Pan over box");
  const origin = new URL(page.url()).origin;
  const seeded = await page.request.patch(`/api/brainstorm/${id}/elements`, {
    headers: { origin },
    data: { since: 0, elements: [box] },
  });
  expect(seeded.status()).toBe(200);
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();

  // An only box is opened in the middle of the board, under this point.
  const canvas = (await whiteboard(page).boundingBox())!;
  const middle = [canvas.x + canvas.width / 2, canvas.y + canvas.height / 2] as const;
  await drag(page, "right", [middle[0] + 300, middle[1]], middle);
  await page.waitForTimeout(800);
  await expect(menu(page)).toBeHidden();
  expect(await storedBox(page, id)).toMatchObject({ x: 100, version: 1 });

  // It is where the view was dragged to, so an ordinary drag there still takes hold of it.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().endsWith(`/${id}/elements`),
  );
  await drag(page, "left", [middle[0] + 350, middle[1]], [middle[0] + 300, middle[1]]);
  await saved;
  await expect.poll(async () => (await storedBox(page, id)).x).toBeGreaterThan(100);
});

test("on a workflow: the right button pans, a right click opens the menu, the middle button still pans", async ({
  page,
}) => {
  await newWorkflow(page, "Pan workflow");
  const start = await paperX(page);

  await drag(page, "right", [FROM[0] + 200, FROM[1]]);
  await expect.poll(() => paperX(page)).toBeCloseTo(start + 200, 0);
  await expect(menu(page)).toBeHidden();

  await page.mouse.click(...FROM, { button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect.poll(() => paperX(page)).toBeCloseTo(start + 200, 0);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();

  // A shaky click is still a click.
  await drag(page, "right", [FROM[0] + 2, FROM[1] + 1]);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");

  await drag(page, "middle", [FROM[0] + 40, FROM[1]]);
  await expect.poll(() => paperX(page)).toBeCloseTo(start + 240, 0);
});

test("letting go over the header opens no menu of any kind", async ({ page }) => {
  await newBrainstorm(page, "Pan to header");
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { menuAsks: boolean[] }).menuAsks = seen;
    window.addEventListener("contextmenu", (event) => seen.push(event.defaultPrevented), {
      capture: true,
    });
  });

  await drag(page, "right", [FROM[0], 20]);
  await expect(menu(page)).toBeHidden();
  const asks = await page.evaluate(() => (window as unknown as { menuAsks: boolean[] }).menuAsks);
  expect(asks.length).toBeGreaterThan(0);
  expect(asks.every(Boolean)).toBe(true);
});

test("where the menu is asked for as the button goes down, it waits for a click and never opens on a drag", async ({
  page,
}) => {
  await newBrainstorm(page, "Pan mac");
  const askNow = () =>
    whiteboard(page).evaluate((canvas, [clientX, clientY]) => {
      canvas.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 2,
          clientX,
          clientY,
        }),
      );
    }, FROM);

  await page.mouse.move(...FROM);
  await page.mouse.down({ button: "right" });
  await askNow();
  await page.waitForTimeout(200);
  await expect(menu(page)).toBeHidden();
  await page.mouse.up({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();

  await page.mouse.down({ button: "right" });
  await askNow();
  await page.mouse.move(FROM[0] + 100, FROM[1], { steps: 5 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(200);
  await expect(menu(page)).toBeHidden();
});
