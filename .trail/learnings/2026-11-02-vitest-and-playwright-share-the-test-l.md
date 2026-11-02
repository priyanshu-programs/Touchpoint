---
title: "Vitest and Playwright share the test database, so running them at once deadlocks e2e's global setup"
author: L
date: 2026-11-02
branch: feat/note-formatting
cost: { minutes: 27, tokens: 101902 }
id: l-0b118cab
scope: repo
status: active
src: agent
touches:
  - e2e/13-workflows.spec.ts
  - plan.md
  - security.md
  - "src/app/(board)/workflows/[id]/box-notes.tsx"
  - updates.md
  - e2e/41-highlighter.spec.ts
  - src/modules/workflows/note-marks.test.ts
  - "src/app/(board)/workflows/[id]/note-editor.tsx"
  - src/test/owner.ts
  - e2e/global-setup.ts
---

## Watch out
- Unit tests (`resetDatabase` in src/test/owner.ts) and e2e (`e2e/global-setup.ts`, which empties the database) both use TEST_DATABASE_URL. Started side by side on 2026-11-02, the e2e run failed at once with "deadlock detected at global-setup.ts:18", and a run that gets past setup would have its rows wiped under it.
- Run one, then the other. To run both together, give e2e a private database as in the learning on TEST_DATABASE_URL.
