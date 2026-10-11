import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const SHEET = '[data-slot="sheet-content"]';

// Records where the panel is on each of its first frames, to tell a slide from a pop.
async function watchPanelArrive(page: Page) {
  await page.evaluate((selector) => {
    const seen: number[] = [];
    Object.assign(window, { panelLefts: seen });
    const observer = new MutationObserver(() => {
      const sheet = document.querySelector(selector);
      if (!sheet) return;
      observer.disconnect();
      let frames = 0;
      const sample = () => {
        seen.push(sheet.getBoundingClientRect().left);
        if (++frames < 12) requestAnimationFrame(sample);
      };
      sample();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, SHEET);
}

test("a company row opens from any cell, and the panel slides in and out", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations?sort=contacts&dir=desc");
  await watchPanelArrive(page);
  // The domain cell, not the name link.
  await page.getByRole("cell", { name: "acme.test" }).click();
  await expect(page).toHaveURL(/sort=contacts&dir=desc&company=[0-9a-f-]+$/);
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();

  // Settled against the right edge, having started well to the right of there.
  const sheet = page.locator(SHEET);
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return box && Math.round(box.x + box.width);
    })
    .toBe(page.viewportSize()!.width);
  const settled = (await sheet.boundingBox())!.x;
  const lefts = await page.evaluate(
    () => (window as unknown as { panelLefts: number[] }).panelLefts,
  );
  expect(Math.max(...lefts)).toBeGreaterThan(settled + 100);

  // Closing slides it away and returns to the list as it was sorted.
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/organizations\?sort=contacts&dir=desc$/);
  await expect(panel(page)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("a person row opens the same panel over the people list", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/contacts?q=arj");
  await page
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("cell", { name: "Prospect" })
    .click();
  await expect(page).toHaveURL(/contacts\?q=arj&contact=[0-9a-f-]+$/);
  await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  await expect(
    panel(page).getByRole("region", { name: "Details" }),
  ).toContainText("Head of Security");
  // Opened from the list, so there is no company to go back to.
  await expect(panel(page).getByRole("link", { name: /^Back to/ })).toHaveCount(0);

  // The company's name in a row leads to the company, not to the person.
  const id = new URL(page.url()).searchParams.get("contact");
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/contacts\?q=arj$/);
  await page
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("link", { name: "Acme Design" })
    .click();
  await expect(page).toHaveURL(/organizations\?company=[0-9a-f-]+$/);

  // An address from before people opened in a panel still finds them.
  await page.goto(`/people/contacts/${id}`);
  await expect(page).toHaveURL(new RegExp(`contacts\\?contact=${id}$`));
  await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test.describe("in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("dropdown lists take the app's theme", async ({ page }) => {
    await page.goto("/people/contacts/new");
    const select = page.getByLabel("Relationship");
    const styles = await select.evaluate((element) => ({
      scheme: getComputedStyle(document.documentElement).colorScheme,
      appearance: getComputedStyle(element).appearance,
    }));

    // The browser's own controls are told the theme, and this browser lets the list be styled.
    expect(styles).toEqual({ scheme: "dark", appearance: "base-select" });
    await select.selectOption("client");
    await expect(select).toHaveValue("client");
  });
});
