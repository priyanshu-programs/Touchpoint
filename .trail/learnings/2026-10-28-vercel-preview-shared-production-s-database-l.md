---
title: "Vercel Preview shared production's DATABASE_URL, so PR #19's migration 0034 ran on live data and blanked brainstorm boards"
author: L
date: 2026-10-28
branch: feat/brainstorm-stroke-sync
cost: { minutes: 13, tokens: 50153 }
id: l-9a286e7e
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/19-brainstorm.spec.ts
  - plan.md
  - security.md
  - src/app/(app)/brainstorm/actions.ts
  - "src/app/(board)/brainstorm/[id]/board-sync.ts"
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-pictures.ts"
  - "src/app/(board)/workflows/[id]/board-saver.ts"
  - "src/app/api/brainstorm/[id]/elements/route.ts"
---

## Decided
- 2026-10-28: Vercel's one DATABASE_URL targeted preview AND production, and vercel.json's buildCommand runs `pnpm db:migrate`. Opening PR #19 ran 0034 on production: strokes were copied to brainstorm_elements and `scene` was emptied, so the live (old) code showed blank boards.
- Restored on production in one transaction: backup table `brainstorm_scene_backup_20261028` (id, name, scene, version, updated_at), then `scene` = rows not already in scene (ordered by index collate "C") || scene, version + 1, for Touchpoint, Templates drafts, Website launch checklist and SEO-AEO-GEO. The owner closed every board tab first.
- Owner's choice: Legalities left as it was. 6 of its old strokes exist only in brainstorm_elements and were probably erased on purpose.
- A Neon branch `preview` (br-sweet-boat-b3kjl5jp) was created for previews. The owner changes the Vercel envs by hand: DATABASE_URL production only, plus a new Preview-only DATABASE_URL for that branch.

## Tried and ruled out
- Point-in-time restore from Neon history (6 h retention): not needed, because the migration had copied every stroke into brainstorm_elements.
- Claude setting the env, reading the branch's connection string or merging: all blocked by auto mode (secret-store write, credential, production deploy).

## Watch out
- Production already counts 0034 as applied, and its brainstorm_elements copy goes stale as the owner keeps drawing on `scene`. PR #19 needs a 0035 that deletes the rows, re-copies `scene`, recomputes clock/live/bytes and empties `scene` again. Push it only after Preview has its own DATABASE_URL; check production's drizzle.__drizzle_migrations gains nothing from a preview build.
- Touchpoint's scene is about 2.99 MB and Templates drafts about 2.6 MB: under the old code they need PR #18's rounding live before more drawing.
- Drop brainstorm_scene_backup_20261028 only with the owner's go-ahead, once #19 is live.
