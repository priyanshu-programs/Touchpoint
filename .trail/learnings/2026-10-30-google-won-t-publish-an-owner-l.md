---
title: "Google won't publish an owner's OAuth client until public /about and /privacy pages pass its branding check"
author: L
date: 2026-10-30
branch: fix/google-public-pages
cost: { minutes: 12, tokens: 55120 }
id: l-48d16898
scope: repo
status: active
src: agent
touches:
  - ".env.example"
  - docs/PRD.md
  - e2e/29-public-pages.spec.ts
  - plan.md
  - playwright.config.ts
  - security.md
  - src/app/(app)/settings/integrations/page.tsx
  - src/app/(auth)/sign-in/page.tsx
  - src/app/(public)/about/page.tsx
  - src/app/(public)/layout.tsx
---

## Decided
2026-10-30: public /about and /privacy pages (src/app/(public)), no session and no database reads, and GOOGLE_SITE_VERIFICATION for Search Console's HTML-tag ownership check. The owner enters APP_URL/about and APP_URL/privacy on Google Auth Platform → Branding, then publishes on Audience. Until Google accepts them, the owner connects in Testing with their Gmail as a test user and reconnects every 7 days.

## Tried and ruled out
- Leaving Branding's App domain fields empty: once Google has run a branding check on the app, home page and privacy policy become required and Save stays disabled, even with the logo removed.
- Using the app's root address for home page and privacy: Google refused it as behind a login (/ redirects to /sign-in), not explaining the app, with no privacy content, and not registered to the owner in Search Console.

## Watch out
- A vercel.app subdomain can't be verified by DNS: use a Search Console URL-prefix property with the HTML tag, which src/app/layout.tsx puts on every page from GOOGLE_SITE_VERIFICATION. If Google can't see it on / (a redirect), fall back to the HTML file in public/.
- Keep /privacy's Limited Use sentence and its list of Google data in step with the scopes Connect asks for (src/integrations/google/oauth.ts). Adding calendar.events or Gmail scopes means updating the page.
