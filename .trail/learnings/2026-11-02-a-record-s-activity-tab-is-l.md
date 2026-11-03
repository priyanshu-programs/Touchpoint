---
title: "A record's Activity tab is four sections of boxes, with upcoming meetings read straight from calendar_events"
author: L
date: 2026-11-02
branch: feat/activity-tab-sections
cost: { minutes: 1, tokens: 1739 }
id: l-9a43d3af
scope: repo
status: active
src: agent
touches:
  - src/modules/integrations/meetings.ts
---

## Decided
- Owner's choice, 2026-11-03, from two reference pictures: the Activity tab (`src/app/(app)/activities/record-timeline.tsx`) shows Upcoming meetings, Past meetings, Materials sent and Activities as separate grey panels of white boxes, each with a count. "See all (N)" sets `section=` in the panel's address to show one section alone, paged with the existing `after`/`earlier` cursor.
- A meeting box needs its end time, which the `timeline` view has no column for, so `recordMeetings` in `src/modules/integrations/meetings.ts` selects from `calendar_events` itself. Upcoming meetings follow Today's rule: hidden once Google is disconnected or revoked.
- The date block is orange (`text-orange-600`), not the lime primary, which is too light to read as text on white.

## Tried and ruled out
- Filter chips (All / Meetings / Sends / Activities) over one list, and one day-grouped timeline with each entry in a box: the owner picked sections.

## Watch out
- `not(started)`, where started is `starts_at <= now() or starts_on <= current_date`, is null for every timed meeting (starts_on is null), so it drops them all. Write the upcoming test out: `starts_at > now() or starts_on > current_date`.
- lucide-react here has no brand icons (no `Linkedin`); LinkedIn activities use `Briefcase`.
- Any new panel address parameter must be cleared wherever `after`/`earlier` already is: company-panel tab links and contactLink, NO_CONTACT/NO_PANEL, the entry Back links, and record-actions' openMerge.
