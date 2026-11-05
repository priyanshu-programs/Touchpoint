---
title: "Only a meeting the owner organized and that hasn't started can be cancelled from Touchpoint, told by Google's organizer.self"
author: L
date: 2026-11-05
branch: feat/cancel-meeting
cost: { minutes: 40, tokens: 176700 }
id: l-5b7fafb0
scope: repo
status: active
src: agent
touches:
  - src/app/(app)/meetings/cancel-meeting.tsx
  - src/modules/integrations/scheduling.ts
  - e2e/fake-google/server.mjs
---

## Decided
- Owner's choices, 2026-11-05: Cancel meeting appears only on meetings the owner organized that haven't started; an "Email guests that it's cancelled" box, ticked by default, sets `sendUpdates`.
- Who organized it is Google's `organizer.self`, kept as `calendar_events.organized_by_owner` (migration 0042) by `parseEvent`/`upsertMeetings`, so the button can be hidden without asking Google. `cancelMeeting` (src/modules/integrations/scheduling.ts) still reads the event from Google before deleting, since the copy can be a day old.
- Notes and files written inside the meeting survive: the copy is deleted and `activities.calendar_event_id` goes null, as on a disconnect.

## Tried and ruled out
- A button on every meeting: for an invitation, Google's delete only quietly takes it off the owner's calendar and tells the organizer nothing.
- Keeping a meeting on the company it was scheduled from (asked about the same day for "test meeting 2"): the owner said the guest-based linking is right; a company's meetings come only from its people's emails or its domain.

## Watch out
- Rows synced before 0042 read `organized_by_owner = false` until the next full sync (daily) or Sync now, so the button shows up a little late on old meetings.
- A 404 or 410 from Google on the read or the delete counts as already cancelled; the fake server in e2e/fake-google/server.mjs keeps a deleted event as `cancelled` and answers 410 on a second delete.
