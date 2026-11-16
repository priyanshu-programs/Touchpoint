import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The key e2e/fake-model/server.mjs accepts. The suite never reaches the real OpenRouter.
const KEY = "sk-or-v1-e2e-good-key-0123456789";
const TASK = "Call Harbor Bakery about the deposit";

const panel = (page: Page) => page.getByRole("dialog", { name: "Assistant" });

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query(
    `insert into tasks (owner_id, title, due_on) select id, $1, '2020-01-06' from "user" limit 1`,
    [TASK],
  );
  await pool.end();
});

test("the assistant is set up with a key", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByLabel("OpenRouter key").fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Configured · key ending …6789")).toBeVisible();
});

test("a one-tap question answers from the records with no model, and its link opens the task", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  await panel(page).getByRole("button", { name: "What's overdue or due today?" }).click();
  await expect(panel(page).getByText(new RegExp(`${TASK}, overdue since`))).toBeVisible();

  const records = panel(page).getByRole("navigation", { name: "Records used" });
  await records.getByRole("link", { name: TASK }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: TASK })).toBeVisible();
});

test("money this month is told from the Money page's sums", async ({ page }) => {
  await page.goto("/assistant/new");
  await page.getByRole("button", { name: "How's money this month?" }).click();
  await expect(page.getByText(/This month you've received /)).toBeVisible();
  await expect(page.getByRole("link", { name: "Money", exact: true }).last()).toHaveAttribute(
    "href",
    "/money?period=this-month",
  );
});

test("a question about tasks makes the model look them up, and links what it names", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const box = panel(page).getByRole("textbox", { name: "Message the assistant" });
  await box.fill("Which tasks are overdue?");
  await box.press("Enter");
  await expect(panel(page).getByRole("log", { name: "Chat" }).getByText(`Your tasks: ${TASK}`)).toBeVisible();
  await expect(
    panel(page).getByRole("navigation", { name: "Records used" }).getByRole("link", { name: TASK }),
  ).toBeVisible();

  // Kept with the chat: the history shows the same link after a reload.
  await panel(page).getByRole("link", { name: "History" }).click();
  await page.getByRole("link", { name: "Which tasks are overdue?" }).click();
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Records used" }).getByRole("link", { name: TASK }),
  ).toBeVisible();
});

test("a reply's Markdown shows as formatting, and HTML in it stays text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const box = panel(page).getByRole("textbox", { name: "Message the assistant" });
  await box.fill("the **snapshot**\n\n- **Money in:** 0 received\n- <b>Owed</b> nothing\n1. first");
  await box.press("Enter");

  const reply = panel(page).getByRole("log", { name: "Chat" }).locator('[data-role="assistant"] [data-slot="message-content"]').last();
  await expect(reply.locator("strong", { hasText: "snapshot" })).toBeVisible();
  await expect(reply.locator("ul > li")).toHaveCount(2);
  await expect(reply.locator("ul > li").first().locator("strong")).toHaveText("Money in:");
  await expect(reply.locator("ol > li")).toHaveText("first");
  await expect(reply.getByText("<b>Owed</b> nothing")).toBeVisible();
  await expect(reply).not.toContainText("**");
});

test("the key is removed again", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByLabel("OpenRouter key")).toBeVisible();
});
