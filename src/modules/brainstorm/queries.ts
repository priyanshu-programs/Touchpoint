import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brainstormBoards } from "@/db/schema";
import { BRAINSTORM_PAGE_SIZE } from "./schema";

// The owner's boards, the one drawn on last first.
export async function listBrainstorms(
  ownerId: string,
  options: { q?: string; offset?: number } = {},
) {
  const q = options.q?.trim();
  const matching = and(
    eq(brainstormBoards.ownerId, ownerId),
    q
      ? sql`${brainstormBoards.name} ilike ${`%${q.replace(/[\\%_]/g, "\\$&")}%`}`
      : undefined,
  );

  const [rows, total] = await Promise.all([
    db
      .select({
        id: brainstormBoards.id,
        name: brainstormBoards.name,
        icon: brainstormBoards.icon,
        updatedAt: brainstormBoards.updatedAt,
      })
      .from(brainstormBoards)
      .where(matching)
      .orderBy(asc(brainstormBoards.position), asc(brainstormBoards.id))
      .limit(BRAINSTORM_PAGE_SIZE + 1)
      .offset(options.offset ?? 0),
    db.$count(brainstormBoards, matching),
  ]);

  return {
    rows: rows.slice(0, BRAINSTORM_PAGE_SIZE),
    hasMore: rows.length > BRAINSTORM_PAGE_SIZE,
    total,
  };
}

export async function getBrainstorm(ownerId: string, id: string) {
  const [board] = await db
    .select()
    .from(brainstormBoards)
    .where(and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, id)));
  return board ?? null;
}
