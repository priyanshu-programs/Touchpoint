import { request as httpRequest } from "node:http";
import { createHmac } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LIVE_ROOM_SECRET } from "../playwright.config";
import { OWNER_SESSION } from "./support";

const ROOM = { host: "127.0.0.1", port: 3102 };
const ELEMENTS = /\/api\/brainstorm\/[^/]+\/elements/;

const whiteboard = (page: Page) => page.locator(".excalidraw canvas").first();
const notes = (page: Page) => page.locator(".sticky-shadow");
let boardId = "";

async function device(browser: Browser, id = boardId) {
  const context = await browser.newContext({ storageState: OWNER_SESSION });
  const page = await context.newPage();
  await page.goto(`/brainstorm/${id}?perf=1`);
  await expect(whiteboard(page)).toBeVisible();
  return page;
}

const connected = (page: Page) =>
  expect(page.getByRole("complementary", { name: "Board speed" })).toContainText(/Live\s*open/, {
    timeout: 15_000,
  });

async function note(page: Page, text: string) {
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

// With a device's asking turned off, only the room can have brought what it shows.
const stopAsking = (page: Page) =>
  page.route(ELEMENTS, (route) =>
    route.request().method() === "GET" ? route.abort() : route.continue(),
  );

const stored = async (page: Page) =>
  (
    (await (await page.request.get(`/api/brainstorm/${boardId}/elements?since=0`)).json()) as {
      elements: { customData?: { sticky?: boolean }; isDeleted: boolean }[];
    }
  ).elements;

// What the room answers a connection, read directly: a browser hides the reason.
function handshake(board: string, protocols: string, origin = "http://localhost:3100") {
  return new Promise<number>((resolve, reject) => {
    const asked = httpRequest({
      ...ROOM,
      path: `/board/${board}`,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Protocol": protocols,
        Origin: origin,
      },
    });
    asked.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    asked.on("response", (response) => {
      response.destroy();
      resolve(response.statusCode ?? 0);
    });
    asked.on("error", reject);
    asked.end();
  });
}

function ticketFor(board: string, until = Date.now() + 60_000, secret = LIVE_ROOM_SECRET) {
  const payload = Buffer.from(JSON.stringify({ b: board, e: until })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: OWNER_SESSION });
  const page = await context.newPage();
  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(`Live board ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await page.waitForURL(/\/brainstorm\/[0-9a-f-]{36}/);
  boardId = new URL(page.url()).pathname.split("/").pop()!;
  await context.close();
});

test("a change reaches the other device in under a second, with no asking the server", async ({
  browser,
}) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await connected(laptop);
  await connected(tablet);
  await stopAsking(tablet);
  const before = await notes(tablet).count();

  const started = Date.now();
  await note(laptop, "Through the room");
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 1_000 });
  console.log(`A note reached the other window in ${Date.now() - started} ms`);

  // Rubbed out, and back with an undo.
  await laptop.keyboard.press("Control+a");
  await laptop.keyboard.press("Delete");
  await expect(notes(tablet)).toHaveCount(0, { timeout: 1_000 });
  await laptop.keyboard.press("Control+z");
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 1_000 });

  await laptop.context().close();
  await tablet.context().close();
});

test("the room is given only what it cannot read", async ({ browser }) => {
  const laptop = await browser.newContext({ storageState: OWNER_SESSION });
  const page = await laptop.newPage();
  const sent: (string | Buffer)[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => sent.push(payload));
  });
  await page.goto(`/brainstorm/${boardId}?perf=1`);
  await connected(page);
  await note(page, "Secret plans for Maple Studio");
  await expect.poll(() => sent.filter((frame) => frame !== "ping").length).toBeGreaterThan(0);
  for (const frame of sent) {
    if (frame === "ping") continue;
    expect(typeof frame).not.toBe("string");
    expect(frame.toString()).not.toContain("Maple");
    expect(frame.toString()).not.toContain("elements");
  }
  await laptop.close();
});

test("what a device sent is saved by the other if it goes before saving it", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const laptop = await device(browser);
  const tablet = await device(browser);
  await connected(laptop);
  await connected(tablet);
  await laptop.route(ELEMENTS, (route) =>
    route.request().method() === "PATCH" ? route.abort() : route.continue(),
  );
  const before = await notes(tablet).count();
  const storedBefore = (await stored(tablet)).filter(({ isDeleted }) => !isDeleted).length;

  await note(laptop, "Laptop dies now");
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 1_000 });
  await laptop.context().close();

  await expect
    .poll(async () => (await stored(tablet)).filter(({ isDeleted }) => !isDeleted).length, {
      timeout: 30_000,
      intervals: [1_000],
    })
    .toBeGreaterThan(storedBefore);
  await tablet.context().close();
});

test("with the room out of reach, a board still keeps in step by asking", async ({ browser }) => {
  const open = async () => {
    const context = await browser.newContext({ storageState: OWNER_SESSION });
    const page = await context.newPage();
    await page.routeWebSocket(/:3102\//, (socket) => socket.close());
    await page.goto(`/brainstorm/${boardId}`);
    await expect(whiteboard(page)).toBeVisible();
    return page;
  };
  const laptop = await open();
  const tablet = await open();
  const before = await notes(tablet).count();
  await note(laptop, "Without the room");
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 20_000 });
  await laptop.context().close();
  await tablet.context().close();
});

test("a board opened from the list reaches the room, and other pages may not", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: OWNER_SESSION });
  const page = await context.newPage();
  const list = await page.goto("/brainstorm");
  expect(list!.headers()["content-security-policy"]).toContain("connect-src 'self';");
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));

  await page.getByRole("main").locator("tbody tr").first().locator("td").last().click();
  await page.waitForURL(/\/brainstorm\/[0-9a-f-]{36}/);
  await expect(whiteboard(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const [entry] = performance.getEntriesByType("navigation");
        return new URL(entry.name).pathname;
      }),
    )
    .toMatch(/^\/brainstorm\/[0-9a-f-]{36}$/);
  await expect.poll(() => sockets.some((url) => url.includes("/board/"))).toBe(true);
  await context.close();
});

test("the room turns away what has no good ticket", async () => {
  const other = "99999999-9999-4999-8999-999999999999";
  const offered = (ticket: string) => `touchpoint.live, ${ticket}`;

  expect(await handshake(boardId, offered(ticketFor(boardId)))).toBe(101);
  expect(await handshake(boardId, "touchpoint.live")).toBe(401);
  expect(await handshake(boardId, offered(ticketFor(other)))).toBe(401);
  expect(await handshake(boardId, offered(ticketFor(boardId, Date.now() - 1)))).toBe(401);
  expect(await handshake(boardId, offered(ticketFor(boardId, undefined, "x".repeat(40))))).toBe(401);
  expect(await handshake(boardId, offered(ticketFor(boardId)), "https://elsewhere.example")).toBe(403);
  expect(await handshake("not-a-board", offered(ticketFor(boardId)))).toBe(404);
});

type Pass = { url: string; ticket: string; key: string };

const passFor = async (page: Page) =>
  (await (
    await page.request.post(`/api/brainstorm/${boardId}/live`, {
      headers: { origin: new URL(page.url()).origin },
    })
  ).json()) as Pass;

const sticky = (id: string) => ({
    id,
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffec99",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 5,
    versionNonce: 5,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    customData: { sticky: true },
});

// Joins the room as another of the owner's devices and sends these elements.
const sendAsAnotherDevice = (page: Page, pass: Pass, elements: unknown[]) =>
    page.evaluate(
      async ({ pass, elements }) => {
        const raw = Uint8Array.from(
          atob(pass.key.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        );
        const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(JSON.stringify({ t: "changes", elements })),
        );
        const out = new Uint8Array(12 + sealed.byteLength);
        out.set(iv);
        out.set(new Uint8Array(sealed), 12);
        const socket = new WebSocket(pass.url, ["touchpoint.live", pass.ticket]);
        await new Promise((resolve) => socket.addEventListener("open", resolve));
        socket.send(out);
        await new Promise((resolve) => setTimeout(resolve, 300));
        socket.close();
      },
      { pass, elements },
    );

test("a message that would not pass a save is not drawn", async ({ browser }) => {
  const tablet = await device(browser);
  await connected(tablet);
  await stopAsking(tablet);
  const before = await notes(tablet).count();
  const pass = await passFor(tablet);
  const send = (elements: unknown[]) => sendAsAnotherDevice(tablet, pass, elements);

  // One element of a kind a save refuses, and the whole message goes.
  await send([sticky("bad-note"), { ...sticky("bad-page"), type: "embeddable" }]);
  await tablet.waitForTimeout(1_000);
  await expect(notes(tablet)).toHaveCount(before);

  // The same message without it is drawn, so it was the check that stopped it.
  await send([sticky("good-note")]);
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 2_000 });
  await tablet.context().close();
});

test("something renumbered on arrival and rubbed out straight away is gone everywhere", async ({
  browser,
}) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await connected(laptop);
  await connected(tablet);
  await note(tablet, "Holds a place");
  await expect(tablet.getByText("Saved", { exact: true })).toBeVisible();
  await expect(notes(laptop)).toHaveCount(await notes(tablet).count(), { timeout: 2_000 });
  const pass = await passFor(tablet);

  const { elements } = (await (
    await tablet.request.get(`/api/brainstorm/${boardId}/elements?since=0`)
  ).json()) as { elements: { index: string | null; isDeleted: boolean }[] };
  const taken = elements.find(({ index, isDeleted }) => index && !isDeleted)!;
  const before = await notes(tablet).count();

  // Arrives on both windows, sorted after what is at that place, so both renumber it.
  await sendAsAnotherDevice(tablet, pass, [{ ...sticky("zzzzzz-soon-gone"), index: taken.index }]);
  await expect(notes(tablet)).toHaveCount(before + 1, { timeout: 2_000 });
  await expect(notes(laptop)).toHaveCount(before + 1, { timeout: 2_000 });

  // Before either has saved its copy.
  await tablet.keyboard.press("Escape");
  await tablet.keyboard.press("Control+a");
  await tablet.keyboard.press("Delete");
  await expect(notes(tablet)).toHaveCount(0);
  await expect(notes(laptop)).toHaveCount(0, { timeout: 2_000 });

  await laptop.context().close();
  await tablet.context().close();
});

// Otherwise the two devices hold different copies at one version, and a delete
// from the other device can lose to this one's copy by the toss of a nonce.
test("an element the whiteboard renumbers on arrival is sent on and saved", async ({ browser }) => {
  const tablet = await device(browser);
  await connected(tablet);
  await note(tablet, "Holds a place");
  await expect(tablet.getByText("Saved", { exact: true })).toBeVisible();
  const pass = await passFor(tablet);

  const rows = async () =>
    (
      (await (await tablet.request.get(`/api/brainstorm/${boardId}/elements?since=0`)).json()) as {
        elements: { id: string; version: number; index: string | null; isDeleted: boolean }[];
      }
    ).elements;
  const taken = (await rows()).find(({ index, isDeleted }) => index && !isDeleted)!;

  // Sorted after the element already at that place, so this one gets renumbered.
  const id = "zzzzzz-clash";
  await sendAsAnotherDevice(tablet, pass, [{ ...sticky(id), index: taken.index }]);

  await expect
    .poll(async () => (await rows()).find((row) => row.id === id)?.version ?? 0, {
      timeout: 10_000,
      intervals: [500],
    })
    .toBeGreaterThan(sticky(id).version);
  await tablet.context().close();
});
