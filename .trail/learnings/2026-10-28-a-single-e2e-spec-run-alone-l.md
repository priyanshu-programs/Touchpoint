---
title: "A single e2e spec run alone finds no owner: run e2e/01-foundation.spec.ts with it"
author: L
date: 2026-10-28
branch: fix/board-full-save
cost: { minutes: 1, tokens: 14384 }
id: l-6221ea63
scope: repo
status: active
src: agent
touches:
  - e2e/19-brainstorm.spec.ts
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-chrome.tsx"
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-saver.ts"
  - updates.md
  - e2e/global-setup.ts
  - e2e/01-foundation.spec.ts
---

## Watch out
- e2e/global-setup.ts empties the test database. The owner account and OWNER_SESSION are created by e2e/01-foundation.spec.ts ("first run: create the owner"), not by global setup.
- So `playwright test e2e/19-brainstorm.spec.ts` alone fails its first test on the "Welcome to Touchpoint / Create the owner account" page (a timeout waiting for the sidebar). Run `playwright test e2e/01-foundation.spec.ts e2e/<NN>-….spec.ts`. 01 sorts first and sets the owner up; 01 + 19 took about 1.7 min on 2026-10-28.
