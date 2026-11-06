---
title: "A task from a company's own panel is only with that company's people; elsewhere a task may still name anyone"
author: L
date: 2026-11-06
branch: feat/task-priority-colours
cost: { minutes: 6, tokens: 119081 }
id: l-f279944c
scope: repo
status: active
src: agent
touches:
  - src/app/(app)/people/labels.ts
  - src/app/(app)/people/(lists)/list-controls.tsx
  - src/modules/tasks/service.ts
---

## Decided
- 2026-11-07, owner's request: adding or editing a task from a company's panel shows no company picker, and the contact search lists only that company's people (TaskForm in src/app/(app)/tasks/task-form.tsx, keyed on `from === "organization"`).
- The server check runs only for that origin: createTask/updateTask in src/modules/tasks/service.ts take an `atCompany` flag set by the action from `readOrigin`. Activities check whenever a company is set; tasks don't, because a task from a person's panel or /tasks/new has always been allowed to name any person and any company.
- On edit an unchanged contact is kept even after leaving the company, as with activities.

## Watch out
- TaskEditor needs `from` and `inside` from EntryPanel. Without them, editing in the company panel falls back to both pickers and skips the server check.
- TaskList takes a `colors` prop (the owner's priority tag colours, from `priorityColors(settings)`), so any new place that draws a task list has to read settings and pass it.
