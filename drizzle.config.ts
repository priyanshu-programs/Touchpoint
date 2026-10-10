import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
// `generate` works from the schema alone; every other command talks to the database.
if (!url && !process.argv.includes("generate")) {
  throw new Error(
    "DATABASE_URL is not set. On Vercel, add it under Settings > Environment Variables and redeploy. Locally, put it in .env.local (see .env.example).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: url ?? "" },
});
