---
title: "A saved name reaches the top bar's greeting only through a key, and two greeting lines name nobody"
author: L
date: 2026-11-02
branch: feat/owner-profile
cost: { minutes: 21, tokens: 381125 }
id: l-c9e8dda7
scope: repo
status: active
src: agent
touches:
  - src/db/schema/core.ts
  - src/modules/settings/schema.ts
  - src/modules/settings/service.ts
  - src/app/(app)/settings/actions.ts
  - src/lib/greeting.ts
  - src/app/(app)/layout.tsx
  - src/app/(app)/page.tsx
  - src/components/profile-panel.tsx
  - src/components/app-shell.tsx
  - src/lib/greeting.test.ts
---

## Decided
2026-11-02, owner's request: the account button opens a Your profile panel, and "You want to be referred to as" is what the greeting uses, whole. callName in src/lib/greeting.ts picks it, or the first word of the full name until it is saved. greeting() no longer cuts to the first word, or "Mr Roy" would become "Mr". The details are columns on settings; the full name stays on the user row, written directly in one transaction with the audit row because auth.ts has no session cookie cache.

## Tried and ruled out
Relying on revalidatePath alone to update the greeting: Greeting (src/components/greeting.tsx) keeps its line in useState(initial), so a new prop is ignored until the next minute's tick. app-shell.tsx gives it key={called} to remount it.

## Watch out
"Hello, night owl" and "Good morning, early bird" have no {name}, and the server's clock picks the line, so a test that expects the name in the top bar fails on some days; e2e/40-profile allows for them. An open sheet hides the top bar from getByRole("banner"), so find it with locator("header"). A browser.newContext in afterAll inherits the last test's phone viewport, where the sidebar is hidden.
