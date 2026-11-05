---
title: "A send, activity or meeting about a company may include only that company's people, checked in the service and again in the form"
author: L
date: 2026-11-05
branch: fix/people-at-company
cost: { minutes: 3, tokens: 71247 }
id: l-f203958c
scope: repo
status: active
src: agent
touches:
  - src/modules/materials/service.ts
  - src/modules/activities/service.ts
  - src/modules/integrations/scheduling.ts
  - security.md
  - plan.md
  - src/components/record-picker.tsx
---

## Decided
- 2026-11-05, the owner's choice: the rule covers all three ways of recording contact with a company, not only Log a send. These are Log a send (src/modules/materials/service.ts), Log activity (src/modules/activities/service.ts) and Schedule meeting (src/modules/integrations/scheduling.ts). security.md and plan.md state the rule.
- The service refuses and names each person who isn't at the chosen company. The forms only help: the shared people and company picker (src/components/record-picker.tsx) takes such people off when the company changes and shows a note, and people search takes an optional company.
- For Schedule meeting, the check runs before Google is called, so a refused meeting never reaches the calendar.

## Tried and ruled out
- Fixing only Log a send, where the gap was first found: Log activity and Schedule meeting had the same gap, and the owner chose to close all three at once.

## Watch out
- Editing an existing activity keeps people who have left the company since it was logged. Only newly added people are checked. Without this, an old activity can't be saved after someone changes jobs.
