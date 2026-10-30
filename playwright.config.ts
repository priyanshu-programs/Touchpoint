import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/touchpoint_test";

export const CRON_SECRET = "e2e-cron-secret-0123456789abcdef01234";
// Global setup runs in this process and resets this database.
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The journey is one first-run story against one database.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  // On GitHub the failures become annotations on the commit, readable without downloading logs.
  reporter: process.env.GITHUB_ACTIONS ? [["list"], ["github"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: "e2e-auth-secret-0123456789abcdef01234",
      CRON_SECRET,
      // The suite never sends an address to an outside service.
      WEBSITE_RENDERER: "off",
      // Not a real key, whatever the developer's own file holds: it only puts the
      // profile links section on screen. No test presses "Find profile links".
      TAVILY_API_KEY: "e2e-not-a-key",
      APP_ENCRYPTION_KEY: "e2e-encryption-key-0123456789abcdef0123",
      GOOGLE_SITE_VERIFICATION: "e2e-site-token",
    },
  },
});
