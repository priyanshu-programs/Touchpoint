import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.use({
  storageState: OWNER_SESSION,
  // About a tablet's screen, with a tablet's sharp pixels.
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
});

const STROKES = 4_200;
const IN_A_ROW = 60;
const SLOWER = 6;
const BOARD = /\/brainstorm\/([0-9a-f-]{36})$/;

// Made-up handwriting: short pen strokes, in rows like lines of a page.
const stroke = (n: number) => ({
  id: `speed-${n}`,
  type: "freedraw",
  x: (n % IN_A_ROW) * 70,
  y: Math.floor(n / IN_A_ROW) * 90,
  width: 60,
  height: 40,
  version: 1,
  versionNonce: n + 1,
  isDeleted: false,
  points: Array.from({ length: 21 }, (_, i) => [i * 3, Math.round(Math.sin((i + n) / 3) * 2000) / 100]),
  pressures: [],
  simulatePressure: true,
});

async function seed(page: Page, id: string) {
  const origin = new URL(page.url()).origin;
  for (let start = 0; start < STROKES; start += 1_500) {
    const elements = Array.from({ length: Math.min(1_500, STROKES - start) }, (_, n) =>
      stroke(start + n),
    );
    const answer = await page.request.patch(`/api/brainstorm/${id}/elements`, {
      headers: { origin },
      data: { since: 0, elements },
    });
    expect(answer.status()).toBe(200);
  }
}

// Every gap between two frames over 50 ms, read from the page itself, so the
// same measure works with or without anything the app shows.
const recordFrames = () => {
  const record = { frames: 0, gaps: [] as [number, number][], canvases: 0 };
  (window as unknown as { boardFrames: typeof record }).boardFrames = record;
  // Times depend on how busy this machine is; how many canvases are made does not.
  const make = document.createElement.bind(document);
  document.createElement = ((name: string, options?: ElementCreationOptions) => {
    if (name.toLowerCase() === "canvas") record.canvases += 1;
    return make(name, options);
  }) as typeof document.createElement;
  let last = performance.now();
  const tick = (now: number) => {
    record.frames += 1;
    if (now - last > 50) record.gaps.push([last, now]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

type Frames = { now: number; frames: number; gaps: [number, number][]; canvases: number };

// A fixed sum, timed: how fast this machine is running at the moment, so numbers
// from a slow spell are not read as a change in the board.
const machineSpeed = (page: Page) =>
  page.evaluate(() => {
    const start = performance.now();
    let sum = 0;
    for (let i = 0; i < 20_000_000; i += 1) sum += i % 7;
    return sum > 0 ? Math.round(performance.now() - start) : 0;
  });

const framesNow = (page: Page) =>
  page.evaluate(
    (): Frames => ({
      now: performance.now(),
      ...(window as unknown as { boardFrames: Omit<Frames, "now"> }).boardFrames,
    }),
  );

// Waits for two quiet seconds with no frame gap over 200 ms.
async function settled(page: Page) {
  await expect
    .poll(
      async () => {
        const { now, gaps } = await framesNow(page);
        const lastLong = gaps.filter(([from, to]) => to - from > 200).at(-1)?.[1] ?? 0;
        return now - lastLong > 2_000;
      },
      { timeout: 180_000, intervals: [500] },
    )
    .toBe(true);
}

const longestSince = ({ gaps }: Frames, from: number) =>
  Math.round(Math.max(0, ...gaps.filter(([, to]) => to > from).map(([a, b]) => b - a)));

async function open(page: Page, id: string) {
  await page.goto(`/brainstorm/${id}`);
  await expect(page.locator(".excalidraw canvas.interactive")).toBeVisible({ timeout: 120_000 });
  await settled(page);
  const { gaps } = await framesNow(page);
  return Math.round(gaps.filter(([from, to]) => to - from > 200).at(-1)?.[1] ?? 0);
}

async function zoom(page: Page, delta: number, steps = 12) {
  const before = await framesNow(page);
  await page.mouse.move(590, 410);
  await page.keyboard.down("Control");
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("Control");
  const lifted = await framesNow(page);
  await settled(page);
  const after = await framesNow(page);
  return {
    during: longestSince(lifted, before.now),
    afterLifting: longestSince(after, lifted.now),
    canvases: after.canvases - before.canvases,
  };
}

const zoomLevel = (page: Page) =>
  page.locator(".excalidraw .reset-zoom-button").innerText();

async function pan(page: Page) {
  const before = await framesNow(page);
  await page.mouse.move(590, 410);
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.wheel(i % 20 < 10 ? 60 : -60, 30);
    await page.waitForTimeout(25);
  }
  const after = await framesNow(page);
  return {
    framesASecond: Math.round(((after.frames - before.frames) * 1000) / (after.now - before.now)),
    longest: longestSince(after, before.now),
  };
}

test("a board of 4,200 pen strokes opens, moves, zooms and still saves on a slow device", async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  await page.addInitScript(recordFrames);

  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(`Speed test ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(BOARD);
  const id = BOARD.exec(page.url())![1];
  await seed(page, id);

  const cpu = await context.newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: SLOWER });

  const firstOpen = await open(page, id);
  const openCanvases = (await framesNow(page)).canvases;
  const machine = [await machineSpeed(page)];
  // The board was first seen empty, which must not decide where it opens now.
  const levels = [await zoomLevel(page)];
  expect(Number.parseInt(levels[0])).toBeLessThan(20);
  const zoomedIn = await zoom(page, -40);
  levels.push(await zoomLevel(page));
  const panned = await pan(page);
  const zoomedOut = await zoom(page, 40);
  levels.push(await zoomLevel(page));
  // To a zoom no stroke has an image for, with most of the board on screen:
  // what a pinch near the overview does. Going back to a zoom seen before can
  // reuse what was made then, so it shows much less.
  const newLevel = await zoom(page, -40, 2);
  levels.push(await zoomLevel(page));

  // A new stroke goes on and is saved after all that.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().endsWith("/elements"),
    { timeout: 120_000 },
  );
  await page.keyboard.press("p");
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(600, 460, { steps: 6 });
  await page.mouse.up();
  expect((await saved).status()).toBe(200);
  await settled(page);

  machine.push(await machineSpeed(page));
  const secondOpen = await open(page, id);

  // Left zoomed in, it reopens there, with only what was on screen to draw.
  await zoom(page, -40);
  const left = await zoomLevel(page);
  await page.waitForTimeout(1_000);
  const reopenZoomedIn = await open(page, id);
  expect(await zoomLevel(page)).toBe(left);

  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const elements: { id: string; isDeleted: boolean }[] = [];
  let after: string | null = null;
  do {
    const query: string = after ? `&after=${after}` : "";
    const answer = await page.request.get(`/api/brainstorm/${id}/elements?since=0${query}`);
    const part = (await answer.json()) as { elements: typeof elements; next: string | null };
    elements.push(...part.elements);
    after = part.next;
  } while (after);
  expect(elements.filter(({ isDeleted }) => !isDeleted)).toHaveLength(STROKES + 1);

  const numbers = {
    machine,
    firstOpen,
    openCanvases,
    secondOpen,
    reopenZoomedIn,
    levels,
    zoomedIn,
    panned,
    zoomedOut,
    newLevel,
  };
  test.info().annotations.push({ type: "speed", description: JSON.stringify(numbers) });
  console.log(`board speed at ${SLOWER}x slower, ms: ${JSON.stringify(numbers)}`);

  // The readout, asked for by its address and absent without it.
  await expect(page.getByRole("complementary", { name: "Board speed" })).toHaveCount(0);
  await page.goto(`/brainstorm/${id}?perf=1`);
  const readout = page.getByRole("complementary", { name: "Board speed" });
  await expect(readout.getByText("Strokes")).toBeVisible({ timeout: 60_000 });
  await expect(readout.locator("dd").nth(3)).toHaveText(String(STROKES + 1), { timeout: 60_000 });

});
