---
title: "Opening a board while its drawing looks empty deletes its pictures for good: 28 Oct lost Templates drafts' 6 and SEO-AEO-GEO's 13"
author: L
date: 2026-10-29
branch: feat/data-export
cost: { minutes: 13, tokens: 155113 }
id: l-e04ffe2c
scope: repo
status: active
src: agent
touches:
  - src/modules/workflows/pictures.ts
  - src/modules/brainstorm/pictures.ts
---

## Decided
- 2026-10-29: Templates drafts' 6 pictures are being restored from the manual Neon snapshot snap-divine-night-b3u4mk0p ("before-touchpoint-board-emptied-0520Z"). It was opened as a separate branch `pictures-recovery` with restore_snapshot finalize:false, so it could not take over main's compute.
- The copy back is a script the owner runs (scratchpad restore-pictures.mjs, SOURCE_URL/TARGET_URL from the environment). It only inserts, all in one transaction, checks each sha256, and copies a picture only if an image element on production still shows it and it isn't already there.

## Tried and ruled out
- Neon point-in-time restore: the 6 h history window had passed by the time the owner noticed (about 23 h later).
- Copying the bytes as base64 through Neon MCP run_sql via chat: the sha256 guard refused the first insert because of a transcription error, and about 190k characters of base64 is too much to copy by hand reliably.
- dblink from production to the branch: needs the branch's connection string, which auto mode blocks Claude from reading.

## Watch out
- openPictures (src/modules/workflows/pictures.ts) deletes every brainstorm_pictures row older than 10 minutes that no stored element shows, then dropUnusedFiles deletes the bytes. Any window where a board's drawing reads as empty (here, 0034 emptying `scene` under the old code at 08:23 UTC on 28 Oct) loses its pictures for good. The audit action brainstorm.pictures_dropped records when it happened.
- SEO-AEO-GEO's 13 pictures (added 05:52-05:55 UTC on 28 Oct) are in no snapshot or branch; the owner has to add them again.
- About 196 strokes on SEO-AEO-GEO and 214 on Legalities exist only in brainstorm_boards.scene and are hidden under the new per-element code. The owner chose not to copy them over yet.
