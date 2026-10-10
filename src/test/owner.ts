import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";

export async function resetDatabase() {
  await db.execute(sql`truncate table "user", jobs, rate_limit cascade`);
}

export async function createTestOwner(email = "owner@example.com") {
  const [row] = await db
    .insert(user)
    .values({ name: "Test Owner", email })
    .returning({ id: user.id });
  return row.id;
}
