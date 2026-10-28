---
title: "A board's saved bytes are mostly 17-digit freedraw points; the saver rounds them to 0.01 and a 413 means the board is full"
author: L
date: 2026-10-28
branch: fix/board-full-save
cost: { minutes: 18, tokens: 110560 }
id: l-ba3f3470
scope: repo
status: active
src: agent
touches:
  - "src/app/(board)/workflows/[id]/board-saver.ts"
  - "src/app/(board)/workflows/[id]/board-chrome.tsx"
  - e2e/19-brainstorm.spec.ts
---

## Decided
- src/app/(board)/workflows/[id]/board-saver.ts (shared by workflow and brainstorm boards) rounds `points` and `pressures` to two decimals with a JSON.stringify replacer, only in the copy it sends. The elements on screen keep full precision, so the hash and undo are unaffected.
- Measured on the owner's live brainstorm board on 2026-10-28: 1,596 freedraw strokes, 37,282 points, 2,990,252 bytes, against MAX_SCENE_BYTES of 3,000,000. Rounded, the same scene is 1,572,461 bytes.
- A 413 reports SaveState "full" ("Board is full. Remove some drawings to keep saving.") and is not retried. The next changed() saves as usual, so erasing strokes recovers the board.

## Tried and ruled out
- Raising MAX_SCENE_BYTES: Vercel refuses a function request body over 4.5 MB itself, so the gain is small. The waste was precision, not the limit.

## Watch out
- Before this, a 413 showed "Could not save. Trying again…" and retried every 10 s forever. Strokes drawn after the board filled were never stored, and a reload lost them.
- Stored scenes written before this change keep their long floats until their next save.
