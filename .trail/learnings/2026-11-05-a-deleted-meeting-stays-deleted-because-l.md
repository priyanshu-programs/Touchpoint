---
title: "A deleted meeting stays deleted because its Google id is kept in removed_calendar_events, which upsertMeetings skips"
author: L
date: 2026-11-05
branch: feat/activity-meeting-delete
cost: { minutes: 29, tokens: 230819 }
id: l-64c3fdae
scope: repo
status: active
src: agent
touches:
  - src/db/schema/integrations.ts
  - src/modules/integrations/calendar.ts
  - src/app/(app)/activities/remove-meeting.tsx
  - src/app/(app)/people/(lists)/panel-back.tsx
  - src/app/(app)/activities/meeting-box.tsx
  - src/modules/integrations/meetings.ts
---

## Decided
- Owner's choices, 2026-11-05: only a Past meetings card has the × (upcoming and live don't; Cancel meeting is inside them). Deleting goes from Touchpoint only, never Google, and deletes the meeting's notes and files too.
- The sync re-upserts everything in its window (30 days back), so `removeMeeting` (src/modules/integrations/meetings.ts) keeps the Google id in `removed_calendar_events` (migration 0043), and `upsertMeetings` (calendar.ts) drops those ids for sync and scheduling alike.
- The ids survive a disconnect (it keeps the connection row, marked revoked), so the same account reconnected keeps them deleted. They are cleared when another account connects (service.ts), and cascade when the client is removed.
- Whole-card click: `CARD_LINK` in activity-card.tsx stretches the title link with `after:absolute after:inset-0`. Anything else pressable on a card needs `relative z-10`.
- Back from the schedule confirmation: ScheduleForm pushes a same-URL history entry while confirming and listens for popstate. The panel arrow goes through `usePanelBack` (src/app/(app)/people/(lists)/panel-back.tsx), and Go back and the arrow both call history.back().

## Tried and ruled out
- Deleting just the copy: the next sync would bring it back.
- A hidden flag on calendar_events: every read query would need the filter, and the meeting's text would stay stored.

## Watch out
- e2e specs can't run one at a time (04 needs people made by 02); run the whole suite.
- To prove a deleted meeting stays deleted, e2e clears `sync_cursor` first: a sync token reports only changes.
