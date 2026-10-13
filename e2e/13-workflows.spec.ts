import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The sidebar has a "Workflows" link too, so the page's own are looked for in its content.
const main = (page: Page) => page.getByRole("main");
const row = (page: Page, name: string) =>
  main(page).getByRole("row", { name: new RegExp(name) });
const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const card = (page: Page) => page.getByRole("region", { name: "Selected box" });
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
  await add("Prospecting").click();

  // Listed with its stages in the order its arrows give, and no longer offered.
  await expect(row(page, "Prospecting")).toContainText(
    "Identified → Contacted → In conversation → Proposal sent → Won → Lost",
  );
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

  const save = saved(page);
  await card(page).getByRole("button", { name: "Make this a stage" }).click();
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();
  expect((await save).status()).toBe(200);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // It is all still there after a reload: the box, in the middle of the
  // whiteboard now, is a stage.
  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  const box = await whiteboard(page).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(card(page).getByRole("button", { name: "Not a stage" })).toBeVisible();

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
  await expect(row(page, "Onboarding")).toContainText("Welcome call");

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
  await expect(row(page, "Onboarding")).toContainText("Welcome call");

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
  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Elsewhere")).toContainText("No stages yet");
  await main(page).getByRole("link", { name: "Elsewhere" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete workflow" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Elsewhere")).toHaveCount(0);
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
    await expect(row(page, "Prospecting")).toContainText("6 stages");
    expect(await fits()).toBe(true);

    await main(page).getByRole("link", { name: "Prospecting" }).click();
    await expect(heading(page, "Prospecting")).toBeVisible();
    await expect(whiteboard(page)).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
