import { expect, test, type Page } from "@playwright/test";
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
