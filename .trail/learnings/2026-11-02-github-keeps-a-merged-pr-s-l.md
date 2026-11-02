---
title: "GitHub keeps a merged PR's branch while another PR targets it, so a stacked PR then merges into that branch, not main"
author: L
date: 2026-11-02
branch: feat/note-formatting-main
cost: { minutes: 1, tokens: 1733 }
id: l-7c182498
scope: repo
status: active
src: agent
---

## Tried and ruled out
- Stacking a PR on an unmerged PR's branch (2026-11-02, #51 on #49): #49 was squash-merged, GitHub didn't delete its branch because #51 still targeted it, so #51 kept that base and merged into the dead branch, not main.
## Decided
- Open every PR against main. When work needs an unmerged PR, branch from main after that PR merges. If a stack can't be avoided, once the base PR merges run `gh pr edit <n> --base main` and merge main into the branch before merging it.
## Watch out
- A purple Merged badge doesn't mean the change is on main: check `gh pr view <n> --json baseRefName`. To recover, apply `git diff <base branch head> <stacked head>` onto a new branch from main.
