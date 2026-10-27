---
title: "main has no GitHub branch protection or ruleset yet, though CLAUDE.md says it is protected"
author: L
date: 2026-10-27
branch: feat/journey-tests
id: l-bebad0b5
scope: repo
status: active
src: agent
touches:
  - CLAUDE.md
  - updates.md
---

## Decided
- The four branches of 2026-10-26/27 (chore/git-workflow, docs/qa-steps, feat/journey-tests, feat/invoices) were merged in that order as PRs #1-#4, each rebased onto main after the one before.
- CLAUDE.md keeps one "QA steps — after every feature" section: docs/qa-steps' 7-point version (2026-10-27). feat/journey-tests' shorter copy of the same section was dropped in its rebase.

## Watch out
- As of 2026-10-27, `gh api repos/priyanshu-programs/Touchpoint/branches/main/protection` returns 404 and `/rulesets` returns []. A direct push to main still goes through. CLAUDE.md's Git workflow section and the "main only by squash-merged PR" learning describe protection that was planned, not switched on.
- Every branch appends to updates.md, so each one after the first merge conflicts. .gitattributes (union driver) resolves this in a local rebase, but `git merge-tree` and GitHub's conflict check ignore it.
