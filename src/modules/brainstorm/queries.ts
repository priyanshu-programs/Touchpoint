import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brainstormBoards, brainstormFolders } from "@/db/schema";
import { BRAINSTORM_PAGE_SIZE } from "./schema";

const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// The owner's boards in the order they put them. In a folder, its boards; on the
// Brainstorming page, the boards in no folder, or with a search every board that
// matches, wherever it is kept.
export async function listBrainstorms(
  ownerId: string,
  options: { q?: string; offset?: number; folder?: string } = {},
) {
  const q = options.q?.trim();
  const matching = and(
    eq(brainstormBoards.ownerId, ownerId),
    options.folder
      ? eq(brainstormBoards.folderId, options.folder)
      : q
        ? undefined
        : isNull(brainstormBoards.folderId),
    q ? sql`${brainstormBoards.name} ilike ${like(q)}` : undefined,
  );

  const [rows, total] = await Promise.all([
    db
      .select({
        id: brainstormBoards.id,
        name: brainstormBoards.name,
        icon: brainstormBoards.icon,
        updatedAt: brainstormBoards.updatedAt,
        folderId: brainstormBoards.folderId,
        folderName: brainstormFolders.name,
      })
      .from(brainstormBoards)
      .leftJoin(brainstormFolders, eq(brainstormFolders.id, brainstormBoards.folderId))
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

// The owner's folders by name, each with how many boards it holds.
export async function listBrainstormFolders(ownerId: string) {
  return db
    .select({
      id: brainstormFolders.id,
      name: brainstormFolders.name,
      boards: count(brainstormBoards.id),
    })
    .from(brainstormFolders)
    .leftJoin(brainstormBoards, eq(brainstormBoards.folderId, brainstormFolders.id))
    .where(eq(brainstormFolders.ownerId, ownerId))
    .groupBy(brainstormFolders.id)
    .orderBy(sql`lower(${brainstormFolders.name})`, asc(brainstormFolders.id));
}

export async function getBrainstormFolder(ownerId: string, id: string) {
  const [folder] = await db
    .select({ id: brainstormFolders.id, name: brainstormFolders.name })
    .from(brainstormFolders)
    .where(and(eq(brainstormFolders.ownerId, ownerId), eq(brainstormFolders.id, id)));
  return folder ?? null;
}

export async function getBrainstorm(ownerId: string, id: string) {
  const [board] = await db
    .select()
    .from(brainstormBoards)
    .where(and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, id)));
  return board ?? null;
}
