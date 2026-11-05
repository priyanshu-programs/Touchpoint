---
title: "In e2e, an open AlertDialog hides the page from role locators, so 'card gone' passes before the action finishes"
author: L
date: 2026-11-05
branch: feat/activity-meeting-delete
cost: { minutes: 16, tokens: 23954 }
id: l-ab1edbe8
scope: repo
status: active
src: agent
touches:
  - e2e/33-google.spec.ts
  - plan.md
  - security.md
  - src/app/(app)/activities/activity-card.tsx
  - src/app/(app)/activities/entry-box.tsx
  - src/app/(app)/activities/meeting-box.tsx
  - src/app/(app)/activities/remove-meeting.tsx
  - src/app/(app)/meetings/actions.ts
  - src/app/(app)/meetings/schedule-form.tsx
  - src/app/(app)/people/(lists)/entry-panel.tsx
---

## Watch out
- While a Radix AlertDialog is open, the rest of the page is aria-hidden. A role-based locator (`getByRole("region", ...)`) then finds nothing, so `expect(region.getByText(x)).toHaveCount(0)` passes the moment Delete is pressed, before the server action commits. e2e/33's delete test then read the database too early (1 row, not 0) on the phone run.
- Fix used: `await expect(dialog).toBeHidden()` first, then the card check, then `expect.poll` for database counts.
