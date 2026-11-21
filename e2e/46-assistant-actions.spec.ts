import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The key e2e/fake-model/server.mjs accepts. "Add a task: <title>" makes it call addTask.
const KEY = "sk-or-v1-e2e-good-key-0123456789";
const TASK = "Ask Maple Studio for the logo files";

const panel = (page: Page) => page.getByRole("dialog", { name: "Assistant" });

test("the assistant is set up with a key", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByLabel("OpenRouter key").fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Configured · key ending …6789")).toBeVisible();
});

test("asked to, the assistant asks for the task's details on a card, adds it on Save, and can undo it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const box = panel(page).getByRole("textbox", { name: "Message the assistant" });
  await box.fill(`Add a task: ${TASK}`);
  await box.press("Enter");

  // Nothing is added until the card's questions are answered or skipped.
  const asking = panel(page).getByRole("region", { name: "New task" });
  // Two model calls and the task's checks come first.
  await expect(asking).toContainText(`Task "${TASK}".`, { timeout: 20_000 });
  await expect(
    panel(page).getByText(`The task: waiting, Task "${TASK}".`, { exact: true }),
  ).toBeVisible();
  await expect(asking.getByText("1 of 5")).toBeVisible();

  await asking.getByLabel("Deadline date").fill("2030-03-04");
  await asking.getByRole("button", { name: "Next" }).click();
  await expect(asking.getByLabel("Priority")).toBeVisible();
  await asking.getByRole("button", { name: "Skip this step" }).click();
  await expect(asking.getByLabel("Reminder")).toBeVisible();
  await asking.getByRole("button", { name: "Skip all" }).click();

  const card = panel(page).getByRole("region", { name: "Task added" });
  await expect(card).toContainText(`Task "${TASK}", due Mon, 4 Mar 2030.`);

  await card.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: TASK })).toBeVisible();

  // Kept with the chat: after a reload the card still offers Undo.
  await page.goto("/assistant");
  await page.getByRole("link", { name: `Add a task: ${TASK}` }).click();
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
  await page.reload();
  const kept = page.getByRole("region", { name: "Task added" });
  await kept.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Task removed" })).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByText(TASK)).toHaveCount(0);
});

test("the key is removed again", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByLabel("OpenRouter key")).toBeVisible();
});
