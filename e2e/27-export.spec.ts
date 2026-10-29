import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download export" }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^touchpoint-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile((await file.path())!)));
  return Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, strFromU8(content)]),
  );
}

test("Settings exports everything as a zip of data.json and spreadsheets", async ({ page }) => {
  await page.goto("/people/organizations/new");
  await page.getByLabel("Name", { exact: true }).fill("Maple Studio");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Maple Studio" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Company", exact: true })
    .getByRole("link", { name: "Contacts" })
    .click();
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Ada");
  await form.getByLabel("Last name").fill("Fern");
  await form.getByLabel("Job title").fill("=1+1");
  await form.getByLabel("Email").fill("ada@maple.test");
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(panel(page).getByText("Ada added.")).toBeVisible();

  await page.goto("/settings/profile");
  await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Export" }).click();
  await expect(page).toHaveURL(/\/settings\/export$/);
  await expect(page.getByText("No export yet")).toBeVisible();

  const files = await download(page);
  expect(Object.keys(files)).toEqual(
    expect.arrayContaining(["README.txt", "data.json", "csv/companies.csv", "csv/people.csv"]),
  );
  const data = JSON.parse(files["data.json"]);
  expect(data.format).toBe("touchpoint-export");
  expect(data.tables.organizations.map((row: { name: string }) => row.name)).toContain("Maple Studio");
  expect(files["data.json"]).not.toContain('"password"');
  expect(files["csv/companies.csv"]).toContain("Maple Studio");
  // A title typed as a formula reaches the spreadsheet as text.
  expect(files["csv/people.csv"]).toContain("Ada,Fern,'=1+1,,ada@maple.test,,,Maple Studio,");

  await page.reload();
  await expect(page.getByText(/^Last export: /)).toBeVisible();
});

test("an export is refused without the app's own page, signed out, and past five an hour", async ({
  page,
  playwright,
  baseURL,
}) => {
  expect((await page.request.post("/api/export")).status()).toBe(403);
  expect(
    (await page.request.post("/api/export", { headers: { origin: "https://evil.test" } })).status(),
  ).toBe(403);
  const signedOut = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  expect((await signedOut.post("/api/export", { headers: { origin: baseURL! } })).status()).toBe(401);
  await signedOut.dispose();
  expect((await page.request.get("/api/export")).status()).toBe(405);

  // One export so far from the test before; four more reach the limit.
  for (let count = 0; count < 4; count++) {
    const response = await page.request.post("/api/export", { headers: { origin: baseURL! } });
    expect(response.headers()["content-type"]).toBe("application/zip");
    await response.body();
  }
  await page.goto("/settings/export");
  await page.getByRole("button", { name: "Download export" }).click();
  await expect(page).toHaveURL(/\/settings\/export\?refused=rate$/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "You've exported 5 times in the last hour. Try again later.",
  );
});

test("the Export tab fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/export");
  await expect(page.getByRole("button", { name: "Download export" })).toBeVisible();
  await expect(page.getByText(/^Last export: /)).toBeVisible();
  expect(await fits(page)).toBe(true);
});
