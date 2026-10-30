import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const CLIENT_ID = "1234567890-e2eclient.apps.googleusercontent.com";
const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

test("a Google client is saved from Settings and Connect goes to Google", async ({ page }) => {
  await page.goto("/settings/profile");
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Integrations" })
    .click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await expect(page.getByText("Save your Google client below, then connect.")).toBeVisible();
  await expect(
    page.getByText("http://localhost:3100/api/integrations/google/callback"),
  ).toBeVisible();

  await page.getByLabel("Client ID").fill("my-client");
  await page.getByLabel("Client secret").fill("GOCSPX-e2e-secret");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(
    page.getByText("That isn't a Google client ID. It ends in .apps.googleusercontent.com."),
  ).toBeVisible();

  await page.getByLabel("Client ID").fill(CLIENT_ID);
  await page.getByLabel("Client secret").fill("GOCSPX-e2e-secret");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByText("Configured · client ID ending …ient")).toBeVisible();
  await expect(page.getByText("GOCSPX")).toHaveCount(0);

  const connect = page.getByRole("link", { name: "Connect Google Calendar" });
  await expect(connect).toHaveAttribute("href", "/api/integrations/google/connect");

  // Google itself is never reached: the redirect is read, not followed.
  const answer = await page.request.get("/api/integrations/google/connect", {
    maxRedirects: 0,
  });
  expect(answer.status()).toBe(302);
  const google = new URL(answer.headers()["location"]);
  expect(google.origin).toBe("https://accounts.google.com");
  expect(google.searchParams.get("client_id")).toBe(CLIENT_ID);
  expect(google.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3100/api/integrations/google/callback",
  );
  expect(google.searchParams.get("scope")).toBe(
    "openid email https://www.googleapis.com/auth/calendar.readonly",
  );
  const cookie = answer.headers()["set-cookie"];
  expect(cookie).toMatch(/tp_google_oauth=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);

  // Saying no at Google comes back with the same state.
  await page.goto(
    `/api/integrations/google/callback?state=${google.searchParams.get("state")}&error=access_denied`,
  );
  await expect(page).toHaveURL(/\/settings\/integrations\?google=denied$/);
  await expect(
    page.getByText("You chose not to allow access at Google, so nothing was connected."),
  ).toBeVisible();
});

test("an answer that doesn't match the Connect that started it is refused", async ({ page }) => {
  await page.goto("/api/integrations/google/callback?state=forged&code=stolen-code");
  await expect(page).toHaveURL(/\/settings\/integrations\?google=refused$/);
  await expect(
    page.getByText("That answer from Google couldn't be checked. Start again with Connect."),
  ).toBeVisible();
  await expect(page.getByText("Google account", { exact: true })).toBeVisible();
});

test("a connected account shows its sync, and disconnecting removes the meetings", async ({
  page,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query(`
    with owner as (select id from "user" limit 1),
    connection as (
      insert into integration_connections
        (owner_id, provider, account_email, scopes, status, key_version, connected_at, last_sync_at)
      select id, 'google', 'owner@gmail.test', '{}', 'connected', 1, now(), now() from owner
      returning id, owner_id
    )
    insert into calendar_events
      (owner_id, connection_id, external_id, title, all_day, starts_at, ends_at, attendees)
    select owner_id, id, 'e2e-meeting', 'Kickoff', false, now(), now(), '[]'::jsonb from connection
  `);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/integrations");
  await expect(page.getByText("Last synced")).toBeVisible();
  await expect(page.getByText("1, 0 linked to your people or companies")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
  expect(await fits(page)).toBe(true);

  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("removes the meetings it copied");
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
  const { rows } = await pool.query("select count(*)::int as count from calendar_events");
  expect(rows[0].count).toBe(0);

  await pool.query("delete from integration_connections");
  await pool.end();
});

test("the client is replaced and removed, and the tab fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/integrations");
  expect(await fits(page)).toBe(true);

  await page.getByRole("button", { name: "Replace" }).click();
  await page.getByLabel("Client ID").fill("555-replaced.apps.googleusercontent.com");
  await page.getByLabel("Client secret").fill("GOCSPX-other");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByText("Configured · client ID ending …aced")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Configured · client ID ending …aced")).toBeVisible();
  expect(await fits(page)).toBe(true);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove your Google client?");
  await page.getByRole("button", { name: "Remove client" }).click();
  await expect(page.getByText("Save your Google client below, then connect.")).toBeVisible();
  await expect(page.getByLabel("Client ID")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("integration.client_remove").first()).toBeVisible();
});
