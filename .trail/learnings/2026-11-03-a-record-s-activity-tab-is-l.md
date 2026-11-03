---
title: "A record's Activity tab is four sections of one card shape: day block, when and where, what and who"
author: L
date: 2026-11-03
branch: feat/activity-tab-sections
cost: { minutes: 1, tokens: 2437 }
id: l-9d699f8c
scope: repo
status: active
replaces: l-9a43d3af
src: agent
touches:
  - src/modules/integrations/meetings.ts
---

## Decided
- Owner's choice, 2026-11-03, from two reference pictures: the Activity tab (`src/app/(app)/activities/record-timeline.tsx`) shows Upcoming meetings, Past meetings, Materials sent and Activities as separate grey panels of white cards, each with a count. "See all (N)" sets `section=` in the panel's address to show one section alone, paged with the existing `after`/`earlier` cursor.
- Same day, after a third reference picture ("too cluttered"): every card on the tab is one shape, `ActivityCard` in `src/app/(app)/activities/activity-card.tsx`: the day on the left (weekday, big day number in `text-orange-600`, small month, since past entries span months), a divider, a middle column of icon rows, then the title with faces under it, and an optional action at the end (Join, or a send's status menu and remove). On a phone the title column comes first and the rows stack.
- Outcome and notes are a one-line preview on the card, with the whole note in the activity it opens, the same rule as stage notes. The day block carries the day, so cards have no kind badge and no "Today, 14:00" text.
- An activity's people are faces that link to the person (`People` with `href`), because a person is reached from a company's Activity tab (e2e/04); a meeting's faces stay unlinked with one sr-only "With …" sentence (e2e/30). `listTimeline`'s people carry `photoVersion` for this.
- A meeting box needs its end time, which the `timeline` view has no column for, so `recordMeetings` in `src/modules/integrations/meetings.ts` selects from `calendar_events` itself. Upcoming meetings follow Today's rule: hidden once Google is disconnected or revoked.

## Tried and ruled out
- Filter chips (All / Meetings / Sends / Activities) over one list, and one day-grouped timeline with each entry in a box: the owner picked sections.
- A stacked card (title, then hours, place, people, notes in full): the owner found it cluttered.

## Watch out
- `not(started)`, where started is `starts_at <= now() or starts_on <= current_date`, is null for every timed meeting (starts_on is null), so it drops them all. Write the upcoming test out: `starts_at > now() or starts_on > current_date`.
- lucide-react here has no brand icons (no `Linkedin`); LinkedIn activities use `Briefcase`.
- Any new panel address parameter must be cleared wherever `after`/`earlier` already is: company-panel tab links and contactLink, NO_CONTACT/NO_PANEL, the entry Back links, and record-actions' openMerge.
- e2e/30 finds the kind with `getByText("Meeting", { exact: true })`, so the kind word sits in a span of its own, apart from " · Outbound".
