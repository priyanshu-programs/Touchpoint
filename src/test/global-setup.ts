import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
  await pool.end();
}
