---
title: "The logo stays SVG on pages, with PNG and ICO only for Apple and browser icons; WebP or AVIF would be larger and blur"
author: L
date: 2026-10-30
branch: feat/brand-logo
cost: { minutes: 19, tokens: 178401 }
id: l-a1a167e4
scope: repo
status: active
src: agent
touches:
  - e2e/01-foundation.spec.ts
  - package.json
  - plan.md
  - public/Images/touchpoint-logo-transparent.svg
  - public/Images/touchpoint-mark.svg
  - scripts/brand-assets.mjs
  - src/app/(auth)/layout.tsx
  - src/app/(auth)/sign-in/page.tsx
  - "src/app/(board)/brainstorm/[id]/page.tsx"
  - "src/app/(board)/workflows/[id]/page.tsx"
---

## Decided
- 2026-10-30: the mark is flat vector, so pages use public/Images/touchpoint-mark.svg (315 B). apple-icon.png and favicon.ico exist only because Apple and browsers need those formats. `pnpm brand:assets` regenerates all of them from the owner's original, public/Images/touchpoint-logo-transparent.svg, which is never edited.
- The ivory and lime mark needs a dark tile (#171717) to read on a light theme, so BrandMark always draws one.

## Tried and ruled out
- A PWA manifest and a social image: left out because this is a private single-owner app. That was a decision made while building, not the owner's request.

## Watch out
- Files under /Images have a one-day browser cache because the filename carries no version. A changed logo can show stale for up to a day.
- A new page outside the app shell and board headers shows no logo by itself: use BrandLockup. An unknown address uses src/app/not-found.tsx, not the (app) one.
