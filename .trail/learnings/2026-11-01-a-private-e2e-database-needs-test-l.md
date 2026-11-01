---
title: "A private e2e database needs TEST_DATABASE_URL set in the shell, because 01-foundation imports the real Playwright config"
author: L
date: 2026-11-01
branch: feat/auto-links
cost: { minutes: 35, tokens: 56074 }
id: l-72ffd57e
scope: repo
status: active
src: agent
touches:
  - e2e/01-foundation.spec.ts
  - playwright.config.ts
  - e2e/global-setup.ts
---

## Decided
To run e2e beside another window's run: export TEST_DATABASE_URL to a private database, migrate it first, and use a throwaway config on another port without the fake Google server, for specs that don't touch Google.

## Tried and ruled out
Setting process.env.DATABASE_URL only in a temporary config: e2e/01-foundation.spec.ts imports ../playwright.config, which resets DATABASE_URL in the worker to TEST_DATABASE_URL. The app stayed on the private database while a spec's own Pool wrote to the shared one.

## Watch out
Symptoms were a foreign key failure, then a duplicate on integration_connections_owner_provider_idx, from rows the other window's run held. A new database also needs migrating before the server starts: Playwright waits on /sign-in, which returns 500 without tables, and the timeout looks like a slow build.
