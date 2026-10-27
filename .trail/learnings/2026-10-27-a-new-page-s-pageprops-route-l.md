---
title: "A new page's PageProps<\"/route\"> fails typecheck until next typegen regenerates the route types"
author: L
date: 2026-10-27
branch: feat/revenue-dashboard
cost: { minutes: 21, tokens: 288114 }
id: l-cb6a6df2
scope: repo
status: active
src: agent
touches:
  - src/lib/money.test.ts
  - src/modules/revenue/period.ts
  - src/modules/revenue/period.test.ts
  - src/modules/revenue/queries.ts
  - src/modules/revenue/queries.test.ts
  - src/app/(app)/money/figure-links.ts
  - src/app/(app)/money/overview-controls.tsx
  - src/app/(app)/money/page.tsx
  - e2e/23-invoices.spec.ts
  - e2e/24-payments.spec.ts
---

## Watch out
- Pages here type their props as `PageProps<"/money/invoices">` (Next 16 typed routes). A brand-new route, like `src/app/(app)/money/page.tsx` for `/money` (Phase 4 step 3), fails `tsc --noEmit` with `Type '"/money"' does not satisfy the constraint 'AppRoutes'` until the route types are regenerated.
- Fix: `corepack pnpm exec next typegen` (a `next build` or `next dev` does it too). The generated types are not committed, so CI's build regenerates them; only a local typecheck run before any build hits this.
