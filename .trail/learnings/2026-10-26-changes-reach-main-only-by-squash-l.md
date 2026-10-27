---
title: Changes reach main only by squash-merged PR with green CI; PR previews on their own Neon branch stand in for staging
author: L
date: 2026-10-26
branch: chore/git-workflow
cost: { minutes: 12, tokens: 209729 }
id: l-a6b04413
scope: repo
status: active
src: agent
touches:
  - src/lib/env.ts
  - src/lib/env.test.ts
  - ".github/workflows/ci.yml"
  - ".github/pull_request_template.md"
  - ".github/dependabot.yml"
  - ".gitattributes"
  - CLAUDE.md
  - CONTRIBUTING.md
  - docs/DEPLOYMENT.md
  - security.md
---

## Decided
- Owner's choice, 2026-10-26: local → PR preview → production. No separate staging site; for a solo developer each PR's Vercel preview does staging's job.
- main is protected by a GitHub ruleset with no bypass actors: PR required (0 approvals, since a solo owner can't approve their own), required check `check` (the CI job in .github/workflows/ci.yml), no force-push or deletion, squash merge only. Branch need not be up to date (strict off), so a 12-minute CI rerun isn't forced every time main moves; CI on push to main catches combinations.
- Previews use a Neon branch per preview via the Neon–Vercel integration, Preview environment only. Rules are in security.md ("Preview deployments"), flow in CONTRIBUTING.md and CLAUDE.md "Git workflow".

## Tried and ruled out
- A long-lived staging branch/site: second DB and secrets to keep in sync, with no other people's changes to integrate.
- Merge commits or rebase merges: squash keeps one commit per feature on main and makes reverts simple.
- PRs by convention only, or with an admin bypass: an accidental push to main would ship straight to production.

## Watch out
- vercel.json's buildCommand runs `pnpm db:migrate` on every build, previews included. If Preview ever has production's DATABASE_URL, an unmerged branch migrates the production database.
- src/lib/env.ts parseEnv: in a preview, APP_URL comes from VERCEL_BRANCH_URL. Before this it fell back to VERCEL_PROJECT_PRODUCTION_URL, which made Better Auth and the Origin checks (src/lib/upload.ts, the scene routes) refuse requests on the preview's own address. If the Vercel PR comment links the per-deployment URL instead of the branch alias, switch to VERCEL_URL.
- Parallel Claude sessions must each use their own git worktree; switching branches in the shared checkout changes the files under every other window.
- updates.md conflicts between open PRs: .gitattributes sets merge=union, but GitHub's web merge ignores it, so merge origin/main into the branch locally and push.
