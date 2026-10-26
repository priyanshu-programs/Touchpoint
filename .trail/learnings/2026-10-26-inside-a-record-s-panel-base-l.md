---
title: "Inside a record's panel, Base UI's dialog takes focus back and closes on Escape, so an in-place editor needs a layout effect and the sheet's onOpenChange"
author: L
date: 2026-10-26
branch: main
cost: { minutes: 25, tokens: 196272 }
id: l-f1b435d1
scope: repo
status: active
src: agent
touches:
  - src/modules/fields/service.ts
  - src/app/(app)/people/fields/actions.ts
  - src/app/(app)/people/fields/inline-value.tsx
  - src/app/(app)/people/fields/custom-values.tsx
  - src/app/(app)/people/contacts/contact-details.tsx
  - src/app/(app)/people/(lists)/organizations/company-panel.tsx
  - src/app/(app)/people/(lists)/record-sheet.tsx
  - src/modules/fields/custom.test.ts
  - e2e/21-custom-fields.spec.ts
  - docs/PRD.md
---

## Decided
- The custom-field editor in Details (src/app/(app)/people/fields/inline-value.tsx) puts focus back on its value button in a useLayoutEffect. RecordSheet (src/app/(app)/people/(lists)/record-sheet.tsx) cancels an `escape-key` close (`details.cancel()`) when the Escape came from inside `[data-inline-editor]`, and the editor's form handles Escape itself.

## Tried and ruled out
- Focusing the button in a useEffect: e2e/21 saw focus end up on the panel. When the focused input unmounts, Base UI's FloatingFocusManager (restoreFocus "popup" for Dialog) checks in a microtask whether document.body has focus, focuses the popup, and focuses it again on the next animation frame. A passive effect runs too late. A layout effect focuses the button before that check, so the manager does nothing.

## Watch out
- Base UI's Escape dismissal listens on the document, so stopPropagation in a React onKeyDown does not stop it. Use the Root's onOpenChange(open, details) with details.reason and details.cancel().
- Details' buttons are named "Edit <field>", so Playwright's getByLabel("<field>") also matches them. While an Edit page is still loading, the button can match first. Use { exact: true } for a custom field's input on Edit forms (done in e2e/09).
