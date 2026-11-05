---
title: "A meeting's notes and files live on an activity linked to it, because the meeting's copy is deleted on disconnect"
author: L
date: 2026-11-05
branch: feat/meeting-notes-files
cost: { minutes: 1, tokens: 1847 }
id: l-6f561a5d
scope: repo
status: active
src: agent
touches:
  - src/components/note-editor.tsx
  - src/modules/activities/queries.ts
---

## Decided
- Owner's choices, 2026-11-05: notes inside a meeting are formatted (the stage-notes editor, now src/components/note-editor.tsx) and work on every meeting: live, upcoming and past. Files too.
- They are kept on one activity per meeting: `activities.calendar_event_id` (on delete set null, unique per owner) plus `activities.marks`, and files in `activity_files` (migration 0041). Made lazily by `meetingActivity` in src/modules/activities/meeting-notes.ts from the stored meeting (title, start, company, matched people), with the meeting row locked so two first writes make one.
- While the link is set, the Activities section and its count leave the activity out (`meetingNoteIds` in src/modules/activities/queries.ts), since the meeting card already shows it. Once the copy goes the link clears and it shows as an ordinary meeting activity, with its files on the activity page.
- The record tab has Live now (`recordMeetings` when "live"), and Past meetings means ended. `countRecordEvents.meetings` counts ended meetings straight from calendar_events (`countEndedMeetings`), not from the timeline view, which still counts "started".

## Tried and ruled out
- Notes or files on calendar_events: disconnecting Google, connecting another account or Google cancelling the event deletes the row and would delete the notes.
- Keeping "Log notes" (a separate Log activity form): the owner wanted notes inside the meeting.

## Watch out
- The ordinary activity Edit form edits the body as plain text. `updateActivity` clears `marks` when the body changes, or the ranges would point at the wrong words.
- e2e/30's "Maple kickoff" starts 1 min ago and lasts an hour, so it is under Live now. "Maple intro" is the ended one that keeps "See all (31)" at 31.
- Live now is ordered by start, and an all-day meeting starts at midnight in the database's zone, so its place beside a timed meeting under way depends on the hour: tests compare the set, not the order.
