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
- [x] Step 3: Activities and timeline — log an interaction (one or more contacts, optional organization) with an optional follow-up task; `timeline` view; Timeline tab on contacts and organizations; "Log activity" in the command palette. There is no Activities item in the navigation because the PRD has no such area
- [x] Between steps 3 and 4: Today also shows contact and organization counts, the week ahead (Coming up) and recent activity, using data from steps 1–3. Pipeline and revenue figures join it with opportunities (step 4) and Phase 4
- [x] Between steps 3 and 4: Companies workspace, asked for by the owner with reference screenshots. Organizations are called companies in the interface; routes, tables and modules keep the name `organizations`
  - [x] Slice 1: top bar with the account menu, collapsible sidebar (icon rail by default, remembered in a cookie, Ctrl+B), sidebar item Companies with Companies and People tabs, wording
  - [x] Slice 2: companies table (monogram until slice 3 adds logos, domain, industry, contacts, last activity, sort, filters), company side panel opened from the list by `?company=<id>`, New company dialog (name and website), add a contact inside a company. The company workspace pages are gone; `/people/organizations/<id>` redirects to the panel
  - [x] Slice 3: built-in enrichment from the company's own website (no third-party API): `enrichment_runs`, `field_provenance`, logos stored in Postgres, SSRF-guarded fetch, fills empty fields only and never overwrites what the owner typed. Reads description, location, website and logo; industry is not read; profile links are kept in the run but not shown. Sites behind bot protection refuse the read and are reported as such
  - [x] Added afterwards at the owner's request: Delete in the company panel, behind a confirmation. The company, its tags, logo and website reads go; its contacts, tasks and activities stay without a company
- [ ] Between steps 3 and 4: company details and configurable fields, asked for by the owner with reference screenshots
  - [x] Slice 1: the Overview tab shows the description beside a Details column (every standard field, a dash where empty); companies have a phone and an email; the website reader fills them, and looks at the site's contact page when the home page leaves contact details out
  - [x] Slice 2: contacts inside the company panel: the Contacts tab is a table with a count and an in-place add; a star marks the company's one primary contact (the first person added gets it); a contact opens in the same panel (`?company=<id>&contact=<id>`) with a way back, its own Overview, Activity and Tasks tabs and a two-column Details list; GitHub is a link type. The full contact page stays for the People list and for contacts without a company. Not built: re-enrich for a person (no free source), Deals and Agent tabs, Owner
  - [x] Added afterwards at the owner's request: a company or person row opens from anywhere on the row; a person opens as a panel over the People list too (the full contact page is gone, its address redirects); the panel slides in from the right and away on close; dropdown lists follow the theme (styled where the browser allows it, the native list in the right theme elsewhere)
  - [x] Added afterwards at the owner's request: the website read also follows the site's team page and keeps the people it names (name and role); the company's Contacts tab offers them under "Found on the website" with Add and Add all, and nobody becomes a contact until the owner adds them. Not built: personal emails or phones (no free source), dismissing a suggestion, people named only on a home or About page
  - [ ] Asked for by the owner with reference screenshots on 2026-10-12, in three steps
    - [x] Step A: the company header shows Re-enrich and a three-dots menu holding Edit, Archive and Delete; a person has the same menu and can be deleted after a confirmation; the status badge of a company and the relationship badge of a person are menus that change it in place. Not built: the reference's Research button, which needs the AI assistant (Phase 6)
    - [ ] Step B: the website read works out the country from the phone code or country domain, reads addresses from microdata, and guesses the industry from a keyword list, each marked as a guess (migration: provenance confidence `guessed`)
    - [ ] Step C: Slice 3 below
  - [ ] Slice 3: a gear on the company's and the contact's Details opens a Fields panel with Companies and Contacts tabs: reorder and hide standard fields, add suggested fields in one click, create custom fields (`custom_field_defs`, pulled forward from Step 9). Values are edited on the Edit forms; the Deals tab of the reference waits for Step 4
- [ ] Step 4: Opportunities — value, probability, contacts, won and lost; `src/lib/money.ts`
- [ ] Step 5: Workflow engine — templates, list editor, instances, `transition()`, stage tasks, roadmap, starter templates
- [ ] Step 6: Pipeline board (dnd-kit) and canvas template editor (React Flow)
- [ ] Step 7: Engagements — from a won opportunity, milestones, deliverables, owed and waiting, payment schedule
- [ ] Step 8: Materials — library, versions as links, send logging, proposals
- [ ] Step 9: Search, quick add, custom fields, merge duplicates
- [ ] Step 10: Journey tests on desktop and phone; phase close-out

Left out of Phase 3 on purpose: key-based enrichment providers and the enrichment review screen (the website reader arrives with the Companies workspace above), file uploads and the `files` table (no storage on Vercel), email and push reminder channels (email needs Gmail in Phase 5; push needs a service worker), dashboard filters, money, reports and data export (Phase 4).

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
- Never pass a time zone name to Postgres. Zone arithmetic happens in `src/lib/time.ts`; queries compare stored dates and instants. (Neon accepts legacy names such as `Asia/Calcutta`; the stock Postgres image used in CI and Docker does not.)
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
