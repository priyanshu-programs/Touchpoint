import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
// Launch options of its own would put this spec in a browser of its own, run
// after 99-sign-out has ended the owner's session. So the microphone is a
// tone made in the page instead.
test.use({ storageState: OWNER_SESSION });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const out = audio.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      return out.stream;
    };
  });
});

const BOARD = /\/brainstorm\/([0-9a-f-]{36})$/;
const main = (page: Page) => page.getByRole("main");
let boardId: string;

async function record(page: Page, seconds: number) {
  await page.getByRole("button", { name: "Voice note", exact: true }).click();
  await expect(page.getByRole("button", { name: /Stop recording/ })).toBeVisible();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole("button", { name: /Stop recording/ }).click();
}

test("a voice note is recorded, named, played back and kept", async ({ page }) => {
  await page.goto("/brainstorm");
  await main(page).getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill("Voice ideas");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(BOARD);
  boardId = BOARD.exec(page.url())![1];
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const stored = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/api/brainstorm/${boardId}/voice-notes`),
  );
  await record(page, 2);
  expect((await stored).status()).toBe(204);

  // The card lands with its heading open for typing.
  const heading = page.getByLabel("Voice note heading");
  await expect(heading).toHaveValue("Voice note 1");
  await heading.fill("Pricing idea");
  await heading.press("Enter");
  await expect(page.locator(".voice-title")).toHaveText("Pricing idea");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Kept through a reload, and it plays.
  await page.reload();
  await expect(page.locator(".voice-title")).toHaveText("Pricing idea");
  const played = page.waitForResponse((response) =>
    /\/voice-notes\/[A-Za-z0-9_-]+$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Play Pricing idea" }).click();
  const answer = await played;
  expect([200, 206]).toContain(answer.status());
  expect(answer.headers()["content-type"]).toBe("audio/webm");

  // Renamed from its pencil.
  await page.getByRole("button", { name: "Rename Pricing idea" }).click();
  await page.getByLabel("Voice note heading").fill("Launch pricing");
  await page.getByLabel("Voice note heading").press("Enter");
  await expect(page.locator(".voice-title")).toHaveText("Launch pricing");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("every voice note on the board downloads as one zip", async ({ page }) => {
  await page.goto(`/brainstorm/${boardId}`);
  await expect(page.locator(".voice-title")).toHaveText("Launch pricing");

  await page.getByRole("button", { name: "Board actions" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download voice notes" }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toBe("Voice ideas - voice notes.zip");
  const inside = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  expect(Object.keys(inside)).toEqual(["Voice ideas - Launch pricing.webm"]);

  // The delete dialog offers the same before the board goes.
  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("That includes its voice note.");
  await expect(confirm.getByRole("button", { name: "Download voice notes first" })).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
});

test("a board with no voice notes says so instead of downloading", async ({ page }) => {
  await page.goto("/brainstorm");
  await main(page).getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New brainstorm board" });
  await dialog.getByLabel("Name").fill("Quiet board");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(BOARD);

  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Download voice notes" }).click();
  await expect(page.getByRole("dialog", { name: "Download voice notes" })).toContainText(
    "This board has no voice notes yet.",
  );
});
