import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// The key e2e/fake-model/server.mjs accepts. "Remember: <fact>" makes it call saveMemory,
// and "What do you remember?" answers with the memories the app sent it.
const KEY = "sk-or-v1-e2e-good-key-0123456789";
const FACT = "I don't take calls on Fridays";

const panel = (page: Page) => page.getByRole("dialog", { name: "Assistant" });

async function ask(page: Page, message: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const box = panel(page).getByRole("textbox", { name: "Message the assistant" });
  await box.fill(message);
  await box.press("Enter");
}

test("the assistant is set up with a key", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByLabel("OpenRouter key").fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Configured · key ending …6789")).toBeVisible();
});

test("told something lasting, the assistant remembers it with Undo, uses it in a new chat, and forgets it on Undo", async ({
  page,
}) => {
  await ask(page, `Remember: ${FACT}`);
  const card = panel(page).getByRole("region", { name: "Remembered" });
  await expect(card).toContainText(`About you: ${FACT}`, { timeout: 20_000 });

  await card.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/settings\/memory$/);
  const yours = page.getByRole("region", { name: "About you" });
  await expect(yours.getByText(FACT, { exact: true })).toBeVisible();
  await expect(yours.getByText("Saved by the assistant")).toBeVisible();

  await ask(page, "What do you remember?");
  // The model is given the memory as a "- About …" line, which the panel draws as a bullet.
  await expect(panel(page).getByRole("listitem").getByText(new RegExp(`^About [^:]+: ${FACT}$`))).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/assistant");
  await page.getByRole("link", { name: `Remember: ${FACT}` }).click();
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
  await page.getByRole("region", { name: "Remembered" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Forgotten" })).toBeVisible();

  await page.goto("/settings/memory");
  await expect(page.getByText("Nothing about you yet.")).toBeVisible();
});

test("on the Memory page, a memory is added, refused for an unknown company, found, edited and deleted", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  await page.getByLabel("About", { exact: true }).selectOption("company");
  await page.getByLabel("Company's name").fill("Nowhere Holdings");
  await page.getByLabel("Remember", { exact: true }).fill("Pays on the 1st");
  await page.getByRole("button", { name: "Add memory" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText('No company called "Nowhere Holdings" is in Touchpoint.');

  await page.getByLabel("About", { exact: true }).selectOption("you");
  await page.getByLabel("Remember", { exact: true }).fill("Prefers calls in the morning");
  await page.getByRole("button", { name: "Add memory" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Remembered.");
  const yours = page.getByRole("region", { name: "About you" });
  await expect(yours.getByText("Prefers calls in the morning")).toBeVisible();
  await expect(yours.getByText("Added by you")).toBeVisible();

  await page.getByLabel("About", { exact: true }).selectOption("you");
  await page.getByLabel("Remember", { exact: true }).fill("prefers calls in the morning");
  await page.getByRole("button", { name: "Add memory" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That is remembered already.");

  await page.getByRole("searchbox", { name: "Search memories" }).fill("morning");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=morning/);
  await expect(yours.getByText("Prefers calls in the morning")).toBeVisible();

  await expect(page.getByText("No memories match")).toHaveCount(0);

  // From the whole list, which still holds it after a reload; a search for "morning" would
  // drop it once edited.
  await page.goto("/settings/memory");
  await page.reload();
  await yours.getByRole("button", { name: "Edit memory: Prefers calls in the morning" }).click();
  await yours.getByLabel("Memory", { exact: true }).fill("Prefers calls before noon");
  await yours.getByRole("button", { name: "Save" }).click();
  await expect(yours.getByText("Prefers calls before noon")).toBeVisible();

  await yours.getByRole("button", { name: "Delete memory: Prefers calls before noon" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete memory" }).click();
  // Gone from the page before leaving it, or the leaving would cut the delete off.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("Nothing about you yet.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Nothing about you yet.")).toBeVisible();
});

test("the key is removed again", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove key" }).click();
  // By its box: the dialog's title ("Remove your OpenRouter key?") matches the label too.
  await expect(page.getByRole("textbox", { name: "OpenRouter key" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "OpenRouter key" })).toBeVisible();
});
