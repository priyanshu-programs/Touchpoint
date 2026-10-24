import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const main = (page: Page) => page.getByRole("main");
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const searchBox = (page: Page) => page.getByPlaceholder("Search or jump to…");
const SCENE = /\/api\/brainstorm\/[0-9a-f-]{36}\/scene$/;
const BOARD = /\/brainstorm\/([0-9a-f-]{36})$/;

const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      SCENE.test(new URL(response.url()).pathname),
  );

type Element = {
  id: string;
  type: string;
  backgroundColor?: string;
  text?: string;
  containerId?: string | null;
  customData?: unknown;
  fileId?: string;
};

const stored = async (page: Page, id: string) =>
  (await (await page.request.get(`/api/brainstorm/${id}/scene`)).json()) as {
    version: number;
    elements: Element[];
  };

function watch(page: Page) {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "localhost") {
      outside.push(request.url());
    }
  });
  return { errors, outside };
}

let boardId = "";

test("a brainstorm board is made from the sidebar and opens as a whiteboard", async ({
  page,
}) => {
  const seen = watch(page);
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Brainstorming" })
    .click();
  await expect(page).toHaveURL(/\/brainstorm$/);
  await expect(main(page).getByText(/^No boards yet\./)).toBeVisible();

  await main(page).getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill("Product ideas");
  await dialog.getByRole("button", { name: "Create board" }).click();

  await expect(page).toHaveURL(BOARD);
  boardId = BOARD.exec(page.url())![1];
  await expect(heading(page, "Product ideas")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  // None of a workflow's own controls are here.
  await expect(page.getByRole("region", { name: "Selected box" })).toHaveCount(0);

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("sticky notes are added in a click, written on and saved", async ({ page }) => {
  const seen = watch(page);
  await page.goto(`/brainstorm/${boardId}`);
  await expect(whiteboard(page)).toBeVisible();

  // The note opens for typing as it is added.
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page.keyboard.type("Ship the beta");
  await page.keyboard.press("Escape");
  const first = saved(page);
  expect((await first).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Another colour from the menu beside it.
  await page.getByRole("button", { name: "Sticky note colour" }).click();
  await page.getByRole("menuitem", { name: "Pink" }).click();
  await page.keyboard.type("Ask users");
  await page.keyboard.press("Escape");
  await saved(page);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const { elements } = await stored(page, boardId);
  const notes = elements.filter(({ type }) => type === "rectangle");
  expect(notes.map(({ backgroundColor }) => backgroundColor)).toEqual([
    "#fff3a3",
    "#ffc9de",
  ]);
  const written = elements.filter(({ type }) => type === "text");
  expect(written.map(({ text }) => text).sort()).toEqual(["Ask users", "Ship the beta"]);
  expect(written.every(({ containerId }) => notes.some(({ id }) => id === containerId))).toBe(
    true,
  );

  // Still there after a reload.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  expect((await stored(page, boardId)).elements).toHaveLength(elements.length);

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("a drawing is saved only by the owner, from this app, from its latest version, with no stage marks", async ({
  page,
  browser,
}) => {
  await page.goto(`/brainstorm/${boardId}`);
  const origin = new URL(page.url()).origin;
  const { version, elements } = await stored(page, boardId);
  const address = `/api/brainstorm/${boardId}/scene`;
  const marked = {
    version,
    elements: [
      ...elements,
      {
        id: "staged",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        customData: { stage: { status: "done" } },
      },
    ],
  };

  expect(
    (await page.request.put(address, { headers: { origin: "https://elsewhere.example" }, data: marked }))
      .status(),
  ).toBe(403);
  const signedOut = await browser.newContext({ storageState: undefined });
  expect((await signedOut.request.put(`${origin}${address}`, { headers: { origin }, data: marked })).status()).toBe(401);
  await signedOut.close();

  expect((await page.request.put(address, { headers: { origin }, data: marked })).status()).toBe(200);
  const after = await stored(page, boardId);
  expect(after.version).toBe(version + 1);
  expect(after.elements.find(({ id }) => id === "staged")).not.toHaveProperty("customData");
  // A save from the version before is refused.
  expect((await page.request.put(address, { headers: { origin }, data: marked })).status()).toBe(409);
  // Put back as it was, from the version now stored.
  expect(
    (await page.request.put(address, { headers: { origin }, data: { version: after.version, elements } }))
      .status(),
  ).toBe(200);
});

test("a board is renamed, found from Ctrl+K and deleted", async ({ page }) => {
  await page.goto(`/brainstorm/${boardId}`);
  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename board" });
  await rename.getByLabel("Name").fill("Launch ideas");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(heading(page, "Launch ideas")).toBeVisible();

  // A second board may not take the same name in another case.
  await page.goto("/brainstorm");
  await expect(main(page).getByRole("link", { name: "Launch ideas" })).toBeVisible();
  await main(page).getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill("launch IDEAS");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "You already have a board called launch IDEAS.",
  );
  await page.keyboard.press("Escape");

  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await searchBox(page).fill("launch");
  const hit = page
    .locator("[cmdk-group]")
    .filter({ has: page.locator("[cmdk-group-heading]", { hasText: "Brainstorm boards" }) })
    .getByRole("option", { name: /^Launch ideas/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`/brainstorm/${boardId}$`));

  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL(/\/brainstorm$/);
  await expect(main(page).getByText(/^No boards yet\./)).toBeVisible();
  expect((await page.request.get(`/api/brainstorm/${boardId}/scene`)).status()).toBe(404);
});

test("pictures are kept on a brainstorm board: stored, fetched again and refused when not a picture", async ({
  page,
  baseURL,
  browser,
}) => {
  test.setTimeout(90_000);
  const seen = watch(page);
  const PICTURES = /\/api\/brainstorm\/[0-9a-f-]{36}\/pictures$/;
  const sent = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        PICTURES.test(new URL(response.url()).pathname),
    );
  type Sent = { name: string; mimeType: string; buffer: Buffer };
  // A file let go of over the whiteboard, as one dragged from a folder is.
  const drop = async ({ name, mimeType, buffer }: Sent, x: number, y: number) => {
    const transfer = await page.evaluateHandle(
      ({ name, mimeType, bytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
        return transfer;
      },
      { name, mimeType, bytes: [...buffer] },
    );
    await page.dispatchEvent(".excalidraw", "drop", {
      dataTransfer: transfer,
      clientX: x,
      clientY: y,
    });
  };
  const photo: Sent = {
    name: "Moodboard.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#3366cc" },
    })
      .png()
      .toBuffer(),
  };
  const vector: Sent = {
    name: "Logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#cc3333"/></svg>',
    ),
  };

  await page.goto("/brainstorm/new");
  await page.getByLabel("Name").fill("Moodboard");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(BOARD);
  const id = BOARD.exec(page.url())![1];
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.locator('[data-testid="toolbar-image"]')).toBeAttached();

  // A picture dropped on the board is sent, and only then the drawing.
  const [upload, save] = await Promise.all([sent(), saved(page), drop(photo, 640, 380)]);
  expect(upload.status()).toBe(204);
  expect(save.ok()).toBe(true);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const pictures = async () =>
    (await stored(page, id)).elements
      .filter(({ type }) => type === "image")
      .map(({ fileId }) => fileId!);
  const [key] = await pictures();
  expect(key).toMatch(/^[0-9a-f]{40}$/);
  const address = `/api/brainstorm/${id}/pictures/${key}`;
  const fetched = await page.request.get(address);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"]).toBe("image/webp");
  expect(fetched.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  expect(await sharp(await fetched.body()).metadata()).toMatchObject({
    format: "webp",
    width: 400,
    height: 300,
  });
  const stranger = await browser.newContext({ storageState: undefined });
  expect((await stranger.request.get(`${baseURL}${address}`)).status()).toBe(401);
  await stranger.close();
  expect(
    (await page.request.get(`/api/brainstorm/${id}/pictures/${"0".repeat(40)}`)).status(),
  ).toBe(404);
  // Not from another site.
  expect(
    (
      await page.request.post(`/api/brainstorm/${id}/pictures`, {
        multipart: { key: "abc", file: photo },
        headers: { origin: "https://elsewhere.example" },
      })
    ).status(),
  ).toBe(403);

  // After a reload the picture is fetched again and still on the board.
  const again = page.waitForResponse(
    (response) => new URL(response.url()).pathname === address && response.ok(),
  );
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await again;
  expect(await pictures()).toEqual([key]);

  // A drawing that could carry script is taken off the board, and says why.
  const refusal = sent();
  await drop(vector, 300, 300);
  expect((await refusal).status()).toBe(415);
  await expect(page.getByText(/^Only PNG, JPEG, GIF and WebP pictures are kept\./)).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await pictures()).toEqual([key]);

  expect(seen.outside).toEqual([]);
  // The refused upload is logged by the browser as a failed request.
  expect(seen.errors.filter((error) => !error.includes("415"))).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Brainstorming is reached through Go to, and the board fits the screen", async ({
    page,
  }) => {
    await page.goto("/brainstorm/new");
    await page.getByLabel("Name").fill("Pocket notes");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page).toHaveURL(BOARD);
    await expect(whiteboard(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sticky note", exact: true })).toBeVisible();
    // The tools, the picture tool among them, are all on the screen.
    for (const tool of ["selection", "image", "eraser"]) {
      await expect(page.locator(`[data-testid="toolbar-${tool}"]`)).toBeInViewport({
        ratio: 1,
      });
    }
    const fits = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await fits()).toBe(true);

    await page.goto("/");
    const bottomBar = page.getByRole("navigation", { name: "Main" }).last();
    await expect(bottomBar.getByRole("link", { name: "Brainstorming" })).toHaveCount(0);
    await bottomBar.getByRole("button", { name: "Go to" }).click();
    await page.getByRole("option", { name: "Brainstorming" }).click();
    await expect(page).toHaveURL(/\/brainstorm$/);
    await expect(main(page).getByRole("link", { name: "Pocket notes" })).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
