---
title: "Materials' last-change sort fails locally when this PC's clock trails the database's: a new row takes Postgres now(), a version bump takes the app's clock"
author: L
date: 2026-11-05
branch: fix/people-at-company
cost: { minutes: 2, tokens: 9895 }
id: l-64284589
scope: repo
status: active
src: agent
touches:
  - src/modules/materials/service.test.ts
  - src/db/schema/columns.ts
  - src/modules/materials/service.ts
---

## Decided
- 2026-11-06: the Vitest case "lists by name, type and last change, a page at a time" (src/modules/materials/service.test.ts:450) failed twice on the owner's PC with "Zebra proposal" first, and passes on CI for the same code. The `updatedAt` column (src/db/schema/columns.ts) defaults to Postgres now() on insert, but adding a version sets `updatedAt: new Date()` from the app (src/modules/materials/service.ts:264), so the two times come from different clocks. w32tm showed this PC about 1.4 s off Windows time, so Agency deck's bump was stamped earlier than Zebra proposal's insert.
- This was left as-is in the people-at-company PR, which doesn't touch materials listing; CI is the judge for this case.

## Watch out
- A local failure of any "sort by last change" test that passes on CI points to this clock mix, not the change. Syncing the clock (Settings > Time > Sync now) should clear it.
- The lasting fix is one clock for both writes, e.g. `sql\`now()\`` in the bump and in `$onUpdate`. That is a separate change to columns.ts and touches every table.
