import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION, recordAction } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const BLUE = "#1971c2";
const PLAIN = "#1e1e1e";

type Element = {
  id: string;
  type: string;
  text?: string;
  link?: string | null;
  strokeColor?: string;
  containerId?: string | null;
  isDeleted?: boolean;
};

const whiteboard = (page: Page) => page.locator(".excalidraw canvas.interactive");
const panel = (page: Page) => page.getByRole("dialog");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
test.afterAll(() => pool.end());

function boardIdOf(page: Page) {
  return /\/([0-9a-f-]{36})$/.exec(new URL(page.url()).pathname)![1];
}

async function storedBrainstorm(page: Page) {
  const answer = (await (
    await page.request.get(`/api/brainstorm/${boardIdOf(page)}/elements?since=0`)
  ).json()) as { elements: Element[] };
  return answer.elements.filter(({ isDeleted }) => !isDeleted);
}

async function newBrainstorm(page: Page, name: string) {
  await page.goto("/brainstorm");
  await page.getByRole("main").getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(/\/brainstorm\/[0-9a-f-]{36}$/);
  await expect(whiteboard(page)).toBeVisible();
}

async function writeText(page: Page, x: number, y: number, text: string) {
  await page.keyboard.press("t");
  await page.mouse.click(x, y);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

// What is stored for a text, once the save has reached the server.
const textStored = async (page: Page, text: string) =>
  (await storedBrainstorm(page)).find((element) => element.text === text);

const pasteText = (page: Page, text: string) =>
  page.evaluate((pasted) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", pasted);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true }));
  }, text);

test("an address written on a board is a blue link, and a sentence is not", async ({ page }) => {
  await newBrainstorm(page, "Links typed");

  await writeText(page, 500, 250, "https://maple.test/pricing");
  await expect
    .poll(() => textStored(page, "https://maple.test/pricing"), { timeout: 20_000 })
    .toMatchObject({ link: "https://maple.test/pricing", strokeColor: BLUE });

  await writeText(page, 500, 330, "see https://oak.test for pricing");
  await expect
    .poll(() => textStored(page, "see https://oak.test for pricing"), { timeout: 20_000 })
    .toMatchObject({ link: null, strokeColor: PLAIN });

  // A bare domain counts; a file's name does not.
  await writeText(page, 500, 410, "maple.com");
  await expect
    .poll(() => textStored(page, "maple.com"), { timeout: 20_000 })
    .toMatchObject({ link: "https://maple.com", strokeColor: BLUE });
  await writeText(page, 500, 490, "notes.md");
  await expect
    .poll(() => textStored(page, "notes.md"), { timeout: 20_000 })
    .toMatchObject({ link: null, strokeColor: PLAIN });

  // Selecting it offers the address, opening in a new tab.
  await page.keyboard.press("v");
  await page.mouse.click(520, 258);
  const popup = page.locator(".excalidraw-hyperlinkContainer-link");
  await expect(popup).toHaveAttribute("href", "https://maple.test/pricing");
  await expect(popup).toHaveAttribute("target", "_blank");
  await page.mouse.click(1000, 600);

  await page.reload();
  await expect(whiteboard(page)).toBeVisible();
  expect(await textStored(page, "https://maple.test/pricing")).toMatchObject({
    link: "https://maple.test/pricing",
    strokeColor: BLUE,
  });
});

test("an address pasted on a board is a blue link, line by line", async ({ page }) => {
  await newBrainstorm(page, "Links pasted");
  await page.mouse.move(500, 250);
  await pasteText(page, "https://birch.test\nnot an address");

  await expect
    .poll(() => textStored(page, "https://birch.test"), { timeout: 20_000 })
    .toMatchObject({ link: "https://birch.test", strokeColor: BLUE });
  await expect
    .poll(() => textStored(page, "not an address"), { timeout: 20_000 })
    .toMatchObject({ link: null, strokeColor: PLAIN });
});

test("in a sticky note the note holds the link and the words are blue", async ({ page }) => {
  await newBrainstorm(page, "Links on notes");
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page.keyboard.type("https://maple.test");
  await page.keyboard.press("Escape");

  await expect
    .poll(
      async () => {
        const elements = await storedBrainstorm(page);
        const text = elements.find(({ type }) => type === "text");
        const note = elements.find(({ id }) => id === text?.containerId);
        return { color: text?.strokeColor, onNote: note?.link, onText: text?.link };
      },
      { timeout: 20_000 },
    )
    .toEqual({ color: BLUE, onNote: "https://maple.test", onText: null });
});

test("undo takes the link off and keeps the words, and it stays off", async ({ page }) => {
  await newBrainstorm(page, "Links undone");
  await writeText(page, 500, 250, "https://maple.test");
  await expect
    .poll(() => textStored(page, "https://maple.test"), { timeout: 20_000 })
    .toMatchObject({ link: "https://maple.test", strokeColor: BLUE });

  await page.keyboard.press("Control+z");
  await expect
    .poll(() => textStored(page, "https://maple.test"), { timeout: 20_000 })
    .toMatchObject({ link: null, strokeColor: PLAIN });

  // Opened and closed with no change: what the owner took off is not put back.
  await page.keyboard.press("v");
  await page.mouse.dblclick(520, 258);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3_000);
  expect(await textStored(page, "https://maple.test")).toMatchObject({ link: null });
});

test("an address edited into words stops being a link", async ({ page }) => {
  await newBrainstorm(page, "Links edited");
  await writeText(page, 500, 250, "https://maple.test");
  await expect
    .poll(() => textStored(page, "https://maple.test"), { timeout: 20_000 })
    .toMatchObject({ link: "https://maple.test" });

  await page.keyboard.press("v");
  await page.mouse.dblclick(520, 258);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("plain words");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => textStored(page, "plain words"), { timeout: 20_000 })
    .toMatchObject({ link: null, strokeColor: PLAIN });
});

test("in a workflow's box the box holds the link and the words are blue", async ({ page }) => {
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Links on boxes");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]{36}$/);
  await expect(whiteboard(page)).toBeVisible();

  await page.keyboard.press("r");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(760, 420, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await page.keyboard.type("https://maple.test");
  await page.keyboard.press("Escape");

  const scene = async () =>
    (
      (await (
        await page.request.get(`/api/workflows/${boardIdOf(page)}/scene`)
      ).json()) as { elements: Element[] }
    ).elements;
  await expect
    .poll(
      async () => {
        const elements = await scene();
        return {
          box: elements.find(({ type }) => type === "rectangle")?.link,
          color: elements.find(({ type }) => type === "text")?.strokeColor,
        };
      },
      { timeout: 20_000 },
    )
    .toEqual({ box: "https://maple.test", color: BLUE });
});

test("addresses in typed notes are links; a website's text and a meeting's are not", async ({
  page,
}) => {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Linden Links");
  await page.getByLabel("Domain", { exact: true }).fill("linden-links.invalid");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Linden Links" })).toBeVisible();
  const companyId = new URL(page.url()).searchParams.get("company")!;

  // A company's description can come from its website, so it is never a link.
  await recordAction(page, "Edit");
  await page.getByLabel("Description").fill("Read more at https://linden.test");
  await page.getByRole("button", { name: /^Save/ }).click();
  const about = panel(page).getByRole("region", { name: "About" });
  await expect(about).toContainText("https://linden.test");
  await expect(about.getByRole("link", { name: "https://linden.test" })).toHaveCount(0);

  // An activity's notes and outcome.
  await page.goto(`/people/organizations?company=${companyId}&tab=activity`);
  await panel(page).getByRole("link", { name: "Log activity" }).click();
  await page.getByLabel("Type").selectOption("call");
  await page.getByLabel("Summary").fill("Pricing call");
  await page.getByLabel("Notes").fill("Prices at https://linden.test/pricing.\nCall back.");
  await page.getByLabel("Outcome").fill("Wants www.linden.test updated");
  await page.getByRole("button", { name: "Log activity" }).click();
  const notes = panel(page).getByRole("link", { name: "https://linden.test/pricing" });
  await expect(notes).toHaveAttribute("href", "https://linden.test/pricing");
  await expect(notes).toHaveAttribute("target", "_blank");
  await expect(notes).toHaveAttribute("rel", "noopener noreferrer");
  await expect(panel(page).getByRole("link", { name: "www.linden.test" })).toHaveAttribute(
    "href",
    "https://www.linden.test",
  );

  // A meeting's location came from Google, which anyone's invite can fill.
  const owner = `(select id from "user" limit 1)`;
  const {
    rows: [{ id: connectionId }],
  } = await pool.query(`
    insert into integration_connections
      (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
    select ${owner}, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now()
    returning id`);
  try {
    await pool.query(
      `insert into calendar_events
        (owner_id, connection_id, external_id, title, location, all_day,
         starts_at, ends_at, attendees, organization_id)
       select ${owner}, $1, 'e2e-links', 'Linden meeting', 'https://stranger.test/room', false,
         now() - interval '1 hour', now(), '[]'::jsonb, $2`,
      [connectionId, companyId],
    );
    await page.goto(`/people/organizations?company=${companyId}&tab=activity`);
    await expect(panel(page).getByRole("link", { name: "Linden meeting" })).toBeVisible();
    await expect(panel(page).getByText("https://stranger.test/room")).toBeVisible();
    await expect(
      panel(page).getByRole("link", { name: "https://stranger.test/room" }),
    ).toHaveCount(0);
  } finally {
    await pool.query(`delete from integration_connections where id = $1`, [connectionId]);
  }
});

test("a finished task's notes show their address as a link", async ({ page }) => {
  await page.goto("/tasks/new");
  await page.getByLabel("Task", { exact: true }).fill("Check the linden page");
  await page.getByLabel("Notes").fill("It is at https://linden.test/page");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page).toHaveURL(/\/tasks\/all$/);
  await page.getByRole("link", { name: "Check the linden page" }).click();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("link", { name: "https://linden.test/page" })).toHaveAttribute(
    "href",
    "https://linden.test/page",
  );
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("an address written in a note is a link there too", async ({ page }) => {
    await newBrainstorm(page, "Links on a phone");
    await page.getByRole("button", { name: "Sticky note", exact: true }).click();
    await page.keyboard.type("https://maple.test");
    await page.keyboard.press("Escape");
    await expect
      .poll(
        async () => {
          const elements = await storedBrainstorm(page);
          const text = elements.find(({ type }) => type === "text");
          return {
            color: text?.strokeColor,
            link: elements.find(({ id }) => id === text?.containerId)?.link,
          };
        },
        { timeout: 20_000 },
      )
      .toEqual({ color: BLUE, link: "https://maple.test" });
  });
});
