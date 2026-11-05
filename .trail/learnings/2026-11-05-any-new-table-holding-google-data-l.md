---
title: Any new table holding Google data needs a line on the Privacy page and a place in the data export
author: L
date: 2026-11-05
branch: feat/activity-meeting-delete
cost: { minutes: 5, tokens: 31367 }
id: l-31353527
scope: repo
status: active
src: agent
touches:
  - src/app/(app)/meetings/schedule-form.tsx
  - src/app/(public)/privacy/page.tsx
  - updates.md
  - src/modules/export/tables.ts
  - src/modules/export/tables.test.ts
---

## Watch out
- src/app/(public)/privacy/page.tsx is the public statement Google's review reads. Anything newly kept from Google, even just event ids (removed_calendar_events, 2026-11-05), needs a sentence there on how long it is kept. No test checks this; the reviewer on PR #60 caught it.
- src/modules/export/tables.ts: every table must be exported or listed in LEFT_OUT_TABLES. src/modules/export/tables.test.ts fails otherwise, and it runs only in the full Vitest run, which CI does.
