---
title: The logo stays SVG on pages with PNG and ICO only for browser icons; a manifest now exists because iPhones can only go fullscreen from the Home Screen
author: L
date: 2026-11-01
branch: feat/fullscreen
cost: { minutes: 14, tokens: 204558 }
id: l-b17da7c3
scope: repo
status: active
replaces: l-a1a167e4
src: agent
touches:
  - src/components/fullscreen-button.tsx
  - src/app/manifest.ts
  - e2e/36-fullscreen.spec.ts
  - src/components/app-shell.tsx
  - src/app/layout.tsx
  - "src/app/(board)/brainstorm/[id]/page.tsx"
  - "src/app/(board)/workflows/[id]/page.tsx"
  - src/components/ui/sheet.tsx
  - src/app/(app)/people/(lists)/selection.tsx
  - scripts/brand-assets.mjs
---

## Decided
- 2026-10-30: the mark is flat vector, so pages use public/Images/touchpoint-mark.svg. PNG and ICO exist only where Apple, browsers and now the manifest need them. `pnpm brand:assets` regenerates them from public/Images/touchpoint-logo-transparent.svg, which is never edited.
- The ivory and lime mark needs a dark tile (#171717) to read on a light theme, so BrandMark always draws one.
- 2026-11-01, owner's request for fullscreen on every device: src/app/manifest.ts with display fullscreen, plus a button (src/components/fullscreen-button.tsx) using the Fullscreen API on the whole document. No service worker, so no client data is cached on a device.
- viewport themeColor is deliberately unset: it would tint the browser's own bars dark in the light theme. The manifest's theme_color covers the installed app.

## Tried and ruled out
- A social image: left out because this is a private single-owner app, a decision made while building.
- The Fullscreen API alone: iPhone Safari doesn't offer it for pages, so the button shows Add to Home Screen steps there.

## Watch out
- `(display-mode: fullscreen)` also matches a page fullscreened by the button or by F11, so check document.fullscreenElement first or the button hides itself and can't exit.
- Chromium also has webkitFullscreenEnabled: simulating an iPhone in a test means overriding both flags.
- black-translucent makes the iPhone clock white in every theme, hence the dark strip of safe-area height in src/app/layout.tsx.
- scripts/brand-assets.mjs rewrites touchpoint-mark.svg and icon.svg with LF, which shows as modified on Windows; content is unchanged.
- SVGs render at 316 wide in sharp, so a larger PNG needs a higher density or it blurs.
- Files under /Images have a one-day browser cache because the filename carries no version.
- A new page outside the app shell and board headers shows no logo by itself: use BrandLockup. An unknown address uses src/app/not-found.tsx, not the (app) one.
