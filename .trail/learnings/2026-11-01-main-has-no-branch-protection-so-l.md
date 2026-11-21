---
title: "main has no branch protection, so gh pr merge --auto merges at once even while CI is red or re-running"
author: L
date: 2026-11-01
branch: main
cost: { minutes: 1, tokens: 1284 }
id: l-567f8d4e
scope: repo
status: active
src: agent
touches:
  - CLAUDE.md
  - CONTRIBUTING.md
---

## Watch out
2026-11-01: `gh api repos/priyanshu-programs/Touchpoint/branches/main/protection` answers 404 "Branch not protected" and there are no rulesets, although CLAUDE.md and CONTRIBUTING.md say main takes only a PR with a green `check`. With no required check, `gh pr merge <n> --squash --auto` doesn't wait: PR #45 merged within seconds while its failed `check` was being re-run, and main deploys to production on merge.
Until protection is switched on, wait for `gh pr checks <n>` to show `check` passing before merging, because --auto has nothing to wait for.

## Decided
Left as it is, because switching protection on is a repository setting for the owner to change, not something a session changes by itself.
