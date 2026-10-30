---
title: Calendar sync reads the whole window daily because a sync token never reports a recurring meeting entering it; the copy is deleted on disconnect
author: L
date: 2026-10-30
branch: feat/calendar-sync
cost: { minutes: 22, tokens: 276005 }
id: l-973afdc7
scope: repo
status: active
src: agent
touches:
  - src/integrations/google/calendar.ts
  - src/modules/integrations/calendar.ts
  - src/modules/integrations/calendar.test.ts
  - plan.md
  - security.md
  - docs/PRD.md
  - src/app/(app)/settings/integrations/page.tsx
  - src/app/(public)/privacy/page.tsx
---

## Decided
Owner's choices, 2026-10-30 (Phase 5 step 2): only the primary calendar is read. Disconnecting, removing the client or connecting a different account deletes calendar_events; an expired connection keeps them and pauses. /privacy says so, and it is the page Google reviews.
src/modules/integrations/calendar.ts reads 30 days back to 90 ahead in full once a day, and by sync token otherwise. Matching attendees to people and companies runs over all stored meetings on every sync, so a contact added later links without Google reporting a change.

## Tried and ruled out
Sync token alone: it reports changes, so an old recurring meeting coming within the 90-day edge never arrives, and a missed deletion is never repaired.

## Watch out
A full read prunes only inside the window: older meetings are history and must stay. An all-day date has no zone, so the window's edge days are skipped when pruning.
"Sync now" is limited through last_sync_attempt_at, not last_sync_at, so failed tries count too.
A page write locks the connection and rechecks status and account first, so a disconnect during a sync can't bring meetings back. Don't hold a transaction across a Google call.
Google's Connect can't be tried on a preview (own encryption key, unregistered redirect): use localhost or production.
