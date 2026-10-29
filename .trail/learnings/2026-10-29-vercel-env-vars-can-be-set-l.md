---
title: "Vercel env vars can be set from a session through the Vercel MCP's create_project_env, with no CLI installed"
author: L
date: 2026-10-29
branch: feat/connect-google
cost: { minutes: 1, tokens: 6916 }
id: l-4525f942
scope: repo
status: active
src: agent
touches:
  - updates.md
  - ".env.example"
  - docs/PRD.md
  - e2e/28-integrations.spec.ts
  - package.json
  - plan.md
  - playwright.config.ts
  - pnpm-lock.yaml
  - security.md
  - src/app/(app)/layout.tsx
---

## Decided
2026-10-29: APP_ENCRYPTION_KEY was set for project touchpoint (prj_0tL22NXuKsNV8iAjy1zuf2v8KcOX, team team_jHRr8OhWOuyY4SO7HSIkVKMj) with mcp__vercel__create_project_env, two entries in one call: type "sensitive", one target ["production"], one ["preview"], different values. The owner asked for it to be done for them.

## Tried and ruled out
- The Vercel CLI: not installed on this machine (npx refuses without --yes), and the repo has no .vercel link.

## Watch out
- A value set this way passes through the session transcript. Generate secrets with node's crypto, and write the local one into .env.local with printf so it is never printed.
- Production and Preview must never share APP_ENCRYPTION_KEY, AUTH_SECRET or CRON_SECRET (security.md, preview deployments).
- "sensitive" values read back empty, even to the owner; to change one, set it again with upsert "true".
