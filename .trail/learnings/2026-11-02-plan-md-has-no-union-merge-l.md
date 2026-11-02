---
title: "plan.md has no union merge on purpose, so open PRs that write next to each other there conflict; merge main into the rest after each merge"
author: L
date: 2026-11-02
branch: feat/note-formatting-main
cost: { minutes: 3, tokens: 19965 }
id: l-466e1c96
scope: repo
status: active
src: agent
touches:
  - updates.md
  - plan.md
---

## Decided
- `.gitattributes` keeps both sides only for updates.md (`merge=union`), where every branch adds lines at the end. plan.md must not get union: a paragraph edited on one branch would come back in both its old and new form, without warning.
- When several PRs are open at once, each adds its own plan.md paragraph and doesn't edit a paragraph another open PR adds or edits. After any of them merges, check the rest (`gh pr view <n> --json mergeable`) and merge main into any marked CONFLICTING before the owner sees it.
## Watch out
- 2026-11-02: #50 added a paragraph directly above one that #52 edited, and Git counts neighbouring changes as a conflict. CI and the preview were green; GitHub showed a red Merge status and "Checks awaiting conflict resolution", which the owner took for failing commits.
