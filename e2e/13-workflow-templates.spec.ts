import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The sidebar has a "Workflows" link too, so the page's own are looked for in its content.
const main = (page: Page) => page.getByRole("main");
const stages = (page: Page) => main(page).getByRole("listitem");
const row = (page: Page, name: string) =>
  main(page).getByRole("row", { name: new RegExp(name) });
// A stage's name opens it; its menu and its handle carry the name too.
const openStage = (page: Page, name: string) =>
  main(page).getByRole("button", { name, exact: true }).click();

// Every change to a workflow is saved by a server action of its own.
const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  );

test("a starter workflow is added in one click and is then the owner's own", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

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

  // Listed with its steps in order and the ways it can end, and no longer offered.
  await expect(row(page, "Prospecting")).toContainText(
    "Identified → Contacted → In conversation → Proposal sent → Won or Lost",
  );
  await expect(add("Prospecting")).toHaveCount(0);
  await expect(add("Website Project")).toBeVisible();

  await main(page).getByRole("link", { name: "Prospecting" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(main(page).getByRole("heading", { name: "Prospecting" })).toBeVisible();
  await expect(stages(page)).toHaveCount(6);
  await expect(stages(page).first()).toHaveText(
    "IdentifiedThen Contacted or Lost · 1 to tick · 1 task · 7 days at most",
  );
  await expect(stages(page).nth(3)).toContainText("Then Won or Lost");
  await expect(stages(page).nth(4)).toHaveText("WonEnds the workflow: won · 1 task");
  await expect(stages(page).last()).toHaveText("LostEnds the workflow: lost");

  // A stage opens with what the starter gave it.
  await openStage(page, "Identified");
  const edit = page.getByRole("dialog", { name: "Edit stage" });
  await expect(edit.getByLabel("Name")).toHaveValue("Identified");
  await expect(edit.getByLabel("Deadline in days")).toHaveValue("7");
  await expect(edit.getByLabel("Checklist item 1", { exact: true })).toHaveValue(
    "Right person found",
  );
  await expect(edit.getByLabel("Checklist item 1 is required")).toBeChecked();
  await expect(edit.getByLabel("Task 1", { exact: true })).toHaveValue(
    "Research and find the right person",
  );
  await page.keyboard.press("Escape");
  await expect(edit).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test("a workflow is built by hand: stages added, edited, put in order and deleted", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

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
  await page.getByLabel("Name").fill("Onboarding");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(main(page).getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(main(page).getByText("No stages yet.")).toBeVisible();

  const newStage = page.getByRole("dialog", { name: "New stage" });
  const openNew = () =>
    main(page).getByRole("button", { name: "Add stage" }).click();

  // A stage with a deadline, a required checklist item and a task.
  await openNew();
  await newStage.getByLabel("Name").fill("Welcome");
  await newStage.getByLabel("Deadline in days").fill("5");
  await newStage.getByRole("button", { name: "Add item" }).click();
  await newStage.getByLabel("Checklist item 1", { exact: true }).fill("Call booked");
  await newStage.getByLabel("Checklist item 1 is required").check();
  // A row added and left empty is not saved.
  await newStage.getByRole("button", { name: "Add item" }).click();
  await newStage.getByRole("button", { name: "Add task" }).click();
  await newStage.getByLabel("Task 1", { exact: true }).fill("Send the welcome note");
  await newStage.getByLabel("Task 1 is due after days").fill("1");
  await newStage.getByLabel("Priority of task 1").selectOption("High");
  await newStage.getByRole("button", { name: "Add stage" }).click();
  await expect(newStage).toBeHidden();
  await expect(stages(page)).toHaveText([
    "WelcomeLeads nowhere yet · 1 to tick · 1 task · 5 days at most",
  ]);

  await openNew();
  await newStage.getByLabel("Name").fill("Set up");
  await newStage.getByRole("button", { name: "Add stage" }).click();
  await expect(newStage).toBeHidden();

  // A stage that ends the workflow has no deadline and no checklist.
  await openNew();
  await newStage.getByLabel("Name").fill("Live");
  await newStage.getByLabel("Kind").selectOption("Ends the workflow: done");
  await expect(newStage.getByLabel("Deadline in days")).toHaveCount(0);
  await expect(newStage.getByRole("button", { name: "Add item" })).toHaveCount(0);
  await newStage.getByRole("button", { name: "Add stage" }).click();
  await expect(newStage).toBeHidden();
  await expect(stages(page)).toHaveText([
    "WelcomeThen Set up · 1 to tick · 1 task · 5 days at most",
    "Set upThen Live",
    "LiveEnds the workflow: done",
  ]);

  // A name the workflow already has is refused and stays on the form.
  await openNew();
  await newStage.getByLabel("Name").fill("welcome");
  await newStage.getByRole("button", { name: "Add stage" }).click();
  await expect(newStage.getByRole("alert")).toHaveText(
    "This workflow already has a stage called welcome.",
  );
  await expect(newStage.getByLabel("Name")).toHaveValue("welcome");
  await page.keyboard.press("Escape");
  await expect(newStage).toBeHidden();
  await expect(stages(page)).toHaveCount(3);

  // Opened from its name, renamed, with what it held kept.
  await openStage(page, "Welcome");
  const edit = page.getByRole("dialog", { name: "Edit stage" });
  await expect(edit.getByLabel("Checklist item 1", { exact: true })).toHaveValue(
    "Call booked",
  );
  await expect(edit.getByLabel("Checklist item 2", { exact: true })).toHaveCount(0);
  await expect(edit.getByLabel("Task 1 is due after days")).toHaveValue("1");
  await expect(edit.getByLabel("Priority of task 1")).toHaveValue("high");
  await edit.getByLabel("Name").fill("Welcome call");
  await edit.getByRole("button", { name: "Save stage" }).click();
  await expect(edit).toBeHidden();
  await expect(stages(page).first()).toContainText("Welcome call");

  // With the keyboard: from its handle, Set up goes above Welcome call and keeps the focus.
  const setUp = main(page).getByRole("button", { name: "Move Set up" });
  await setUp.focus();
  let save = saved(page);
  await page.keyboard.press("ArrowUp");
  await save;
  await expect(main(page).getByText("Set up moved to place 1 of 3.")).toBeAttached();
  await expect(stages(page)).toHaveText([
    "Set upThen Welcome call",
    "Welcome callThen Live · 1 to tick · 1 task · 5 days at most",
    "LiveEnds the workflow: done",
  ]);
  await expect(setUp).toBeFocused();

  // With the mouse: Welcome call is dragged back to the top.
  const from = (await main(page)
    .getByRole("button", { name: "Move Welcome call" })
    .boundingBox())!;
  const to = (await setUp.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  save = saved(page);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, {
    steps: 8,
  });
  await page.mouse.up();
  await save;
  await expect(stages(page)).toHaveText([
    "Welcome callThen Set up · 1 to tick · 1 task · 5 days at most",
    "Set upThen Live",
    "LiveEnds the workflow: done",
  ]);
  await page.reload();
  await expect(stages(page).first()).toContainText("Welcome call");

  // Deleted only after confirming; the stage before it then leads to the one after.
  const remove = async () => {
    await main(page).getByRole("button", { name: "Actions for Set up" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
  };
  const confirmStage = page.getByRole("alertdialog", { name: "Delete Set up?" });
  await remove();
  await confirmStage.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmStage).toBeHidden();
  await expect(stages(page)).toHaveCount(3);
  await remove();
  await confirmStage.getByRole("button", { name: "Delete stage" }).click();
  await expect(confirmStage).toBeHidden();
  await expect(stages(page)).toHaveText([
    "Welcome callThen Live · 1 to tick · 1 task · 5 days at most",
    "LiveEnds the workflow: done",
  ]);

  // Renamed, and listed under its new name with its description and stages.
  await main(page).getByLabel("Name").fill("Client onboarding");
  await main(page).getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(
    main(page).getByRole("heading", { name: "Client onboarding" }),
  ).toBeVisible();
  await main(page).getByRole("link", { name: "Workflows" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Client onboarding")).toContainText(
    "First month with a new client",
  );
  await expect(row(page, "Client onboarding")).toContainText("Welcome call → Live");

  // The workflow goes only after confirming; the starter added earlier stays.
  await main(page).getByRole("link", { name: "Client onboarding" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete Client onboarding?",
  });
  await main(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await main(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete workflow" }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(row(page, "Client onboarding")).toHaveCount(0);
  await expect(row(page, "Prospecting")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("an address that names no workflow of the owner's shows the not-found page", async ({
  page,
}) => {
  for (const id of ["0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11", "not-an-id"]) {
    await page.goto(`/workflows/${id}`);
    await expect(
      main(page).getByRole("heading", { name: "Not found" }),
    ).toBeVisible();
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("workflows are reached through Go to, and the editor fits the screen", async ({
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
    await expect(stages(page)).toHaveCount(6);
    await expect(
      main(page).getByRole("button", { name: "Move Identified" }),
    ).toBeInViewport();
    expect(await fits()).toBe(true);

    await openStage(page, "In conversation");
    const edit = page.getByRole("dialog", { name: "Edit stage" });
    await expect(edit.getByLabel("Checklist item 3", { exact: true })).toHaveValue(
      "Decision maker known",
    );
    await expect
      .poll(() => edit.evaluate((node) => node.scrollWidth <= node.clientWidth))
      .toBe(true);
    await edit.getByRole("button", { name: "Save stage" }).scrollIntoViewIfNeeded();
    await expect(edit.getByRole("button", { name: "Save stage" })).toBeInViewport();
    expect(await fits()).toBe(true);
  });
});
