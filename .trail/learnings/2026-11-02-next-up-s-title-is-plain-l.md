---
title: "Next up's title is plain text because each record must be one link on the dashboard; the owner chose 6px corners and the chart above tasks"
author: L
date: 2026-11-02
branch: feat/today-dashboard
cost: { minutes: 1, tokens: 1964 }
id: l-643a7684
scope: repo
status: active
src: agent
---

## Decided
- Owner's choices, 2026-11-02 (src/app/(app)/page.tsx, adapted from a reference picture): the 12-month money chart above the task list on a computer, 6px corners, and a Connect Google Calendar card in place of Meetings while the calendar has no connection.
- A phone puts the work first: Next up, Quick actions, Reminders, Tasks. The column wrappers use display: contents when narrow and each card sets its own order, so no card is drawn twice.
- The layout uses a container query, not the screen width, because the sidebar can be dragged wider.

## Tried and ruled out
- Tasks above the chart: better on a busy day, but a long list pushes the chart out of sight, and Next up keeps urgent work in view.
- Rounder corners, on this page only or everywhere: would undo the 6px decision of 2026-11-01 or make the page look unlike the others.
- People gone quiet, a this-week strip, change on last month: offered and not chosen.
- Solid grey bars at 3:1 around the highlighted month (BarChart highlight): too heavy, they competed with the lime bar. Replaced by a pale body with a 3:1 cap.

## Watch out
- Next up (next-up-card.tsx) shows its title as plain text and its button says only "Open". e2e/30 expects one link named after a meeting on the page, and e2e/03 expects one Complete button, so linking the title or adding Complete there breaks them.
- todaySummary says "Nothing due today." because "Nothing is due today." is the task list's sentence, which e2e/03 expects to find once.
- The chart has a hidden table whose caption also says "Money received", so tests need an exact match for the card title.
