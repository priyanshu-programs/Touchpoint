import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The key e2e/fake-model/server.mjs accepts. The suite never reaches the real OpenRouter.
const KEY = "sk-or-v1-e2e-good-key-0123456789";

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

const panel = (page: Page) => page.getByRole("dialog", { name: "Assistant" });

async function ask(page: Page, words: string) {
  await panel(page).getByRole("textbox", { name: "Message the assistant" }).fill(words);
  await panel(page).getByRole("textbox", { name: "Message the assistant" }).press("Enter");
}

test("the panel says how to set the assistant up, and Settings refuses a wrong key", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  await expect(panel(page)).toContainText("Not set up yet.");
  await panel(page).getByRole("link", { name: "Set up the assistant" }).click();
  await expect(page).toHaveURL(/\/settings\/assistant$/);
  await expect(page.getByText("What a free model may do with what you type")).toBeVisible();

  await page.getByLabel("OpenRouter key").fill("sk-ant-not-openrouter-0123456789");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(
    page.getByText("That isn't an OpenRouter key. It starts with sk-or- and has no spaces."),
  ).toBeVisible();

  await page.getByLabel("OpenRouter key").fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Configured · key ending …6789")).toBeVisible();
  await expect(page.getByText(KEY)).toHaveCount(0);

  await page.getByRole("button", { name: "Test key" }).click();
  await expect(page.getByText(/OpenRouter accepts this key\. \d+ of 50 free requests left today\./)).toBeVisible();

  await page.getByLabel("Main model").fill("openai/gpt-5");
  await page.getByRole("button", { name: "Save models" }).click();
  await expect(
    page.getByText("Enter a free model's id from OpenRouter, like google/gemma-4-31b-it:free."),
  ).toBeVisible();
});

test("a question in the panel is answered and kept in the history", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Assistant" }).click();
  await ask(page, "Plan my week with Maple Studio");
  await expect(panel(page).getByRole("log", { name: "Chat" }).getByText("Noted: Plan my week with Maple Studio")).toBeVisible();
  await expect(panel(page).getByText(/\d+ of 50 free requests left today/)).toBeVisible();

  // Closing and opening again keeps the chat.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Assistant" }).click();
  await expect(panel(page).getByRole("log", { name: "Chat" }).getByText("Noted: Plan my week with Maple Studio")).toBeVisible();

  await panel(page).getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.getByRole("link", { name: "Plan my week with Maple Studio" }).click();
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
  await page.reload();
  const log = page.getByRole("log", { name: "Chat" });
  await expect(log.getByText("You: Plan my week with Maple Studio")).toBeVisible();
  await expect(log.getByText("Noted: Plan my week with Maple Studio")).toBeVisible();

  await page.getByRole("textbox", { name: "Message the assistant" }).fill("And next week?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText("Noted: And next week?")).toBeVisible();
});

test("a failed reply says so in the app's words", async ({ page }) => {
  await page.goto("/assistant/new");
  await page.getByRole("textbox", { name: "Message the assistant" }).fill("Are you busy?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(
      "The free models are busy, or you've sent a lot in the last minute. Wait a minute and try again.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Upstream fake detail")).toHaveCount(0);
  // The question is kept, and the chat took its own address.
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
});

test("the panel and history fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  await ask(page, "Hello from a phone");
  await expect(panel(page).getByRole("log", { name: "Chat" }).getByText("Noted: Hello from a phone")).toBeVisible();
  expect(await fits(page)).toBe(true);

  await page.goto("/assistant");
  await expect(page.getByRole("link", { name: "Hello from a phone" })).toBeVisible();
  expect(await fits(page)).toBe(true);
});

test("a chat is deleted, and removing the key turns the assistant off", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Delete chat Hello from a phone" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete chat" }).click();
  await expect(page.getByRole("link", { name: "Hello from a phone" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Plan my week with Maple Studio" })).toBeVisible();

  await page.goto("/settings/assistant");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByLabel("OpenRouter key")).toBeVisible();

  await page.getByRole("button", { name: "Assistant" }).click();
  await expect(panel(page)).toContainText("Not set up yet.");

  await page.goto("/settings/audit");
  await expect(page.getByText("assistant.key_remove").first()).toBeVisible();
});
