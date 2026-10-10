# Change Log — Touchpoint

> **Read this before making any change** — it tells you what has happened recently.
> **Append one line after every change** in the format: `- [YYYY-MM-DD] <what and why>`

---

- [2026-10-10] Initialized project: git repo, Graft 0.21.1, CLAUDE.md, plan.md, updates.md, security.md, global ~/.claude/CLAUDE.md
- [2026-10-10] Added docs/PRD.md: approved product requirements, data model and architecture, so scope and design have one source of truth
- [2026-10-10] Rewrote plan.md with purpose, Phase 2 work items, stack and the $0/month constraint, replacing the template placeholders
- [2026-10-10] Added project-specific notes to security.md: two approved deviations (database sessions, Lax OAuth state cookie) and Touchpoint security rules
- [2026-10-10] Installed pnpm 12.11.2 globally via npm, because corepack could not write to Program Files
- [2026-10-10] Scaffolded Next.js 16.4.0 (App Router, TypeScript, Tailwind v4, ESLint) into the repo root as the application base
- [2026-10-10] Added drizzle-orm, pg, better-auth, zod and dev tools (drizzle-kit, vitest, Playwright, tsx) at pinned versions for the Phase 2 stack
- [2026-10-10] Dropped the planned uuid dependency (release too new for pnpm's age policy); primary keys use Postgres gen_random_uuid() instead, PRD updated
- [2026-10-10] Allowed esbuild build scripts in pnpm-workspace.yaml so tsx and drizzle-kit can run
- [2026-10-10] Turned off cacheComponents in next.config.ts because nonce-based CSP requires per-request rendering
- [2026-10-10] Added security headers in next.config.ts and a per-request nonce CSP in src/proxy.ts, per security.md
- [2026-10-10] Added src/lib/env.ts (zod-validated environment) and .env.example so missing configuration fails fast without leaking values
- [2026-10-10] Added src/lib/logger.ts for structured JSON logs with secret redaction
- [2026-10-10] Added Vitest config and tests for env, logger and CSP; added typecheck and test scripts, .nvmrc and Node 24 engines field
- [2026-10-10] Replaced the create-next-app sample page, README and SVGs with Touchpoint equivalents; ESLint now ignores .claude and graft
- [2026-10-10] Added src/db/client.ts (single pg pool with Drizzle) so the same driver works on Vercel, Docker and CI
- [2026-10-10] Added src/lib/auth.ts (Better Auth: email and password, database rate limiting, UUID ids, telemetry off)
- [2026-10-10] Generated src/db/schema/auth.ts with the official Better Auth CLI (auth@1.7.7)
- [2026-10-10] Added src/db/schema/core.ts with settings, audit_log and jobs tables for the Phase 2 foundation
- [2026-10-10] Added drizzle.config.ts, db:generate and db:migrate scripts, and generated migration 0000_foundation.sql (not yet applied to any database)
- [2026-10-10] Deferred the citext, pg_trgm and vector extensions to the migrations that first need them, since stock local Postgres lacks pgvector
- [2026-10-10] Created free Neon project touchpoint (Singapore, Postgres 17) with main, dev and test branches; applied migration 0000 to dev
- [2026-10-10] Added .env.local (gitignored) with the dev and test connection strings and generated secrets for local development
- [2026-10-10] Added src/modules/jobs (enqueue with dedupe, SKIP LOCKED claim, retry with backoff, stale-lock release, heartbeat tick) as the single job runner for both run modes
- [2026-10-10] Added POST/GET /api/jobs/tick protected by CRON_SECRET, and worker.ts with a pnpm worker script for container mode
- [2026-10-10] Added src/modules/audit (transactional audit writes, keyset-paginated listing)
- [2026-10-10] Added src/modules/settings (strict zod schema, upsert with audit); time zones validate by Intl lookup because the runtime list omits aliases such as Asia/Kolkata
- [2026-10-10] Vitest now migrates and uses the Neon test branch, with files run serially because database tests share tables
- [2026-10-10] Initialised shadcn/ui (Base UI style) and added button, input, label, card, command, dialog, skeleton, table, badge and native-select components
- [2026-10-10] Switched dark mode to prefers-color-scheme so no inline theme script is needed under the nonce CSP
- [2026-10-10] Completed Better Auth setup: single-owner sign-up guard, sign-in and sign-up attempt logging, /api/auth route, client, getOwner and requireOwner helpers
- [2026-10-10] Added /setup and /sign-in screens; the first account becomes the owner and later sign-ups are refused server-side
- [2026-10-10] Added /onboarding (business profile plus what is optional) and the settings save, change password, revoke session and sign out server actions
- [2026-10-10] Added the app shell (sidebar, mobile bottom bar, Ctrl+K command palette, skip link) and the Today page with loading and error states
- [2026-10-10] Added Settings screens: Profile, Security (password, sessions), System status (database, scheduler, version) and Audit log
- [2026-10-10] CSP now adds upgrade-insecure-requests only when APP_URL is https, so plain-http self-hosting keeps working
- [2026-10-10] Added Playwright end-to-end suite (11 tests) covering first run, closed sign-up, auth guard, settings, audit, scheduler, headers, mobile and rate limiting
- [2026-10-10] Moved shadcn to devDependencies because pnpm audit flagged its braces dependency and it is only needed at build time
- [2026-10-10] Added .github/workflows/ci.yml (audit, lint, typecheck, unit and e2e tests with a Postgres service); not yet run on GitHub
- [2026-10-10] Added vercel.json with a migrate-then-build command and the daily backup cron; not yet deployed
- [2026-10-11] First commit pushed to github.com/priyanshu-programs/Touchpoint (main)
- [2026-10-11] APP_URL now falls back to Vercel's production domain, so the first deploy does not need the URL in advance; src/proxy.ts reads it through env.ts
- [2026-10-11] Pinned Vercel functions to sin1 in vercel.json to sit next to the Singapore database
- [2026-10-11] Applied migration 0000 to the Neon main (production) branch
- [2026-10-11] Added .env.vercel-production (gitignored) holding the production DATABASE_URL, AUTH_SECRET and CRON_SECRET for pasting into Vercel
- [2026-10-11] Added docs/DEPLOYMENT.md with the Vercel, Neon and cron-job.org steps; the Vercel connector could not create the project (403), so the owner imports the repo in the dashboard
- [2026-10-11] drizzle.config.ts now fails with "DATABASE_URL is not set" and where to set it, after the first Vercel build died on an opaque empty-url error
- [2026-10-11] docs/DEPLOYMENT.md: environment variables must be saved before the first deploy, plus a troubleshooting row for the missing DATABASE_URL build failure
