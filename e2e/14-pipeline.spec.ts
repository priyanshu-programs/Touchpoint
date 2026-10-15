import { expect, test, type Locator, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
// Wide enough for every column of the workflow below to be on screen at once.
test.use({ storageState: OWNER_SESSION, viewport: { width: 1920, height: 1080 } });

const main = (page: Page) => page.getByRole("main");
const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const column = (page: Page, name: string) =>
  main(page).getByRole("region", { name, exact: true });
const cardIn = (page: Page, columnName: string, name: string) =>
  column(page, columnName).getByRole("article", { name, exact: true });
const cards = (page: Page) => main(page).getByRole("article");

// A move is saved by a server action.
const acted = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  );

// Brief leads to Design and to Copy, which both lead to Review: two branches.
// No starter's description holds the workflow's name.
const WORKFLOW = "Launch plan";
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
  version: number;
  elements: { id: string; customData?: { stage?: { status: string } } }[];
};
const sceneOf = (href: string) => `${href.replace("/workflows/", "/api/workflows/")}/scene`;
async function statuses(page: Page, href: string) {
  const stored = (await (await page.request.get(sceneOf(href))).json()) as Stored;
  return Object.fromEntries(
    stored.elements
      .filter((element) => element.customData?.stage)
      .map((element) => [element.id, element.customData!.stage!.status]),
  );
}

// Picked up by its handle and let go over the middle of a column.
async function drag(page: Page, card: Locator, to: Locator) {
  const handle = (await card.getByRole("button", { name: /^Drag / }).boundingBox())!;
  const target = (await to.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 10, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 12 });
  await page.mouse.up();
}

async function addCompany(page: Page, name: string) {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name })).toBeVisible();
  await companyTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: WORKFLOW }).click();
  await expect(
    panel(page)
      .getByRole("list", { name: "Workflows started here" })
      .getByRole("link", { name: WORKFLOW }),
  ).toBeVisible();
}

test("a workflow's copies are moved along its stages on the pipeline", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // A workflow that branches, drawn through the whiteboard's own save.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill(WORKFLOW);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  const template = new URL(page.url()).pathname;
  await page.goto("/workflows");
  const put = await page.request.put(sceneOf(template), {
    data: { version: 1, elements: DRAWING },
    headers: { origin: baseURL! },
  });
  expect(put.status()).toBe(200);

  await addCompany(page, "Pipe One");
  await addCompany(page, "Pipe Two");

  // The pipeline opens from the workflow's row, and is a tab beside the list.
  await page.goto("/workflows");
  await main(page)
    .getByRole("list", { name: "Your workflows" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: WORKFLOW, exact: true }) })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await expect(page).toHaveURL(/\/workflows\/pipeline\?workflow=[0-9a-f-]{36}$/);
  await expect(
    page
      .getByRole("navigation", { name: "Workflows", exact: true })
      .getByRole("link", { name: "Pipeline" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(main(page).getByRole("button", { name: `Workflow: ${WORKFLOW}` })).toBeVisible();

  // A column for each stage, in the order the arrows give, between Not started and Done.
  await expect(main(page).getByRole("region")).toHaveText([
    /^Not started/,
    /^Brief/,
    /^Design/,
    /^Copy/,
    /^Review/,
    /^Done/,
  ]);
  await expect(cardIn(page, "Not started", "Pipe One")).toBeVisible();
  await expect(cardIn(page, "Not started", "Pipe Two")).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  const boardOf = async (name: string) =>
    (await main(page).getByRole("link", { name, exact: true }).first().getAttribute("href"))!;
  const one = await boardOf("Pipe One");
  const two = await boardOf("Pipe Two");

  // Dragged to Design: Brief before it is done on the board, Copy is not touched.
  let move = acted(page);
  await drag(page, cardIn(page, "Not started", "Pipe One"), column(page, "Design"));
  await move;
  await expect(cardIn(page, "Design", "Pipe One")).toBeVisible();
  expect(await statuses(page, one)).toEqual({
    brief: "done",
    design: "in_progress",
    copy: "not_started",
    review: "not_started",
  });

  // Then to Copy, the other branch: it is at both, and each card says so.
  move = acted(page);
  await drag(page, cardIn(page, "Design", "Pipe One"), column(page, "Copy"));
  await move;
  await expect(cardIn(page, "Design", "Pipe One")).toContainText("Also at: Copy");
  await expect(cardIn(page, "Copy", "Pipe One")).toContainText("Also at: Design");
  expect(await statuses(page, one)).toMatchObject({ design: "in_progress", copy: "in_progress" });

  // Carried with the keyboard: picked up, one column to the right, put down.
  const handle = cardIn(page, "Not started", "Pipe Two").getByRole("button", {
    name: "Drag Pipe Two",
  });
  await handle.focus();
  move = acted(page);
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Pipe Two is over Brief.")).toBeAttached();
  await page.keyboard.press("Space");
  await move;
  await expect(cardIn(page, "Brief", "Pipe Two")).toBeVisible();
  expect(await statuses(page, two)).toMatchObject({ brief: "in_progress" });

  // Sent from its menu: every stage on the way to Review is done.
  move = acted(page);
  await cardIn(page, "Brief", "Pipe Two").getByRole("button", { name: "Move Pipe Two to" }).click();
  await page.getByRole("menuitem", { name: "Review" }).click();
  await move;
  await expect(cardIn(page, "Review", "Pipe Two")).toBeVisible();
  expect(await statuses(page, two)).toEqual({
    brief: "done",
    design: "done",
    copy: "done",
    review: "in_progress",
  });

  // Dragged to Done: every stage is, and the card is in that column alone.
  move = acted(page);
  await drag(page, cardIn(page, "Copy", "Pipe One"), column(page, "Done"));
  await move;
  await expect(cardIn(page, "Done", "Pipe One")).toBeVisible();
  await expect(main(page).getByRole("article", { name: "Pipe One" })).toHaveCount(1);
  expect(new Set(Object.values(await statuses(page, one)))).toEqual(new Set(["done"]));

  // Still there after a reload.
  await page.reload();
  await expect(cardIn(page, "Done", "Pipe One")).toBeVisible();
  await expect(cardIn(page, "Review", "Pipe Two")).toBeVisible();

  // Changed elsewhere since the page was opened: Copy is no longer a stage of
  // Pipe Two's board. The move is turned down and the card stays where it was.
  const stored = (await (await page.request.get(sceneOf(two))).json()) as Stored;
  const edited = await page.request.put(sceneOf(two), {
    data: {
      version: stored.version,
      elements: stored.elements.map(({ customData, ...element }) =>
        element.id === "copy" ? element : { ...element, customData },
      ),
    },
    headers: { origin: baseURL! },
  });
  expect(edited.status()).toBe(200);
  move = acted(page);
  await cardIn(page, "Review", "Pipe Two").getByRole("button", { name: "Move Pipe Two to" }).click();
  await page.getByRole("menuitem", { name: "Copy" }).click();
  await move;
  await expect(main(page).getByRole("alert")).toContainText(
    "That workflow has changed since this page was opened.",
  );
  await expect(cardIn(page, "Review", "Pipe Two")).toBeVisible();
  await expect(cardIn(page, "Copy", "Pipe Two")).toHaveCount(0);
  // Once reloaded, the page no longer offers what the board no longer has.
  await page.reload();
  await cardIn(page, "Review", "Pipe Two").getByRole("button", { name: "Move Pipe Two to" }).click();
  await expect(page.getByRole("menuitem", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // A card leads to its board and to its company's Workflows tab.
  await cardIn(page, "Done", "Pipe One").getByRole("link", { name: "Open company" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]{36}&tab=workflows$/);
  await expect(panel(page).getByRole("heading", { name: "Pipe One" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("the pipeline fits a phone, its columns scrolling on their own", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workflows/pipeline");
  // With no workflow named, the first in the owner's order is shown.
  await expect(main(page).getByRole("button", { name: /^Workflow: / })).toBeVisible();
  await main(page).getByRole("button", { name: /^Workflow: / }).click();
  await page.getByRole("menuitemradio", { name: WORKFLOW }).click();
  await expect(page).toHaveURL(/\?workflow=[0-9a-f-]{36}$/);
  await expect(cardIn(page, "Done", "Pipe One")).toBeAttached();
  await expect(column(page, "Not started")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // A made-up workflow falls back to the first; the page still opens.
  await page.goto("/workflows/pipeline?workflow=0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11");
  await expect(main(page).getByRole("button", { name: /^Workflow: / })).toBeVisible();
  await page.goto("/workflows/pipeline?workflow=not-an-id");
  await expect(main(page).getByRole("button", { name: /^Workflow: / })).toBeVisible();
});
