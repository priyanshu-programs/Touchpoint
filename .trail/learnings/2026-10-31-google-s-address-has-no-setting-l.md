---
title: "Google's address has no setting: e2e moves the app's calls from outside, and adapter fixtures are recorded by the owner once"
author: L
date: 2026-10-31
branch: feat/phase-5-step-6
cost: { minutes: 20, tokens: 287245 }
id: l-9e457c2f
scope: repo
status: active
src: agent
touches:
  - e2e/fake-google/server.mjs
  - e2e/fake-google/reroute.mjs
  - playwright.config.ts
  - e2e/33-google.spec.ts
  - src/integrations/google/fixtures/scrub.ts
  - src/integrations/google/fixtures/scrub.test.ts
  - src/integrations/google/fixtures/events.json
  - src/integrations/google/fixtures/answers.json
  - src/integrations/google/calendar.fixtures.test.ts
  - src/integrations/google/oauth.fixtures.test.ts
---

## Decided
- 2026-10-31, Phase 5 step 6: e2e/fake-google/reroute.mjs wraps fetch through NODE_OPTIONS in Playwright's webServer.env only, so the app has no setting that could send Google tokens elsewhere. e2e/33-google.spec.ts runs the real Google code against e2e/fake-google/server.mjs.
- Owner's choice: fixtures in src/integrations/google/fixtures are real answers, recorded once by the owner with `pnpm fixtures:google` and scrubbed by an allowlist (the repo will be public). Until then they are marked documented. Tests read what they expect from the files so a recording can replace them.
- Phase 5 acceptance is held until the 8-day token rule can pass, 2026-11-08 10:45 UTC at the earliest (decision shown with the plan), in a small PR of its own.

## Tried and ruled out
- An environment variable naming Google's address: a wrong setting in production could send tokens elsewhere.
- Fixtures written only from Google's docs: quicker, but they only prove the code matches the docs. Kept only as the starting point.

## Watch out
- integration_connections.connected_at is overwritten on every connect, so Reconnect or Allow scheduling on production restarts the 8 days. Remove access at Google only as the checklist's last step (docs/GOOGLE-CHECKLIST.md).
- Local and production share one Google client and account: Disconnect on the local copy can end production's access.
