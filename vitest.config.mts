import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/touchpoint_test";
// Global setup runs in this process, so it needs the test database here too.
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Database tests share tables, so files must not run side by side.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: "test-auth-secret-0123456789abcdef0123",
      CRON_SECRET: "test-cron-secret-0123456789abcdef0123",
      APP_ENCRYPTION_KEY: "test-encryption-key-0123456789abcdef0123",
    },
  },
});
