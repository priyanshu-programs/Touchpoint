import { expect, test } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const KEY = "sk-or-v1-e2e-good-key-0123456789";
const MODEL = "mistralai/mistral-small-3.2-24b-instruct";

test("a model for the calendar is saved, kept, refused when it isn't an id, and cleared", async ({ page }) => {
  await page.goto("/settings/assistant");
  await page.getByLabel("OpenRouter key").fill(KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Configured · key ending …6789")).toBeVisible();

  const box = page.getByRole("textbox", { name: "Model for your calendar" });
  await box.fill(MODEL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(box).toHaveValue(MODEL);

  await box.fill("not a model");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Enter a model's id from OpenRouter, like mistralai/mistral-small-3.2-24b-instruct.",
  );

  await box.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved. Your main model will be tried.");
  await page.reload();
  await expect(box).toHaveValue("");
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
