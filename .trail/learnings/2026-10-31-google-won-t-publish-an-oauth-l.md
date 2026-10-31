---
title: "Google won't publish an OAuth client until public /about and /privacy pass its branding check; the owner's client is now in production"
author: L
date: 2026-10-31
branch: docs/google-client-in-production
cost: { minutes: 14, tokens: 132036 }
id: l-135e18e9
scope: repo
status: active
replaces: l-48d16898
src: agent
touches:
  - docs/GOOGLE-CHECKLIST.md
  - plan.md
  - docs/PRD.md
  - src/app/layout.tsx
  - src/integrations/google/oauth.ts
  - src/db/schema/integrations.ts
  - updates.md
---

## Decided
2026-10-30: public /about and /privacy pages (src/app/(public)), no session and no database reads, and GOOGLE_SITE_VERIFICATION for Search Console's HTML-tag ownership check. The owner enters APP_URL/about and APP_URL/privacy on Google Auth Platform → Branding, then publishes on Audience.
2026-11-01: the owner confirmed their client is in production, unverified. Don't ask them again or describe it as in Testing. The 8-day check in docs/GOOGLE-CHECKLIST.md stands because Google doesn't spell out token life for unverified apps (docs/PRD.md section 11), not because of Testing.

## Tried and ruled out
- Leaving Branding's App domain fields empty: once Google has run a branding check on the app, home page and privacy policy become required and Save stays disabled, even with the logo removed.
- Using the app's root address for home page and privacy: Google refused it as behind a login (/ redirects to /sign-in), not explaining the app, with no privacy content, and not registered to the owner in Search Console.

## Watch out
- A vercel.app subdomain can't be verified by DNS: use a Search Console URL-prefix property with the HTML tag, which src/app/layout.tsx puts on every page from GOOGLE_SITE_VERIFICATION. If Google can't see it on / (a redirect), fall back to the HTML file in public/.
- Keep /privacy's Limited Use sentence and its list of Google data in step with the scopes Connect asks for (src/integrations/google/oauth.ts). Adding calendar.events or Gmail scopes means updating the page.
- Someone else setting up their own client still starts in Testing, where a connection ends after 7 days; the setup steps in Settings → Integrations are right for them and were left as they are.
