# Project Plan — Touchpoint

> **Read this before planning or responding to any task.**

## Purpose

Touchpoint is a single-user, self-hostable personal business operating system for a solo practitioner: CRM, sales pipeline, reusable client workflows, lightweight project tracking, revenue records and an AI assistant. It will be open-sourced so others can run their own instance.

The full product requirements, data model and architecture are in `docs/PRD.md`. That document is the source of truth for scope and design.

## Current Phase

Phase 2 — Functional foundation (PRD section 16)

## Active Work Items

- [x] Step 0: record decisions in the repo (PRD, plan, security notes)
- [x] Step 1: scaffold (Next.js 16, Tailwind, env validation, security headers, logger); shadcn/ui is added with the app shell in Step 4
- [x] Step 2: database (Neon project `touchpoint` in Singapore with `main`, `dev`, `test` branches; migration 0000 applied to dev)
- [x] Step 3: authentication and owner model (Better Auth, `/setup`, `requireOwner()`)
- [x] Step 4: app shell and design system
- [x] Step 5: onboarding and settings
- [x] Step 6: jobs runner (tick endpoint and worker loop)
- [x] Step 7: audit log
- [x] Step 8: CI and first deployment — live at https://touchpoint-sandy.vercel.app (Vercel `sin1`, Neon `main`), CI green. Verified on the live site: security headers and CSP, auth redirects, tick endpoint 401 without the secret and 200 with it, owner account created and onboarded, further sign-ups refused with 403, and a scheduler run from cron-job.org recorded in the database.

Phase 2 is complete. Phase 3 (core business modules, PRD section 16) has not been planned yet.

Known gaps in Phase 2 work:

- Change password and revoke session are implemented but only checked for rendering, not exercised end to end.
- The tick endpoint relies on its secret and has no separate rate limit.
- Auth redirects are done per page with `requireOwner()`, not in `src/proxy.ts`.

## Key Decisions & Constraints

- **$0/month hard constraint.** Only free tiers; never make a paid service a requirement.
- Hosting: Vercel Hobby (web), Neon Free (Postgres), cron-job.org (scheduler, every 15 minutes), Vercel daily cron as backup.
- The Docker path (web + worker + Postgres) must keep working for open-source users.
- Stack: Next.js 16 App Router, TypeScript, Node 24, pnpm, Tailwind v4, shadcn/ui, Drizzle, Better Auth, zod, Vitest, Playwright.
- Jobs: own `jobs` table claimed with `FOR UPDATE SKIP LOCKED`; one `runDueJobs()` used by both the tick endpoint and the worker loop.
- Dependency rule: `app → modules → db`. Business logic lives in `src/modules/*`, never in UI or provider code.
- Every table has `owner_id`; every query filters on it.
- Domain tables are added by migration in the phase that builds their module.
- Navigation shows only screens that exist. No dead links or placeholder buttons.
- Uses Graft for codebase navigation (mandatory — see CLAUDE.md)
- All changes logged in updates.md
- Security rules in security.md must be applied before writing any code

## Architecture Notes

See `docs/PRD.md` sections 7 (architecture), 8 (data model), 9 (workflow engine), 11 (integrations), 12 (AI) and 13 (security).

## Out of Scope (for now)

Not in Phase 2: contacts, workflows, money, Gmail and Calendar, AI assistant, key storage, file uploads, Docker Compose (phase 7), data export (phases 3–4).

Not in v1 at all: multi-user teams, role-based access, payment gateways, accounting sync, automated LinkedIn activity, bulk email campaigns, native mobile apps.
