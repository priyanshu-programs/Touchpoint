import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The sidebar has a "Workflows" link too, so the page's own are looked for in its content.
const main = (page: Page) => page.getByRole("main");
const workflows = (page: Page) =>
  main(page).getByRole("list", { name: "Your workflows" }).getByRole("listitem");
const row = (page: Page, name: string) => workflows(page).filter({ hasText: name });
const names = (page: Page) => workflows(page).getByRole("link");
const panel = (page: Page) => page.getByRole("dialog");
// The sidebar also has a link named Workflows, so a tab is looked for in the record's own bar.
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });
// One board in a record's Workflows tab.
const board = (page: Page, name: string) =>
  panel(page).getByRole("region", { name, exact: true });
const ID = "[0-9a-f-]{36}";
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const card = (page: Page) => page.getByRole("region", { name: "Selected box" });
// The glow behind a stage, and the colour it is drawn in.
const halos = (page: Page) => page.locator(".stage-halo");
const haloColor = (page: Page) =>
  halos(page).evaluate((halo) => getComputedStyle(halo, "::before").backgroundColor);
const middle = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });

// One stroke of the pen through those points, and a ring of points for a circle
// drawn by hand, ending a little short of where it began.
async function stroke(page: Page, points: [number, number][]) {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
}
const ring = (x: number, y: number, radius: number) =>
  Array.from({ length: 33 }, (_, index): [number, number] => {
    const angle = (index / 32) * 2 * Math.PI * 0.98;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  });

const SCENE = /\/api\/workflows\/[0-9a-f-]{36}\/scene$/;
// A drawing saves itself a little after the last change to it.
const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      SCENE.test(new URL(response.url()).pathname),
  );

// A change made outside the whiteboard is saved by a server action.
const acted = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  );

// What the page says on its console, and every address it asks another site for.
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

test("a starter workflow is added in one click and opens as a whiteboard", async ({
  page,
}) => {
  const seen = watch(page);

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Workflows" })
    .click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(
    main(page).getByRole("heading", { name: "Workflows", exact: true }),
  ).toBeVisible();
  await expect(main(page).getByText(/^No workflows yet\./)).toBeVisible();

  const add = (name: string) =>
    main(page).getByRole("button", { name: `Add ${name}` });
  await expect(add("Website Project")).toBeVisible();
  // Neither a starter nor a workflow of the owner's lists its stages here.
  await expect(main(page)).not.toContainText("Identified");
  await add("Prospecting").click();

  // Listed by its name and what it is for, and no longer offered.
  await expect(row(page, "Prospecting")).toContainText("From a first look");
  await expect(main(page)).not.toContainText("Identified");
  await expect(add("Prospecting")).toHaveCount(0);
  await expect(add("Website Project")).toBeVisible();

  // The whiteboard's fonts come from this app.
  const font = page.waitForResponse(
    (response) => response.url().includes("/excalidraw/fonts/") && response.ok(),
  );
  await main(page).getByRole("link", { name: "Prospecting" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(heading(page, "Prospecting")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();
  await font;
  // It has the window to itself: no sidebar.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("the page behind the drawing is the owner's choice, and is remembered", async ({
  page,
}) => {
  const paper = page.locator(".board-paper");
  const drawn = () =>
    paper.evaluate((layer) => getComputedStyle(layer).backgroundImage);
  const menu = page.getByTestId("main-menu-trigger");
  const choice = (name: string) => page.getByRole("button", { name, exact: true });

  await page.goto("/workflows");
  await main(page).getByRole("link", { name: "Prospecting" }).click();
  await expect(whiteboard(page)).toBeVisible();
  // The dotted grid, until another page is chosen.
  await expect(paper).toHaveAttribute("data-paper", "dots");
  expect(await drawn()).toContain("radial-gradient");

  await menu.click();
  await expect(choice("Dotted grid")).toHaveAttribute("aria-pressed", "true");
  await choice("Grid").click();
  await expect(paper).toHaveAttribute("data-paper", "grid");
  expect(await drawn()).toContain("linear-gradient");

  // The page grows with the drawing when it is zoomed in, and moves with it.
  const squares = () =>
    paper.evaluate((layer) => parseFloat(getComputedStyle(layer).backgroundSize));
  const corner = () =>
    paper.evaluate((layer) => getComputedStyle(layer).getPropertyValue("--paper-y"));
  const canvas = (await whiteboard(page).boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 0.75, canvas.y + canvas.height * 0.8);
  const before = { size: await squares(), y: await corner() };
  // A turn of the wheel with Control held zooms in by a tenth.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect.poll(squares).toBeGreaterThan(before.size * 1.05);
  const zoomed = await corner();
  await page.mouse.wheel(0, 200);
  await expect.poll(corner).not.toBe(zoomed);

  // The choice is for every whiteboard, and is there again after a reload.
  await page.reload();
  await expect(paper).toHaveAttribute("data-paper", "grid");
  await expect(whiteboard(page)).toBeVisible();
  await menu.click();
  await expect(choice("Grid")).toHaveAttribute("aria-pressed", "true");
  await choice("Lines").click();
  await expect(paper).toHaveAttribute("data-paper", "lines");
  expect(await drawn()).toContain("linear-gradient");
  await menu.click();
  await choice("Plain").click();
  await expect(paper).toHaveAttribute("data-paper", "plain");
  expect(await drawn()).toBe("none");

  // The cookie is the browser's to write: one that names no page gives the dots.
  await page.context().addCookies([
    {
      name: "board-paper",
      value: "url(x)",
      domain: new URL(page.url()).hostname,
      path: "/",
    },
  ]);
  await page.reload();
  await expect(paper).toHaveAttribute("data-paper", "dots");
});

test("a workflow is drawn by hand: a box made a stage, saved, renamed and deleted", async ({
  page,
}) => {
  const seen = watch(page);

  await page.goto("/workflows");
  await main(page).getByRole("link", { name: "New workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/new$/);

  // A name another workflow has is refused, and what was typed stays.
  await page.getByLabel("Name").fill("prospecting");
  await page.getByLabel("Description").fill("First month with a new client");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(main(page).getByRole("alert")).toHaveText(
    "There is already a workflow called prospecting.",
  );
  await expect(page.getByLabel("Description")).toHaveValue(
    "First month with a new client",
  );
  await page.getByLabel("Name").fill("Client onboarding");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(heading(page, "Client onboarding")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();
  // Nothing is selected on an empty whiteboard.
  await expect(card(page)).toHaveCount(0);

  // Draw a box and write a name in it.
  await page.keyboard.press("r");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.mouse.up();
  await expect(card(page).getByRole("button", { name: "Make this a stage" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Welcome call");
  await page.keyboard.press("Escape");

  // A box that is not a stage has no glow; a stage has one, where it was drawn.
  await expect(halos(page)).toHaveCount(0);
  const save = saved(page);
  await card(page).getByRole("button", { name: "Make this a stage" }).click();
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(halos(page)).toHaveCount(1);
  const drawn = (await halos(page).boundingBox())!;
  expect(Math.abs(middle(drawn).x - 600)).toBeLessThan(3);
  expect(Math.abs(middle(drawn).y - 350)).toBeLessThan(3);
  // As wide as its box, and up to a twentieth wider as it grows and fades.
  expect(drawn.width).toBeGreaterThan(197);
  expect(drawn.width).toBeLessThan(213);
  await expect(halos(page)).toHaveCSS("animation-name", "stage-halo");

  // It is all still there after a reload: the box, in the middle of the
  // whiteboard now, is a stage.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  const box = await whiteboard(page).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();

  // The glow went to the middle with its box, and stays behind it when the
  // drawing is made smaller: a click on the glow still lands on the box.
  await expect
    .poll(async () => Math.abs(middle((await halos(page).boundingBox())!).x - middle(box!).x))
    .toBeLessThan(3);
  // A click on bare canvas, clear of the whiteboard's panels, selects nothing.
  await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.8);
  await expect(card(page)).toHaveCount(0);
  await page.keyboard.press("Control+Minus");
  await expect
    .poll(async () => (await halos(page).boundingBox())!.width)
    .toBeLessThan(192);
  const smaller = middle((await halos(page).boundingBox())!);
  await page.mouse.click(smaller.x, smaller.y);
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();
  await page.keyboard.press("Control+0");

  // It holds still for someone who has asked for less motion.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(halos(page)).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Renaming keeps the drawing; a name another workflow has is refused.
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename workflow" });
  await expect(rename.getByLabel("Description")).toHaveValue(
    "First month with a new client",
  );
  await rename.getByLabel("Name").fill("Prospecting");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(rename.getByRole("alert")).toContainText(
    "There is already a workflow called Prospecting.",
  );
  await rename.getByLabel("Name").fill("Onboarding");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(rename).toBeHidden();
  await expect(heading(page, "Onboarding")).toBeVisible();

  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Onboarding")).toContainText("First month with a new client");
  await expect(row(page, "Onboarding")).not.toContainText("Welcome call");

  // Back shows the drawing as it is stored, and it still saves: off and on again.
  await page.goBack();
  await expect(heading(page, "Onboarding")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (const press of ["Not a stage", "Make this a stage"]) {
    const again = saved(page);
    await card(page).getByRole("button", { name: press }).click();
    expect((await again).status()).toBe(200);
  }
  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(row(page, "Onboarding")).toBeVisible();

  // The workflow goes only after confirming; the starter added earlier stays.
  await main(page).getByRole("link", { name: "Onboarding" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const confirm = page.getByRole("alertdialog", { name: "Delete Onboarding?" });
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete workflow" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Onboarding")).toHaveCount(0);
  await expect(row(page, "Prospecting")).toBeVisible();

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("a drawing is saved only by the owner, from this app, and from its latest version", async ({
  page,
  baseURL,
  browser,
}) => {
  // A new workflow, so its drawing is at its first version.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Elsewhere");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const scene = `${new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/")}/scene`;
  const from = { origin: baseURL! };
  const put = (data: unknown, headers: Record<string, string> = from) =>
    page.request.put(scene, { data, headers }).then((response) => response.status());

  // A request that does not say it came from this app is refused, signed in or not.
  expect(await put({ version: 1, elements: [] }, {})).toBe(403);
  expect(await put({ version: 1, elements: [] }, { origin: "https://example.com" })).toBe(403);
  // So is a drawing with another site's page in it, and anything that is not a drawing.
  expect(await put({ version: 1, elements: [{ id: "a", type: "embeddable" }] })).toBe(400);
  expect(await put({ version: 1 })).toBe(400);
  // A workflow that is not there.
  expect(
    await page.request
      .put("/api/workflows/0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11/scene", {
        data: { version: 1, elements: [] },
        headers: from,
      })
      .then((response) => response.status()),
  ).toBe(404);

  const stranger = await browser.newContext({ storageState: undefined });
  expect(
    (
      await stranger.request.put(`${baseURL}${scene}`, {
        data: { version: 1, elements: [] },
        headers: from,
      })
    ).status(),
  ).toBe(401);
  // Nor is a drawing read without a session, though its owner reads it.
  expect((await stranger.request.get(`${baseURL}${scene}`)).status()).toBe(401);
  expect(await (await page.request.get(scene)).json()).toEqual({
    version: 1,
    elements: [],
  });
  await stranger.close();

  // Saved from somewhere else while this whiteboard is open: its next save is
  // refused and it says so, keeping what the other one saved.
  const one = { id: "elsewhere", type: "rectangle", x: 0, y: 0, width: 80, height: 40 };
  expect(await put({ version: 1, elements: [one] })).toBe(200);
  expect(await put({ version: 1, elements: [] })).toBe(409);

  const refusal = saved(page);
  await page.keyboard.press("r");
  await page.mouse.move(500, 520);
  await page.mouse.down();
  await page.mouse.move(640, 600, { steps: 6 });
  await page.mouse.up();
  expect((await refusal).status()).toBe(409);
  await expect(
    page.getByText("Changed somewhere else. Reload to go on."),
  ).toBeVisible();

  // What the other one saved is what is kept.
  expect(await (await page.request.get(scene)).json()).toMatchObject({
    version: 2,
    elements: [{ id: "elsewhere" }],
  });
  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await main(page).getByRole("link", { name: "Elsewhere" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete workflow" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Elsewhere")).toHaveCount(0);
});

test("workflows are put in an order of the owner's own, by keyboard and by mouse", async ({
  page,
}) => {
  await page.goto("/workflows");
  await main(page).getByRole("button", { name: "Add Website Project" }).click();
  // A workflow added later goes to the end.
  await expect(names(page)).toHaveText(["Prospecting", "Website Project"]);

  const handle = (name: string) =>
    main(page).getByRole("button", { name: `Move ${name}` });
  let save = acted(page);
  await handle("Website Project").focus();
  await page.keyboard.press("ArrowUp");
  await expect(names(page)).toHaveText(["Website Project", "Prospecting"]);
  await expect(
    main(page).getByText("Website Project moved to place 1 of 2."),
  ).toBeAttached();
  // The handle keeps the focus, so the next key press moves the same row.
  await expect(handle("Website Project")).toBeFocused();
  await save;

  await page.reload();
  await expect(names(page)).toHaveText(["Website Project", "Prospecting"]);

  const from = (await handle("Website Project").boundingBox())!;
  const to = (await handle("Prospecting").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  save = acted(page);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, {
    steps: 8,
  });
  await page.mouse.up();
  await save;
  await expect(names(page)).toHaveText(["Prospecting", "Website Project"]);
  await page.reload();
  await expect(names(page)).toHaveText(["Prospecting", "Website Project"]);
});

test("a workflow is started on a company, followed from its panel and opened as its own board", async ({
  page,
}) => {
  const seen = watch(page);

  // A company of this file's own.
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await form.getByLabel("Name", { exact: true }).fill("Board Works");
  await form.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Board Works" })).toBeVisible();

  await companyTabs(page).getByRole("link", { name: "Workflows" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=workflows$`));
  await expect(panel(page).getByText(/^No workflow started yet\./)).toBeVisible();

  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: "Prospecting" }).click();
  const prospecting = board(page, "Prospecting");
  await expect(prospecting).toContainText("0 of 6 done · Now: Identified");
  await expect(prospecting.getByRole("listitem")).toHaveCount(6);

  // A stage's status is changed where it is read, and the line above follows.
  const setStatus = async (stage: string, from: string, to: string) => {
    await prospecting
      .getByRole("button", { name: `Status of ${stage}: ${from}` })
      .click();
    await page.getByRole("menuitemradio", { name: to }).click();
    await expect(
      prospecting.getByRole("button", { name: `Status of ${stage}: ${to}` }),
    ).toBeVisible();
  };
  await setStatus("Identified", "Not started", "Done");
  await expect(prospecting).toContainText("1 of 6 done · Now: Contacted");
  await setStatus("Contacted", "Not started", "Blocked");
  await expect(prospecting).toContainText("1 of 6 done · Now: In conversation");
  await expect(prospecting).toContainText("Blocked: Contacted");

  // The board is the company's own: it says whose it is and leads back there.
  await prospecting.getByRole("link", { name: "Prospecting" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${ID}$`));
  await expect(heading(page, "Prospecting")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Board Works" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=workflows$`));
  await expect(board(page, "Prospecting")).toContainText("Blocked: Contacted");
  const company = page.url();

  // The owner's workflow is as it was: its copy's statuses are the copy's alone.
  await page.goto("/workflows");
  await main(page).getByRole("link", { name: "Prospecting" }).click();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByRole("link", { name: "Workflows" })).toBeVisible();
  const template = `${new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/")}/scene`;
  const { elements } = (await (await page.request.get(template)).json()) as {
    elements: { customData?: { stage?: { status: string } } }[];
  };
  expect(
    elements.flatMap((element) => element.customData?.stage?.status ?? []),
  ).toEqual(Array(6).fill("not_started"));

  // Deleting the company's board leads back to the company, and leaves the workflow.
  await page.goto(company);
  await board(page, "Prospecting").getByRole("link", { name: "Prospecting" }).click();
  await expect(whiteboard(page)).toBeVisible();
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete workflow" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=workflows$`));
  await expect(panel(page).getByText(/^No workflow started yet\./)).toBeVisible();
  await page.goto("/workflows");
  await expect(row(page, "Prospecting")).toBeVisible();

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("a blank board on a person: a stage's status is set on the board and in the panel", async ({
  page,
}) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Bea");
  await page.getByLabel("Last name").fill("Boarder");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(panel(page).getByRole("heading", { name: "Bea Boarder" })).toBeVisible();

  await contactTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: "Blank board…" }).click();
  const blank = page.getByRole("dialog", { name: "Blank board" });
  await blank.getByLabel("Name").fill("Custom plan");
  await blank.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${ID}$`));
  await expect(heading(page, "Custom plan")).toBeVisible();
  await expect(whiteboard(page)).toBeVisible();

  // A box drawn here can be a stage, and on a record's board a stage has a status.
  await page.keyboard.press("r");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Draft");
  await page.keyboard.press("Escape");
  await expect(card(page).getByRole("group", { name: "Status" })).toHaveCount(0);
  await card(page).getByRole("button", { name: "Make this a stage" }).click();
  const status = (name: string) =>
    card(page).getByRole("group", { name: "Status" }).getByRole("button", { name });
  await expect(status("Not started")).toHaveAttribute("aria-pressed", "true");
  // On a record's board the glow behind a stage is in its status's colour.
  await expect.poll(() => haloColor(page)).toBe("rgb(134, 142, 150)");
  const save = saved(page);
  await status("Done").click();
  await expect(status("Done")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => haloColor(page)).toBe("rgb(47, 158, 68)");
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The panel shows what the board says, and changes it without opening the board.
  await page.getByRole("link", { name: "Bea Boarder" }).click();
  await expect(page).toHaveURL(new RegExp(`contact=${ID}&tab=workflows$`));
  const plan = board(page, "Custom plan");
  await expect(plan).toContainText("1 of 1 done");
  await plan.getByRole("button", { name: "Status of Draft: Done" }).click();
  await page.getByRole("menuitemradio", { name: "In progress" }).click();
  await expect(plan).toContainText("0 of 1 done · Now: Draft");

  // Opened again, the box is in the middle of the whiteboard and has that status.
  await plan.getByRole("link", { name: "Custom plan" }).click();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const canvas = (await whiteboard(page).boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(status("In progress")).toHaveAttribute("aria-pressed", "true");
});

test("a shape drawn with the pen is offered as a stage, and becomes a real box or circle", async ({
  page,
}) => {
  const seen = watch(page);
  const ask = page.getByRole("group", { name: "Make this a stage?" });

  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Sketches");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const scene = `${new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/")}/scene`;
  const kinds = async () => {
    const { elements } = (await (await page.request.get(scene)).json()) as {
      elements: { type: string }[];
    };
    return elements.map(({ type }) => type).sort();
  };

  // A rough box, closed where it began: the whiteboard asks, and No leaves it a stroke.
  await page.keyboard.press("p");
  await stroke(page, [
    [400, 250],
    [650, 250],
    [650, 400],
    [400, 400],
    [400, 256],
  ]);
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "No" }).click();
  await expect(ask).toHaveCount(0);
  await expect(halos(page)).toHaveCount(0);

  // A stroke left open is no shape, and brings no question.
  let save = saved(page);
  await stroke(page, [
    [380, 470],
    [520, 500],
    [680, 480],
  ]);
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(ask).toHaveCount(0);

  // A rough circle, taken up: it becomes a real one, a stage, where it was drawn.
  await stroke(page, ring(820, 330, 80));
  await expect(ask).toBeVisible();
  save = saved(page);
  await ask.getByRole("button", { name: "Yes" }).click();
  await expect(ask).toHaveCount(0);
  await expect(halos(page)).toHaveCount(1);
  await expect(halos(page)).toHaveAttribute("data-shape", "ellipse");
  const circle = middle((await halos(page).boundingBox())!);
  expect(Math.abs(circle.x - 820)).toBeLessThan(6);
  expect(Math.abs(circle.y - 330)).toBeLessThan(6);
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await kinds()).toEqual(["ellipse", "freedraw", "freedraw"]);

  // One undo brings the stroke back in place of the circle, and redo the circle.
  save = saved(page);
  await page.keyboard.press("Control+z");
  await expect(halos(page)).toHaveCount(0);
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await kinds()).toEqual(["freedraw", "freedraw", "freedraw"]);
  save = saved(page);
  await page.keyboard.press("Control+Shift+z");
  await expect(halos(page)).toHaveCount(1);
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // It is a stage like any other after a reload.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await expect(halos(page)).toHaveCount(1);

  expect(seen.outside).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("handwriting is made a stage by selecting it and giving it a name", async ({
  page,
}) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Hana");
  await page.getByLabel("Last name").fill("Writer");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(panel(page).getByRole("heading", { name: "Hana Writer" })).toBeVisible();
  await contactTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: "Blank board…" }).click();
  const blank = page.getByRole("dialog", { name: "Blank board" });
  await blank.getByLabel("Name").fill("Notes");
  await blank.getByRole("button", { name: "Create board" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const scene = `${new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/")}/scene`;

  // Two strokes of a scribble: neither closes into a shape, so nothing is asked.
  await page.keyboard.press("p");
  await stroke(page, [
    [500, 300],
    [540, 350],
    [580, 300],
  ]);
  await stroke(page, [
    [610, 300],
    [650, 350],
  ]);
  await expect(page.getByRole("group", { name: "Make this a stage?" })).toHaveCount(0);

  // Selected together, they can be made a stage under a typed name.
  await page.keyboard.press("v");
  await page.mouse.move(440, 250);
  await page.mouse.down();
  await page.mouse.move(720, 420, { steps: 8 });
  await page.mouse.up();
  const strokes = page.getByRole("form", { name: "Selected drawing" });
  await strokes.getByLabel("Name").fill("  Signed off ");
  const save = saved(page);
  await strokes.getByRole("button", { name: "Make this a stage" }).click();
  await expect(strokes).toHaveCount(0);
  await expect(halos(page)).toHaveCount(1);
  expect((await save).status()).toBe(200);

  // The box behind them is the stage, and they are grouped with it to move as one.
  const { elements } = (await (await page.request.get(scene)).json()) as {
    elements: {
      type: string;
      groupIds: string[];
      customData?: { stage?: { status: string; name?: string } };
    }[];
  };
  expect(elements.map(({ type }) => type)).toEqual(["rectangle", "freedraw", "freedraw"]);
  expect(elements[0].customData).toEqual({
    stage: { status: "not_started", name: "Signed off" },
  });
  expect(elements[0].groupIds).toHaveLength(1);
  for (const element of elements) expect(element.groupIds).toEqual(elements[0].groupIds);

  // Selected as one, it has a status like any stage, which keeps its name.
  const status = (name: string) =>
    card(page).getByRole("group", { name: "Status" }).getByRole("button", { name });
  await expect(status("Not started")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page)).toContainText("called “Signed off”");
  const again = saved(page);
  await status("Done").click();
  expect((await again).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Hana Writer" }).click();
  const notes = board(page, "Notes");
  await expect(notes).toContainText("1 of 1 done");
  await expect(
    notes.getByRole("button", { name: "Status of Signed off: Done" }),
  ).toBeVisible();
});

test("closing the whiteboard with a change not yet saved asks first", async ({
  page,
}) => {
  await page.goto("/workflows");
  await main(page).getByRole("link", { name: "Website Project" }).click();
  await expect(whiteboard(page)).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.type());
    // Stay on the page.
    await dialog.dismiss();
  });

  // The save is held back, so the change stays unsaved for as long as it takes.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(SCENE, async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  await page.keyboard.press("r");
  await page.mouse.move(300, 500);
  await page.mouse.down();
  await page.mouse.move(400, 560, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toEqual(["beforeunload"]);
  expect(page.isClosed()).toBe(false);

  // Once it is saved, the page closes without a word.
  release();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(asked).toEqual(["beforeunload"]);
});

test("a box carries links and files: added, opened, marked on the canvas and copied with the workflow", async ({
  page,
  baseURL,
  browser,
}) => {
  // Two whiteboards, a company's panel and a four-megabyte file in one story.
  test.setTimeout(120_000);
  const seen = watch(page);
  const marks = page.locator(".box-mark");
  const carried = () => card(page).getByRole("listitem");
  const contract = {
    name: "Signed contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsigned\n%%EOF\n"),
  };
  const pick = (file: { name: string; mimeType: string; buffer: Buffer }) =>
    card(page).getByLabel("File to add").setInputFiles(file);

  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Paperwork");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const api = new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/");

  await page.keyboard.press("r");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Signed papers");
  await page.keyboard.press("Escape");
  await expect(card(page).getByText("Links and files")).toBeVisible();
  await expect(marks).toHaveCount(0);

  // A link goes on the box at once, though the box was drawn a moment ago: the
  // drawing is saved first. An address typed without its start is a web address,
  // and a link given no name goes by its site's.
  await card(page).getByRole("button", { name: "Add link" }).click();
  const linking = card(page).getByRole("form", { name: "Add a link" });
  await linking.getByLabel("Address").fill("example.com/brief");
  await linking.getByRole("button", { name: "Add", exact: true }).click();
  const link = carried().getByRole("link", { name: "example.com" });
  await expect(link).toHaveAttribute("href", "https://example.com/brief");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(linking).toHaveCount(0);
  await expect(marks).toHaveText("1");

  // Nothing but a web address is kept, and what was typed stays to be corrected.
  await card(page).getByRole("button", { name: "Add link" }).click();
  await linking.getByLabel("Address").fill("javascript:alert(1)");
  await linking.getByLabel("Name (optional)").fill("Brief");
  await linking.getByRole("button", { name: "Add", exact: true }).click();
  await expect(card(page).getByRole("alert")).toHaveText(
    "Enter a link that starts with http:// or https://",
  );
  await expect(linking.getByLabel("Name (optional)")).toHaveValue("Brief");
  await linking.getByRole("button", { name: "Cancel" }).click();
  await expect(carried()).toHaveCount(1);

  // A file, listed with its size; the mark above the box's corner counts both.
  await pick(contract);
  const file = carried().getByRole("link", { name: "Signed contract.pdf" });
  await expect(file).toBeVisible();
  await expect(carried().nth(1)).toContainText("1 KB");
  await expect(marks).toHaveText("2");
  const mark = (await marks.boundingBox())!;
  expect(Math.abs(mark.x + mark.width - 700)).toBeLessThan(3);
  expect(Math.abs(mark.y + mark.height - 296)).toBeLessThan(3);
  expect(seen.errors).toEqual([]);

  // A file is what its bytes say it is, whatever it is called, and has a size
  // it may not pass. Neither is kept.
  await pick({ ...contract, name: "notes.pdf", buffer: Buffer.from("only text") });
  await expect(card(page).getByRole("alert")).toContainText(
    "Only PDFs, pictures and Word, Excel and PowerPoint files are kept.",
  );
  await pick({
    ...contract,
    buffer: Buffer.concat([contract.buffer, Buffer.alloc(4 * 1024 * 1024)]),
  });
  await expect(card(page).getByRole("alert")).toHaveText(
    "That file is larger than 4 MB. Attach it as a link instead.",
  );
  await expect(carried()).toHaveCount(2);

  // The file comes back as it went, to its owner only, as a PDF to be shown.
  const address = (await file.getAttribute("href"))!;
  expect(address).toMatch(new RegExp(`^${api}/attachments/${ID}$`));
  const fetched = await page.request.get(address);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"]).toBe("application/pdf");
  expect(fetched.headers()["content-disposition"]).toBe(
    "inline; filename*=UTF-8''Signed%20contract.pdf",
  );
  expect(fetched.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await fetched.body()).equals(contract.buffer)).toBe(true);
  const stranger = await browser.newContext({ storageState: undefined });
  expect((await stranger.request.get(`${baseURL}${address}`)).status()).toBe(401);
  await stranger.close();

  // A file is taken only from this app, and only for a box of the drawing.
  const { elements } = (await (await page.request.get(`${api}/scene`)).json()) as {
    elements: { id: string; type: string }[];
  };
  const box = elements.find(({ type }) => type === "rectangle")!;
  const post = (elementId: string, headers: Record<string, string>) =>
    page.request
      .post(`${api}/attachments`, { multipart: { elementId, file: contract }, headers })
      .then((response) => response.status());
  expect(await post(box.id, {})).toBe(403);
  expect(await post(box.id, { origin: "https://example.com" })).toBe(403);
  expect(await post("not-a-box", { origin: baseURL! })).toBe(409);
  expect(
    await page.request
      .post(`${api}/attachments`, {
        multipart: { elementId: box.id, file: contract, title: "extra" },
        headers: { origin: baseURL! },
      })
      .then((response) => response.status()),
  ).toBe(400);

  // It is all still there after a reload, the mark before the box is selected.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await expect(marks).toHaveText("2");
  const canvas = (await whiteboard(page).boundingBox())!;
  await page.mouse.click(middle(canvas).x, middle(canvas).y);
  await expect(carried()).toHaveCount(2);

  // On a phone the card stands above the tools, with everything on it in reach.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card(page).getByRole("button", { name: "Add file" })).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Taken off the box, the link is gone and the mark counts one.
  await carried().getByRole("button", { name: "Remove example.com" }).click();
  await expect(carried()).toHaveCount(1);
  await expect(marks).toHaveText("1");

  // Started on a company, the workflow's copy carries the file as well, under
  // an address of its own.
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Board Works", exact: true }).click();
  await companyTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: "Paperwork" }).click();
  await board(page, "Paperwork").getByRole("link", { name: "Paperwork" }).click();
  await expect(whiteboard(page)).toBeVisible();
  await expect(marks).toHaveText("1");
  const copied = (await whiteboard(page).boundingBox())!;
  await page.mouse.click(middle(copied).x, middle(copied).y);
  const copy = carried().getByRole("link", { name: "Signed contract.pdf" });
  await expect(copy).toBeVisible();
  const copyAddress = (await copy.getAttribute("href"))!;
  expect(copyAddress).not.toBe(address);
  expect((await (await page.request.get(copyAddress)).body()).equals(contract.buffer)).toBe(
    true,
  );

  // The company's board goes, then the workflow; the file went with the last of them.
  for (const back of [new RegExp(`company=${ID}&tab=workflows$`), /\/workflows$/]) {
    await page.getByRole("button", { name: "Workflow actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete workflow" }).click();
    await expect(page).toHaveURL(back);
    if (back.source.includes("company")) {
      expect((await page.request.get(address)).status()).toBe(200);
      await page.goto("/workflows");
      await main(page).getByRole("link", { name: "Paperwork" }).click();
      await expect(whiteboard(page)).toBeVisible();
    }
  }
  expect((await page.request.get(address)).status()).toBe(404);
  await expect(row(page, "Paperwork")).toHaveCount(0);

  expect(seen.outside).toEqual([]);
  // The one error is the browser's own note that the text file was turned away.
  expect(seen.errors.filter((error) => !error.includes("415"))).toEqual([]);
});

test("pictures are drawn on a whiteboard: stored, fetched again, refused when not a picture and copied with the workflow", async ({
  page,
  baseURL,
  browser,
}) => {
  // Two whiteboards and a company's panel in one story.
  test.setTimeout(120_000);
  const seen = watch(page);
  const PICTURES = new RegExp(`/api/workflows/${ID}/pictures$`);
  let sends = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && PICTURES.test(new URL(request.url()).pathname)) {
      sends++;
    }
  });
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
  // The colour drawn at a point of the window.
  const inked = (x: number, y: number) =>
    page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".excalidraw canvas.static",
        )!;
        const box = canvas.getBoundingClientRect();
        const scale = canvas.width / box.width;
        const [red, green, blue] = canvas
          .getContext("2d")!
          .getImageData((x - box.left) * scale, (y - box.top) * scale, 1, 1).data;
        return { red, green, blue };
      },
      [x, y],
    );
  const blue = async (x: number, y: number) => {
    const { red, blue } = await inked(x, y);
    return red < 110 && blue > 150;
  };
  // Twice as wide as the whiteboard keeps a picture.
  const photo: Sent = {
    name: "Site photo.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 2880, height: 1440, channels: 3, background: "#3366cc" },
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

  // The last file a form was given is kept, to see what the whiteboard sends.
  await page.addInitScript(() => {
    const set = FormData.prototype.set as (this: FormData, ...given: unknown[]) => void;
    FormData.prototype.set = function (this: FormData, ...given: unknown[]) {
      if (given[1] instanceof Blob) Object.assign(window, { sentPicture: given[1] });
      set.apply(this, given);
    };
  });

  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Moodboard");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const api = new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/");
  // The picture tool is among the whiteboard's tools.
  await expect(page.locator('[data-testid="toolbar-image"]')).toBeAttached();

  // A picture dropped on the whiteboard is sent, and only then the drawing.
  const [upload, save] = await Promise.all([sent(), saved(page), drop(photo, 640, 380)]);
  expect(upload.status()).toBe(204);
  expect(save.ok()).toBe(true);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => blue(640, 380)).toBe(true);
  // The whiteboard made it smaller before it was sent.
  expect(
    await page.evaluate(async () => {
      const { sentPicture } = window as unknown as { sentPicture: Blob };
      const { width, height } = await createImageBitmap(sentPicture);
      return { type: sentPicture.type, width, height };
    }),
  ).toEqual({ type: "image/png", width: 1440, height: 720 });
  expect(seen.errors).toEqual([]);

  // The drawing holds the picture's id, and the bytes are kept under it: as
  // WebP, the size the whiteboard shows them, for their owner only.
  const pictures = async (from = api) => {
    const { elements } = (await (await page.request.get(`${from}/scene`)).json()) as {
      elements: { type: string; fileId?: string }[];
    };
    return elements.filter(({ type }) => type === "image").map(({ fileId }) => fileId!);
  };
  const [key] = await pictures();
  expect(key).toMatch(/^[0-9a-f]{40}$/);
  const address = `${api}/pictures/${key}`;
  const fetched = await page.request.get(address);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"]).toBe("image/webp");
  expect(fetched.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  expect(fetched.headers()["x-content-type-options"]).toBe("nosniff");
  const stored = await fetched.body();
  expect(await sharp(stored).metadata()).toMatchObject({
    format: "webp",
    width: 1440,
    height: 720,
  });
  const stranger = await browser.newContext({ storageState: undefined });
  expect((await stranger.request.get(`${baseURL}${address}`)).status()).toBe(401);
  await stranger.close();
  expect((await page.request.get(`${api}/pictures/${"0".repeat(40)}`)).status()).toBe(404);

  // A picture is taken only from this app, under an id, and only if it is one.
  const post = (multipart: Record<string, string | Sent>, origin?: string) =>
    page.request
      .post(`${api}/pictures`, { multipart, headers: origin ? { origin } : {} })
      .then((response) => response.status());
  expect(await post({ key: "other", file: photo })).toBe(403);
  expect(await post({ key: "other", file: photo }, "https://example.com")).toBe(403);
  expect(await post({ file: photo }, baseURL!)).toBe(400);
  expect(await post({ key: "../scene", file: photo }, baseURL!)).toBe(400);
  expect(await post({ key: "other", file: photo, title: "extra" }, baseURL!)).toBe(400);
  expect(await post({ key: "other", file: vector }, baseURL!)).toBe(415);
  expect(await post({ key: "other", file: { ...photo, buffer: Buffer.from("text") } }, baseURL!)).toBe(415);

  // After a reload the picture is fetched by its id and drawn again, and is
  // not sent a second time.
  const before = sends;
  const again = page.waitForResponse(
    (response) => new URL(response.url()).pathname === address && response.ok(),
  );
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await again;
  const canvas = middle((await whiteboard(page).boundingBox())!);
  await expect.poll(() => blue(canvas.x, canvas.y)).toBe(true);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(sends).toBe(before);

  // A picture that cannot be kept is taken off the whiteboard again, with a
  // sentence saying why, and nothing is left waiting to be saved.
  const turnedAway = sent();
  await drop(vector, 300, 250);
  expect((await turnedAway).status()).toBe(415);
  await expect(
    page.getByText("Only PNG, JPEG, GIF and WebP pictures are kept.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await pictures()).toEqual([key]);
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  await expect.poll(() => blue(canvas.x, canvas.y)).toBe(true);
  expect(await pictures()).toEqual([key]);

  // On a phone the tools, now with the picture tool among them, and the save
  // state beside them are all on the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  for (const tool of ["selection", "image", "eraser"]) {
    await expect(page.locator(`[data-testid="toolbar-${tool}"]`)).toBeInViewport({
      ratio: 1,
    });
  }
  await expect(page.getByRole("status")).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Started on a company, the workflow's copy shows the picture as well, under
  // an address of its own.
  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Board Works", exact: true }).click();
  await companyTabs(page).getByRole("link", { name: "Workflows" }).click();
  await panel(page).getByRole("button", { name: "Start a workflow" }).click();
  await page.getByRole("menuitem", { name: "Moodboard" }).click();
  await board(page, "Moodboard").getByRole("link", { name: "Moodboard" }).click();
  await expect(whiteboard(page)).toBeVisible();
  const copyApi = new URL(page.url()).pathname.replace("/workflows/", "/api/workflows/");
  expect(copyApi).not.toBe(api);
  const copied = middle((await whiteboard(page).boundingBox())!);
  await expect.poll(() => blue(copied.x, copied.y)).toBe(true);
  expect(await pictures(copyApi)).toEqual([key]);
  expect(
    (await (await page.request.get(`${copyApi}/pictures/${key}`)).body()).equals(stored),
  ).toBe(true);

  // The company's board goes, then the workflow; the picture went with them.
  for (const back of [new RegExp(`company=${ID}&tab=workflows$`), /\/workflows$/]) {
    await page.getByRole("button", { name: "Workflow actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete workflow" }).click();
    await expect(page).toHaveURL(back);
    if (back.source.includes("company")) {
      expect((await page.request.get(`${copyApi}/pictures/${key}`)).status()).toBe(404);
      expect((await page.request.get(address)).status()).toBe(200);
      await page.goto("/workflows");
      await main(page).getByRole("link", { name: "Moodboard" }).click();
      await expect(whiteboard(page)).toBeVisible();
    }
  }
  expect((await page.request.get(address)).status()).toBe(404);
  await expect(row(page, "Moodboard")).toHaveCount(0);

  expect(seen.outside).toEqual([]);
  // The one error is the browser's own note that the drawing was turned away.
  expect(seen.errors.filter((error) => !error.includes("415"))).toEqual([]);
});

test("an address that names no workflow of the owner's shows a not-found page", async ({
  page,
}) => {
  for (const id of ["0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11", "not-an-id"]) {
    await page.goto(`/workflows/${id}`);
    await expect(heading(page, "Not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Workflows" })).toBeVisible();
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("workflows are reached through Go to, and the whiteboard fits the screen", async ({
    page,
  }) => {
    await page.goto("/");
    const bottomBar = page.getByRole("navigation", { name: "Main" }).last();
    // The bar keeps its four destinations.
    await expect(bottomBar.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(bottomBar.getByRole("link", { name: "Workflows" })).toHaveCount(0);
    await bottomBar.getByRole("button", { name: "Go to" }).click();
    await page.getByRole("option", { name: "Workflows" }).click();
    await expect(page).toHaveURL(/\/workflows$/);

    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    await expect(row(page, "Prospecting")).toBeVisible();
    expect(await fits()).toBe(true);

    await main(page).getByRole("link", { name: "Prospecting" }).click();
    await expect(heading(page, "Prospecting")).toBeVisible();
    await expect(whiteboard(page)).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(await fits()).toBe(true);

    // A record's Workflows tab fits the panel. The view eases in from the right
    // and is wider than the panel while it does, so the width is asked for until it holds.
    await page.goto("/people/contacts");
    await page.getByRole("link", { name: "Bea Boarder", exact: true }).click();
    await contactTabs(page).getByRole("link", { name: "Workflows" }).click();
    await expect(board(page, "Custom plan")).toContainText("0 of 1 done");
    await expect
      .poll(() =>
        page
          .locator('[data-slot="sheet-content"]')
          .evaluate((sheet) => sheet.scrollWidth <= sheet.clientWidth),
      )
      .toBe(true);
  });
});
