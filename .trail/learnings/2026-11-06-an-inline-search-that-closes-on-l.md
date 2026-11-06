---
title: "An inline search that closes on pointerdown can make the next click miss: the panel shrinks and scrolls before the press ends"
author: L
date: 2026-11-06
branch: fix/send-pickers-inline
cost: { minutes: 13, tokens: 49558 }
id: l-dd393131
scope: repo
status: active
src: agent
touches:
  - e2e/16-material-sends.spec.ts
  - src/components/record-picker.tsx
  - updates.md
  - src/app/(app)/people/contacts/people-at-company.tsx
  - src/app/(app)/materials/send-form.tsx
  - plan.md
---

## Decided
2026-11-07, src/components/record-picker.tsx useCloseOutside: an inline search closes on an outside `click`, and on `focusin` only when no pointer is down (pointerdown/pointerup track it). The close callback is a stable useCallback, so the listeners and that flag survive re-renders.

## Tried and ruled out
Closing on `pointerdown` (and on any `focusin`): with the people search open in a person's Log a send, clicking the company button closed the people search on the press. The record panel got shorter, its scroll clamped, the button moved, and the mouseup landed elsewhere, so the company search never opened. e2e/16 caught it; the trace showed "click action done" and no search.

## Watch out
Any in-panel thing that collapses on an outside press has the same trap whenever the record panel is scrolled. Close on the click instead. Log a send from a company's own panel has no company picker (`companyFixed` on PeopleAtCompany, from === "organization"), so e2e/16 checks switching companies from a person's Log a send (personSendUrl).
