import { expect, test, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const card = (page: Page) => page.getByRole("region", { name: "Selected box" });
const tray = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const chips = (page: Page, record: string) =>
  page.getByRole("button", { name: new RegExp(`^${record} (is|has) `) });
// The glow behind each stage, in the order the stages were drawn.
const halo = (page: Page, index: number) => page.locator(".stage-halo").nth(index);
const middle = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const SCENE = /\/api\/workflows\/[0-9a-f-]{36}\/scene$/;
// A drawing saves itself a little after the last change to it.
const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      SCENE.test(new URL(response.url()).pathname),
  );

// Brief leads to Design and to Copy, which both lead to Review: two branches.
// No starter's description holds the workflow's name.
const WORKFLOW = "Launch plan";
const BRIEF = 0;
const DESIGN = 1;
const COPY = 2;
const box = (id: string, name: string, x: number, y: number) => [
  {
    id,
    type: "rectangle",
    x,
    y,
    width: 160,
    height: 80,
    customData: { stage: { status: "not_started" } },
  },
  {
    id: `${id}-text`,
    type: "text",
    x: x + 10,
    y: y + 30,
    width: 140,
    height: 20,
    containerId: id,
    text: name,
    originalText: name,
  },
];
const arrow = (from: string, to: string) => ({
  id: `${from}-${to}`,
  type: "arrow",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  points: [
    [0, 0],
    [1, 1],
  ],
  startBinding: { elementId: from, focus: 0, gap: 1 },
  endBinding: { elementId: to, focus: 0, gap: 1 },
});
const DRAWING = [
  ...box("brief", "Brief", 0, 100),
  ...box("design", "Design", 240, 0),
  ...box("copy", "Copy", 240, 200),
  ...box("review", "Review", 480, 100),
  arrow("brief", "design"),
  arrow("brief", "copy"),
  arrow("design", "review"),
  arrow("copy", "review"),
];

type Stored = {
  elements: { id: string; customData?: { stage?: { status: string } } }[];
};
const sceneOf = (path: string) => `${path.replace("/workflows/", "/api/workflows/")}/scene`;
async function statuses(page: Page) {
  const path = new URL(page.url()).pathname;
  const stored = (await (await page.request.get(sceneOf(path))).json()) as Stored;
  return Object.fromEntries(
    stored.elements
      .filter((element) => element.customData?.stage)
      .map((element) => [element.id, element.customData!.stage!.status]),
  );
}

// Picked up and carried in steps, as a hand would, and let go at a point.
async function drag(page: Page, chip: Locator, to: { x: number; y: number }) {
  const from = middle((await chip.boundingBox())!);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
const onStage = async (page: Page, index: number) =>
  middle((await halo(page, index).boundingBox())!);

async function startOn(page: Page, tabs: Locator) {
  await tabs.getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: WORKFLOW }).click();
  await panel(page)
    .getByRole("list", { name: "Workflows started here" })
    .getByRole("link", { name: WORKFLOW })
    .click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(whiteboard(page)).toBeVisible();
}

let template = "";

test("the record's chip is moved over its own board", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // A workflow that branches, drawn through the whiteboard's own save.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill(WORKFLOW);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  template = new URL(page.url()).pathname;
  await page.goto("/workflows");
  const put = await page.request.put(sceneOf(template), {
    data: { version: 1, elements: DRAWING },
    headers: { origin: baseURL! },
  });
  expect(put.status()).toBe(200);

  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill("Chipworks");
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Chipworks" })).toBeVisible();
  await startOn(page, companyTabs(page));

  // Nothing begun: the chip waits in the Not started tray.
  await expect(tray(page, "Not started").getByRole("button")).toHaveAccessibleName(
    "Chipworks has not started",
  );
  await expect(tray(page, "Done").getByRole("button")).toHaveCount(0);

  // Dragged onto Design: Brief before it is done, the other branch untouched,
  // and the chip stands on Design's top edge.
  let save = saved(page);
  await drag(page, chips(page, "Chipworks"), await onStage(page, DESIGN));
  await save;
  expect(await statuses(page)).toEqual({
    brief: "done",
    design: "in_progress",
    copy: "not_started",
    review: "not_started",
  });
  const atDesign = page.getByRole("button", { name: "Chipworks is at Design" });
  await expect(atDesign).toBeVisible();
  const chip = (await atDesign.boundingBox())!;
  const design = await onStage(page, DESIGN);
  expect(Math.abs(middle(chip).x - design.x)).toBeLessThan(3);
  expect(chip.y + chip.height).toBeLessThan(design.y - 30);
  expect(chip.y + chip.height).toBeGreaterThan(design.y - 70);

  // Still there after a reload.
  await page.reload();
  await expect(atDesign).toBeVisible();

  // Dragged onto Copy, the other branch: a chip stands on both.
  save = saved(page);
  await drag(page, atDesign, await onStage(page, COPY));
  await save;
  await expect(chips(page, "Chipworks")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Chipworks is at Copy" })).toBeVisible();
  await expect(atDesign).toBeVisible();

  // One undo takes the move back.
  save = saved(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await save;
  await expect(chips(page, "Chipworks")).toHaveCount(1);
  await expect(atDesign).toBeVisible();
  expect(await statuses(page)).toMatchObject({ design: "in_progress", copy: "not_started" });

  // Let go over no box: it stays where it was, and nothing is saved.
  const canvas = (await whiteboard(page).boundingBox())!;
  await drag(page, atDesign, { x: canvas.x + canvas.width - 120, y: canvas.y + 200 });
  await expect(atDesign).toBeVisible();
  await expect(chips(page, "Chipworks")).toHaveCount(1);

  // From the keyboard: its menu lists every place in order, and Done is last.
  await atDesign.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Not started",
    "Brief",
    "Design",
    "Copy",
    "Review",
    "Done",
  ]);
  save = saved(page);
  // The list goes round, so up from the top is the foot.
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Done" })).toBeFocused();
  await page.keyboard.press("Enter");
  await save;
  await expect(tray(page, "Done").getByRole("button")).toHaveAccessibleName(
    "Chipworks is done",
  );
  expect(new Set(Object.values(await statuses(page)))).toEqual(new Set(["done"]));

  // A selected stage's card moves the record there: what comes after begins again.
  const brief = await onStage(page, BRIEF);
  await page.mouse.click(brief.x, brief.y);
  save = saved(page);
  await card(page).getByRole("button", { name: "Move Chipworks here" }).click();
  await save;
  await expect(page.getByRole("button", { name: "Chipworks is at Brief" })).toBeVisible();
  expect(await statuses(page)).toEqual({
    brief: "in_progress",
    design: "not_started",
    copy: "not_started",
    review: "not_started",
  });

  // Dragged onto the Not started tray: every stage is.
  save = saved(page);
  await drag(
    page,
    page.getByRole("button", { name: "Chipworks is at Brief" }),
    middle((await tray(page, "Not started").boundingBox())!),
  );
  await save;
  await expect(tray(page, "Not started").getByRole("button")).toHaveAccessibleName(
    "Chipworks has not started",
  );
  expect(new Set(Object.values(await statuses(page)))).toEqual(new Set(["not_started"]));

  expect(errors).toEqual([]);
});

test("a person's chip shows their picture, and a workflow has none", async ({ page }) => {
  // Placed directly, standing in for a read of the company's site that found it.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const { rows } = await pool.query(
    `insert into contact_photos (contact_id, owner_id, content_type, bytes, sha256, source_url)
     select id, owner_id, 'image/png', $1, 'fedcba9876543210', 'https://acme.test/people/priya.png'
     from contacts where full_name = 'Priya Sharma'
     on conflict (contact_id) do update set bytes = excluded.bytes, sha256 = excluded.sha256
     returning contact_id`,
    [ONE_PIXEL_PNG],
  );
  await pool.end();

  await page.goto("/people/contacts");
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
  await expect(panel(page).getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
  await startOn(page, contactTabs(page));
  const picture = tray(page, "Not started").getByRole("button").locator("img");
  await expect(picture).toHaveAttribute(
    "src",
    `/api/contacts/${rows[0].contact_id}/photo?v=fedcba987654`,
  );
  await expect
    .poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);

  // The workflow itself belongs to no one: no chip and no trays.
  await page.goto(template);
  await expect(whiteboard(page)).toBeVisible();
  await expect(halo(page, BRIEF)).toBeAttached();
  await expect(tray(page, "Not started")).toHaveCount(0);
  await expect(page.locator(".record-chips")).toHaveCount(0);
});

test("on a phone the trays sit inside the window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/people/contacts");
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
  await contactTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("link", { name: WORKFLOW, exact: true }).click();
  await expect(whiteboard(page)).toBeVisible();

  for (const name of ["Not started", "Done"]) {
    const { x, width, y, height } = (await tray(page, name).boundingBox())!;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(390);
    expect(y + height).toBeLessThanOrEqual(844);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
