---
title: "In e2e, an open record panel makes the sidebar unreachable, and New material clears a name typed before the page settles"
author: L
date: 2026-10-26
branch: feat/journey-tests
cost: { minutes: 54, tokens: 228322 }
id: l-18655b95
scope: repo
status: active
src: agent
touches:
  - e2e/22-journeys.spec.ts
  - plan.md
  - docs/PRD.md
  - security.md
  - playwright.config.ts
  - e2e/support.ts
  - e2e/18-quick-add.spec.ts
  - e2e/05-today.spec.ts
  - e2e/04-activities.spec.ts
  - e2e/16-material-sends.spec.ts
---

## Decided
- e2e/22-journeys.spec.ts reaches screens the way a person does: its goTo() closes an open panel (the sheet's "Close" button) before clicking the sidebar or the phone's bar. The record panel is a modal sheet, so everything behind it is out of reach for getByRole and clicks.

## Tried and ruled out
- Clicking navigation "Main" while a company or person panel was open: the locator never resolves and the test times out after 60 s, on a desktop and on a phone alike.

## Watch out
- /materials/new reached by a client-side link: a Name typed at once was cleared before submit (the page still showed /materials/new and the Name field was empty), while Link kept its text. Wait for networkidle after reaching /materials/new before filling it.
- Quick add and New material can take longer than Playwright's 5 s to land on the Neon test host. The journey spec gives those two URL waits 15 s, as e2e/20 does for merges.
