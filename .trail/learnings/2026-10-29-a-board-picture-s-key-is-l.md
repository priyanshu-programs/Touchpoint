---
title: "A board picture's key is the SHA-1 of the original file, so lost pictures come back from the owner's disk: all 19 lost on 28 Oct were restored from Pictures\\Sc…"
author: L
date: 2026-10-29
branch: feat/data-export
cost: { minutes: 13, tokens: 48756 }
id: l-d57aeb6e
scope: repo
status: active
replaces: l-e04ffe2c
src: agent
---

## Decided
- 2026-10-29: All 19 pictures deleted at 08:23 UTC on 28 Oct (6 on Templates drafts, 13 on SEO-AEO-GEO) were restored. The whiteboard ids a picture by the hex SHA-1 of the file it was given (before any resizing), so a scan of C:\Users\l for image files whose SHA-1 equals a missing key found every original in Pictures\Screenshots (Win+Shift+S saves each one there).
- They went back through the app's own route, POST /api/brainstorm/<id>/pictures with `file` and `key`, from the owner's signed-in Chrome (browsermcp: a file input added by eval, `upload`, then fetch). The app re-encoded each one to exactly the bytes it stored the first time; sizes matched the snapshot.
- Prevention (PR fix/picture-grace, migration 0035): openPictures marks a picture nothing shows (dropped_at) and removes it only once nothing has shown it for 30 days; it marks nothing while the drawing has no element.

## Tried and ruled out
- Neon point-in-time restore: the 6 h window had passed. The manual snapshot only held pictures stored before about 05:20 UTC.
- Copying bytes as base64 through run_sql: a transcription error, caught by a sha256 guard. Too long to copy by hand.
- dblink, or reading the branch's connection string: blocked by auto mode. pageinspect on Neon: permission denied.
- The browser's HTTP cache (`fetch(url, {cache: 'only-if-cached'})`): it held only one picture. A picture uploaded from a browser is never downloaded by that browser, so it isn't cached there.

## Watch out
- To find a lost picture, look for the original file by SHA-1 before anything else.
- browsermcp's `upload` only takes files under the project folder: put copies in test-results/ (gitignored) and delete them afterwards.
- As of 2026-10-29, Vercel's DATABASE_URL still targets preview AND production, so every pushed branch migrates production. Auto mode blocks Claude from changing it; the owner must.
- Neon's scheduled snapshots aren't enabled on this plan ("backup schedule creation is not enabled for this project").
