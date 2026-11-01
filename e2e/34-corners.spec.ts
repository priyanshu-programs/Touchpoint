import { expect, test } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.use({ storageState: OWNER_SESSION });

const CORNER = "6px";

test("cards, list tables and dialogs have 6px corners, and round things stay round", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="card"]').first()).toHaveCSS("border-radius", CORNER);

  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await expect(dialog).toHaveCSS("border-radius", CORNER);
  await dialog.getByLabel("Name").fill("Corner check");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(/\/brainstorm\/[0-9a-f-]{36}$/);

  await page.goto("/brainstorm");
  const list = page
    .getByRole("main")
    .locator("table")
    .first()
    .locator("xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]");
  await expect(list).toHaveCSS("border-radius", CORNER);

  // A class that asks for a full circle is left alone by the scale.
  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "round-probe";
    probe.className = "rounded-full size-4";
    document.body.append(probe);
  });
  await expect(page.locator("#round-probe")).not.toHaveCSS("border-radius", CORNER);
});
