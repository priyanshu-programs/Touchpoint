import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
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

test("a bar across the top shows while a page or an action is on its way", async ({
  page,
}) => {
  const bar = page.getByRole("progressbar", { name: "Loading" });
  // The requests picked out here are held back, as a slow connection would hold them.
  let held: (headers: Record<string, string>, url: string) => boolean = () =>
    false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (held(request.headers(), request.url())) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  await page.goto("/people/organizations");
  await expect(page.getByRole("cell", { name: "acme.test" })).toBeVisible();
  await expect(bar).toHaveCount(0);

  held = (_headers, url) => url.includes("company=");
  await page.getByRole("cell", { name: "acme.test" }).click();
  await expect(bar).toHaveCSS("opacity", "1");
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(bar).toHaveCount(0);

  // A change made in place is not a navigation, and shows the bar all the same.
  const badge = (value: string) =>
    panel(page).getByRole("button", { name: `Status: ${value}`, exact: true });
  held = (headers) => "next-action" in headers;
  await badge("Prospect").click();
  await page.getByRole("menuitemradio", { name: "Client", exact: true }).click();
  await expect(bar).toHaveCSS("opacity", "1");
  await expect(badge("Client")).toBeVisible();
  await expect(bar).toHaveCount(0);

  // Back as it was, for the files that follow.
  held = () => false;
  await badge("Client").click();
  await page.getByRole("menuitemradio", { name: "Prospect", exact: true }).click();
  await expect(badge("Prospect")).toBeVisible();
});

// The search itself goes to an outside service, so its answer is staged here as the
// app would have stored it; the search and what it keeps are covered in the unit tests.
// Arjun Rao has a GitHub link from the company contacts tests.
test("profiles found by name are offered on a person, added on request and dismissed", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const {
    rows: [arjun],
  } = await pool.query(
    "select id, owner_id from contacts where full_name = 'Arjun Rao'",
  );
  await pool.query(
    `insert into profile_searches (owner_id, contact_id, status, results)
     values ($1, $2, 'done', $3)`,
    [
      arjun.owner_id,
      arjun.id,
      JSON.stringify([
        {
          kind: "linkedin",
          url: "https://www.linkedin.com/in/arjun-rao",
          title: "Arjun Rao - Head of Security - Acme Design",
        },
        {
          kind: "linkedin",
          url: "https://www.linkedin.com/in/arjun-rao-2",
          title: "Arjun Rao - Chef",
        },
        { kind: "github", url: "https://github.com/arjun-rao", title: null },
        { kind: "x", url: "https://x.com/arjun_rao", title: "Arjun Rao (@arjun_rao)" },
      ]),
    ],
  );
  await pool.end();

  await page.goto(`/people/contacts?contact=${arjun.id}`);
  const found = panel(page).getByRole("region", { name: "Profile links" });
  await expect(found.getByRole("button", { name: "Find profile links" })).toBeVisible();
  await expect(found).toContainText("Arjun Rao - Head of Security - Acme Design");
  await expect(found).toContainText("Arjun Rao - Chef");
  // He has a GitHub link already, so none is offered.
  await expect(found.getByRole("link")).toHaveCount(3);
  await expect(found.getByText("github.com")).toHaveCount(0);

  await found
    .getByRole("button", { name: "Add https://www.linkedin.com/in/arjun-rao", exact: true })
    .click();
  await expect(
    panel(page)
      .getByRole("region", { name: "Details" })
      .getByRole("link", { name: "linkedin.com/in/arjun-rao" }),
  ).toHaveAttribute("href", "https://www.linkedin.com/in/arjun-rao");
  // The namesake went with it; X is still on offer.
  await expect(found.getByRole("link")).toHaveCount(1);
  await expect(found.getByRole("link", { name: "x.com/arjun_rao" })).toBeVisible();

  await found.getByRole("button", { name: "Dismiss" }).click();
  await expect(found.getByRole("link")).toHaveCount(0);
  await expect(found.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  await expect(found.getByRole("button", { name: "Find profile links" })).toBeVisible();
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
