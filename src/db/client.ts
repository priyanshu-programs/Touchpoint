import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

// One pool per process: survives dev hot reloads and is reused by warm serverless instances.
export const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: env.DATABASE_URL, max: 5 });
globalForDb.pgPool = pool;

export const db = drizzle(pool);
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;
