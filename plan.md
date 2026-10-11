# Project Plan — Touchpoint

> **Read this before planning or responding to any task.**

## Purpose

Touchpoint is a single-user, self-hostable personal business operating system for a solo practitioner: CRM, sales pipeline, reusable client workflows, lightweight project tracking, revenue records and an AI assistant. It will be open-sourced so others can run their own instance.

The full product requirements, data model and architecture are in `docs/PRD.md`. That document is the source of truth for scope and design.

## Current Phase

Phase 3 — Core business modules (PRD section 16)

Accepted when PRD journeys 2–6 and 8 pass end to end on desktop and phone widths, and editing one workflow instance leaves its template and sibling instances unchanged.

## Active Work Items

Each step is a vertical slice: migration, module (zod schema, service, queries, tests), screens and server actions, nav entry, Playwright coverage. A step is done when lint, typecheck, Vitest and Playwright pass and it is deployed.

- [x] Step 1: People — organizations, contacts, emails, links, tags; duplicate detection (exact email or domain refused, similar name warned); `/people/contacts` and `/people/organizations`
- [x] Step 2: Tasks and reminders — Today, Week and All views, recurrence, snooze, in-app reminders through the jobs runner; Today dashboard shows what is due; Tasks tab on contacts and organizations. The Calendar view in PRD section 6 is left for the calendar integration (phase 5)
- [ ] Step 3: Activities and timeline — log an interaction with an optional follow-up task; `timeline` view
- [ ] Step 4: Opportunities — value, probability, contacts, won and lost; `src/lib/money.ts`
- [ ] Step 5: Workflow engine — templates, list editor, instances, `transition()`, stage tasks, roadmap, starter templates
- [ ] Step 6: Pipeline board (dnd-kit) and canvas template editor (React Flow)
- [ ] Step 7: Engagements — from a won opportunity, milestones, deliverables, owed and waiting, payment schedule
- [ ] Step 8: Materials — library, versions as links, send logging, proposals
- [ ] Step 9: Search, quick add, custom fields, merge duplicates
- [ ] Step 10: Journey tests on desktop and phone; phase close-out

Left out of Phase 3 on purpose: enrichment (`enrichment_runs`, `field_provenance`, website reader), file uploads and the `files` table (no storage on Vercel), email and push reminder channels (email needs Gmail in Phase 5; push needs a service worker), dashboard filters, money, reports and data export (Phase 4).

Phase 2 (foundation) is complete and live at https://touchpoint-sandy.vercel.app (Vercel `sin1`, Neon `main`, cron-job.org every 15 minutes).

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

Not in Phase 3: money and reports (phase 4), data export (phase 4), Gmail and Calendar (phase 5), AI assistant and key storage (phase 6), file uploads, Docker Compose (phase 7).

Not in v1 at all: multi-user teams, role-based access, payment gateways, accounting sync, automated LinkedIn activity, bulk email campaigns, native mobile apps.
