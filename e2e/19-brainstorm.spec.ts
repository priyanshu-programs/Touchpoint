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
const ELEMENTS = /\/api\/brainstorm\/[0-9a-f-]{36}\/elements$/;
const BOARD = /\/brainstorm\/([0-9a-f-]{36})$/;

const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      ELEMENTS.test(new URL(response.url()).pathname),
  );

type Element = {
  id: string;
  type: string;
  backgroundColor?: string;
  text?: string;
  containerId?: string | null;
  customData?: unknown;
  roundness?: unknown;
  fileId?: string;
  index?: string | null;
  x?: number;
  isDeleted?: boolean;
};

// The board as stored, every page of it, in the order it is drawn in.
async function stored(page: Page, id: string) {
  const elements: Element[] = [];
  let clock = 0;
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ since: "0", ...(after ? { after } : {}) });
    const answer = (await (
      await page.request.get(`/api/brainstorm/${id}/elements?${query}`)
    ).json()) as { clock: number; elements: Element[]; next: string | null };
    if (!after) clock = answer.clock;
    elements.push(...answer.elements);
    after = answer.next;
  } while (after);
  const at = ({ index }: Element) => index ?? "\uffff";
  elements.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
  return { clock, elements };
}

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
  await page.getByRole("menuitem", { name: "Light pink" }).click();
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
  // Each is kept as a note, with square corners, and drawn with a shadow.
  for (const note of notes) {
    expect(note.customData).toEqual({ sticky: true });
    expect(note.roundness).toBeNull();
  }
  await expect(page.locator(".sticky-shadow")).toHaveCount(2);
  await expect(page.locator(".sticky-shine")).toHaveCount(2);

  // Still there after a reload, and still notes.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  expect((await stored(page, boardId)).elements).toHaveLength(elements.length);
  await expect(page.locator(".sticky-shadow")).toHaveCount(2);

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("the colour grid colours what is selected and the next thing drawn", async ({
  page,
}) => {
  const seen = watch(page);
  await page.goto(`/brainstorm/${boardId}`);
  await expect(whiteboard(page)).toBeVisible();
  const before = (await stored(page, boardId)).elements.length;

  const box = async (from: [number, number], to: [number, number]) => {
    await page.keyboard.press("r");
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    await page.mouse.up();
  };
  await box([1000, 520], [1150, 650]);
  const colours = page.getByRole("group", { name: "Colours" });
  await colours.getByRole("button", { name: "Fill" }).click();
  await colours.getByRole("button", { name: "Red", exact: true }).click();
  await colours.getByRole("group", { name: "See-through" }).getByRole("button", { name: "50%" }).click();
  await expect(colours.getByRole("button", { name: "Red", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  // The next box takes the same fill.
  await box([1000, 150], [1150, 250]);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      (await stored(page, boardId)).elements
        .slice(before)
        .map(({ backgroundColor }) => backgroundColor),
    )
    .toEqual(["#fa525280", "#fa525280"]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The sticky note's menu offers the grid's light and bright colours.
  await page.getByRole("button", { name: "Sticky note colour" }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(20);
  await page.keyboard.press("Escape");

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("pen strokes are stored to a hundredth, and a board too big to store says it is full", async ({
  page,
}) => {
  await page.goto(`/brainstorm/${boardId}`);
  await expect(whiteboard(page)).toBeVisible();
  const before = (await stored(page, boardId)).elements.length;

  // Off 100%, where a stroke's points fall between whole pixels.
  await page.keyboard.press("Control+Equal");
  const stroke = async (from: [number, number], to: [number, number]) => {
    await page.keyboard.press("7");
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
  };
  await stroke([700, 300], [833, 377]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const drawn = (await stored(page, boardId)).elements.slice(before) as (Element & {
    points: [number, number][];
  })[];
  expect(drawn.map(({ type }) => type)).toEqual(["freedraw"]);
  const coordinates = drawn[0].points.flat();
  expect(coordinates.some((n) => !Number.isInteger(n))).toBe(true);
  expect(coordinates.every((n) => Math.round(n * 100) / 100 === n)).toBe(true);

  let refused = 0;
  await page.route(ELEMENTS, (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    refused += 1;
    return route.fulfill({ status: 413 });
  });
  await stroke([700, 420], [833, 470]);
  await expect(
    page.getByText("Board is full. Remove some drawings to keep saving."),
  ).toBeVisible();
  // Sending the same drawing again cannot fit it, so it is not tried again.
  await page.waitForTimeout(11_000);
  expect(refused).toBe(1);

  // Rubbing the stroke out is the next change, and that one is stored.
  await page.unroute(ELEMENTS);
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect((await stored(page, boardId)).elements).toHaveLength(before + 1);
});

test("a drawing is saved only by the owner, from this app, merged element by element, with no stage marks", async ({
  page,
  browser,
}) => {
  await page.goto(`/brainstorm/${boardId}`);
  const origin = new URL(page.url()).origin;
  const { clock } = await stored(page, boardId);
  const address = `/api/brainstorm/${boardId}/elements`;
  const element = (id: string, more: Record<string, unknown> = {}) => ({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    ...more,
  });
  const marked = {
    since: clock,
    elements: [
      element("staged", { customData: { stage: { status: "done" } } }),
      element("noted", { customData: { sticky: true, stage: { status: "done" } } }),
    ],
  };
  const patch = (data: unknown, headers: Record<string, string> = { origin }) =>
    page.request.patch(address, { headers, data });

  expect((await patch(marked, { origin: "https://elsewhere.example" })).status()).toBe(403);
  const signedOut = await browser.newContext({ storageState: undefined });
  expect(
    (await signedOut.request.patch(`${origin}${address}`, { headers: { origin }, data: marked })).status(),
  ).toBe(401);
  await signedOut.close();

  const first = await patch(marked);
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({ clock: clock + 1, behind: false });
  let after = await stored(page, boardId);
  const find = (id: string) => after.elements.find((kept) => kept.id === id);
  expect(find("staged")).not.toHaveProperty("customData");
  expect(find("noted")?.customData).toEqual({ sticky: true });

  // A newer copy of an element is kept; an older one sent after it is not.
  await patch({ since: clock + 1, elements: [element("staged", { version: 2, x: 50 })] });
  expect((await patch({ since: clock + 2, elements: [element("staged", { x: 99 })] })).status()).toBe(200);
  after = await stored(page, boardId);
  expect(find("staged")?.x).toBe(50);

  // Taken off the board again.
  await patch({
    since: clock + 2,
    elements: [
      element("staged", { version: 3, isDeleted: true }),
      element("noted", { version: 2, isDeleted: true }),
    ],
  });
  after = await stored(page, boardId);
  expect(find("staged")).toBeUndefined();
  expect(find("noted")).toBeUndefined();
});

test("a board far past what one save could carry is stored and opens again", async ({ page }) => {
  await page.goto(`/brainstorm/${boardId}`);
  await expect(whiteboard(page)).toBeVisible();
  const origin = new URL(page.url()).origin;
  const address = `/api/brainstorm/${boardId}/elements`;
  // About 45 KB a stroke: 70 of them are more than the 3 MB a whole board
  // could once take, sent in two saves as a device would.
  const stroke = (n: number, version: number, isDeleted = false) => ({
    id: `ink-${n}`,
    type: "freedraw",
    x: 3000 + (n % 10) * 60,
    y: 3000 + Math.floor(n / 10) * 60,
    width: 50,
    height: 50,
    version,
    versionNonce: 1,
    isDeleted,
    points: Array.from({ length: 1500 }, (_, i) => [i / 30, Math.sin(i / 10) * 25]),
    pressures: [],
    simulatePressure: true,
  });
  const send = async (version: number, isDeleted = false) => {
    let bytes = 0;
    for (const half of [0, 35]) {
      const elements = Array.from({ length: 35 }, (_, n) => stroke(half + n, version, isDeleted));
      bytes += JSON.stringify(elements).length;
      const answer = await page.request.patch(address, {
        headers: { origin },
        data: { since: 0, elements },
      });
      expect(answer.status()).toBe(200);
    }
    return bytes;
  };
  expect(await send(1)).toBeGreaterThan(3_000_000);

  const opening: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && /\/elements\?since=0/.test(request.url())) {
      opening.push(request.url());
    }
  });
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByText("The board could not be opened.")).toHaveCount(0);
  // Opened a page at a time, each well under what one answer may carry.
  expect(opening.length).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const ink = (await stored(page, boardId)).elements.filter(({ id }) => id.startsWith("ink-"));
  expect(ink).toHaveLength(70);

  await send(1_000, true);
});

test("two windows on one board draw together: each sees the other's notes, and what is rubbed out", async ({
  browser,
}) => {
  const open = async () => {
    const context = await browser.newContext({ storageState: OWNER_SESSION });
    const page = await context.newPage();
    await page.goto(`/brainstorm/${boardId}`);
    await expect(whiteboard(page)).toBeVisible();
    return page;
  };
  const laptop = await open();
  const phone = await open();
  const notes = (page: Page) => page.locator(".sticky-shadow");
  const before = await notes(laptop).count();
  await expect(notes(phone)).toHaveCount(before);
  const note = async (page: Page, text: string) => {
    await page.getByRole("button", { name: "Sticky note", exact: true }).click();
    await page.keyboard.type(text);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  };

  await note(laptop, "From the laptop");
  await expect(notes(phone)).toHaveCount(before + 1, { timeout: 20_000 });
  await note(phone, "From the phone");
  await expect(notes(laptop)).toHaveCount(before + 2, { timeout: 20_000 });

  // Everything rubbed out on one is gone from the other too.
  await laptop.keyboard.press("Escape");
  await laptop.keyboard.press("Control+a");
  await laptop.keyboard.press("Delete");
  await expect(notes(laptop)).toHaveCount(0);
  await expect(laptop.getByText("Saved", { exact: true })).toBeVisible();
  await expect(notes(phone)).toHaveCount(0, { timeout: 20_000 });
  await expect(phone.getByText("Changed somewhere else")).toHaveCount(0);
  expect((await stored(laptop, boardId)).elements).toEqual([]);

  await laptop.context().close();
  await phone.context().close();
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
  expect((await page.request.get(`/api/brainstorm/${boardId}/elements?since=0`)).status()).toBe(404);
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

const boardNames = (page: Page) => main(page).locator("tbody tr td:nth-child(3)").allInnerTexts();
const handle = (page: Page, name: string) =>
  main(page).getByRole("button", { name: `Move ${name}`, exact: true });

async function newBoard(page: Page, name: string) {
  await page.goto("/brainstorm");
  await main(page).getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(BOARD);
}

// Waits for the page's own refresh after a move has been saved.
const movedAndSaved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/brainstorm",
  );

async function drag(page: Page, from: string, onto: string) {
  const start = (await handle(page, from).boundingBox())!;
  const end = (await handle(page, onto).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2 + 4, { steps: 12 });
  await page.mouse.up();
}

test("boards are dragged into order, moved by keys, and the order holds", async ({ page }) => {
  for (const name of ["Order one", "Order two", "Order three"]) await newBoard(page, name);
  await page.goto("/brainstorm");
  const first = await boardNames(page);
  expect(first.slice(0, 3)).toEqual(["Order three", "Order two", "Order one"]);
  const lastEdited = () =>
    main(page).locator("tbody tr", { hasText: "Order three" }).locator("td").last().innerText();
  const edited = await lastEdited();

  const dragged = movedAndSaved(page);
  await drag(page, "Order three", "Order one");
  await dragged;
  // The drag did not open the board.
  await expect(page).toHaveURL(/\/brainstorm$/);
  await expect.poll(() => boardNames(page).then((names) => names.slice(0, 3))).toEqual([
    "Order two",
    "Order one",
    "Order three",
  ]);

  await page.reload();
  expect((await boardNames(page)).slice(0, 3)).toEqual(["Order two", "Order one", "Order three"]);
  expect(await lastEdited()).toBe(edited);

  const keyed = movedAndSaved(page);
  await handle(page, "Order one").focus();
  await page.keyboard.press("ArrowUp");
  await keyed;
  await expect(page.getByRole("status").filter({ hasText: "Order one moved to place 1" })).toBeAttached();
  await page.reload();
  expect((await boardNames(page)).slice(0, 3)).toEqual(["Order one", "Order two", "Order three"]);
  await expect(handle(page, "Order one")).toBeVisible();

  // Drawing on a board no longer moves it; a new one goes first.
  await newBoard(page, "Order four");
  await page.goto("/brainstorm");
  expect((await boardNames(page)).slice(0, 4)).toEqual([
    "Order four",
    "Order one",
    "Order two",
    "Order three",
  ]);

  // The row still opens its board.
  await main(page).locator("tbody tr", { hasText: "Order two" }).locator("td").last().click();
  await expect(page).toHaveURL(BOARD);

});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("boards are put in order on a phone too, and the list fits", async ({ page }) => {
    await page.goto("/brainstorm");
    await expect(main(page).locator("tbody tr").first()).toBeVisible();
    const before = await boardNames(page);
    const [top, second] = before;
    const dragged = movedAndSaved(page);
    await drag(page, top, second);
    await dragged;
    await expect.poll(() => boardNames(page).then((names) => names.slice(0, 2))).toEqual([second, top]);
    await page.reload();
    expect((await boardNames(page)).slice(0, 2)).toEqual([second, top]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

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
