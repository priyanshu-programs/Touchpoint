---
title: "Activity tab cards: one shape, with the day's text in the theme's green, darker on white"
author: L
date: 2026-11-03
branch: feat/activity-card-green-text
cost: { minutes: 1, tokens: 6954 }
id: l-d7a004e3
scope: repo
status: active
replaces: l-2fc5a7f3
src: agent
touches:
  - plan.md
  - src/app/(app)/activities/activity-card.tsx
  - updates.md
---

## Decided
- Owner's choices, 2026-11-03: a record's Activity tab is four sections (Upcoming meetings, Past meetings, Materials sent, Activities) of one card shape, `ActivityCard` in `src/app/(app)/activities/activity-card.tsx`: the day, a thin divider, when and where, the title with faces, and an optional action at the end. On a phone the title comes first.
- The day's weekday and date are `text-chart-bar dark:text-primary`: the theme's darker green on white, its lime on dark. The owner wanted only the text coloured, in the theme's colour.
- An activity's outcome and notes are one clamped line drawn with `LinkedText`, so addresses stay links (e2e/38). An activity's faces link to the person (e2e/04); a meeting's are unlinked, with one sr-only "With …" sentence (e2e/30).

## Tried and ruled out
- Orange text: off theme.
- A lime tile under black text: the owner wanted the text green, not the whole block.
- Lime (`text-primary`) as text in light mode: too pale to read on white.
- A stacked card with notes in full: the owner found it cluttered.

## Watch out
- Upcoming meetings: write `starts_at > now() or starts_on > current_date`. `not(started)` is null for every timed meeting and drops them all.
- Any new panel address parameter must be cleared wherever `after`/`earlier` already is.
- e2e/30 finds the kind with `getByText("Meeting", { exact: true })`, so the kind word sits in its own span.
