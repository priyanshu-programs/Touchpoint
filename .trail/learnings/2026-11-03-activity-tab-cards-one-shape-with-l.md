---
title: "Activity tab cards: one shape, with the day on a lime primary tile under black text"
author: L
date: 2026-11-03
branch: feat/activity-cards
cost: { minutes: 49, tokens: 67372 }
id: l-2fc5a7f3
scope: repo
status: active
replaces: l-9d699f8c
src: agent
touches:
  - e2e/04-activities.spec.ts
  - src/app/(app)/activities/activity-card.tsx
  - src/app/(app)/activities/entry-box.tsx
  - src/app/(app)/activities/meeting-box.tsx
  - src/modules/activities/queries.ts
  - src/modules/activities/service.test.ts
  - updates.md
---

## Decided
- Owner's choices, 2026-11-03: a record's Activity tab is four sections (Upcoming meetings, Past meetings, Materials sent, Activities) of one card shape, `ActivityCard` in `src/app/(app)/activities/activity-card.tsx`: day tile, when and where, title with faces, an optional action at the end. On a phone the title comes first.
- The day tile is `bg-primary text-primary-foreground` (the theme's lime under black), as Today's tiles and the next-up badge use it. The owner asked for the theme's colour instead of orange.
- An activity's outcome and notes are one clamped line drawn with `LinkedText`, so addresses in them stay links (e2e/38); the whole note is in the activity it opens. An activity's faces link to the person (e2e/04); a meeting's are unlinked, with one sr-only "With …" sentence (e2e/30).

## Tried and ruled out
- Lime as text colour: too light to read on white.
- Orange day text: the owner wanted the theme's colour.
- A stacked card with notes in full: the owner found it cluttered.
- Filter chips over one list, and one day-grouped timeline: the owner picked sections.

## Watch out
- Upcoming meetings: write `starts_at > now() or starts_on > current_date`. `not(started)` is null for every timed meeting and drops them all.
- Any new panel address parameter must be cleared wherever `after`/`earlier` already is (company-panel tab links and contactLink, NO_CONTACT/NO_PANEL, entry Back links, record-actions' openMerge).
- e2e/30 finds the kind with `getByText("Meeting", { exact: true })`, so the kind word sits in its own span.
