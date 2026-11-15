---
title: "A drizzle sql count subquery inside .select() counted 0: the outer table's column renders unqualified"
author: L
date: 2026-11-15
branch: feat/brainstorm-folders
cost: { minutes: 1, tokens: 1259 }
id: l-ccd9ce47
scope: repo
status: active
src: agent
touches:
  - "src/modules/brainstorm/queries.ts#listBrainstormFolders"
---

## Decided
- 2026-11-15: `listBrainstormFolders` in src/modules/brainstorm/queries.ts counts each folder's boards with `leftJoin(brainstormBoards, eq(brainstormBoards.folderId, brainstormFolders.id))`, `count(brainstormBoards.id)` and `groupBy(brainstormFolders.id)`.

## Tried and ruled out
- A correlated subquery in the select: sql`(select count(*)::int from ${brainstormBoards} where ${brainstormBoards.folderId} = ${brainstormFolders.id})`. Every folder counted 0. In a single-table select, drizzle renders `${brainstormFolders.id}` as a bare "id", so Postgres resolves it to brainstorm_boards.id inside the subquery and the condition never matches. Typecheck and lint pass, so only a test catches it.

## Watch out
- Any correlated subquery written with drizzle's sql template inside `.select({...})` has the same trap when both tables have a column of that name (id, owner_id, name). Use a join with group by, or qualify the outer column by hand.
