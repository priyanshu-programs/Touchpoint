# Contributing to Touchpoint

Every change reaches `main` through a pull request. `main` is what production runs, so GitHub refuses a direct push, a force push, and any merge before CI has passed.

## The flow

```
git switch -c feat/x  →  commits  →  git push  →  pull request
                                                   ├─ CI: audit, lint, typecheck, Vitest, Playwright  (must pass)
                                                   ├─ Vercel preview on its own copy of the database  (click through it)
                                                   └─ squash merge → main → production deploy → branch deleted
```

1. **Branch** from an up-to-date `main`:
   ```bash
   git switch main && git pull
   git switch -c feat/short-name      # or fix/, chore/, docs/
   ```
2. **Commit** as often as you like. The commits are squashed into one when the PR merges, so they don't need to be tidy.
3. **Push** and open a pull request:
   ```bash
   git push -u origin feat/short-name
   gh pr create
   ```
   The template asks how the change was tested, whether it has a migration, and whether it touches anything in `security.md`.
4. **Check** the PR. CI runs the whole suite (about 12 minutes). Vercel builds a preview at its own address, with its own Neon database branch copied from production, and links it on the PR.
5. **Merge** with "Squash and merge" once CI is green. The PR title becomes the commit on `main`, so write it as what the change does. Production deploys from `main` on its own.
6. **Tidy up**: `git switch main && git pull`. GitHub deletes the merged branch, and Neon deletes its preview database.

## Environments

| | Where | Database |
|---|---|---|
| Local | `http://localhost:3000` | your own, from `.env.local` |
| Preview | one per pull request, behind Vercel's login | a Neon branch copied from production, made for that PR |
| Production | the production domain, deployed from `main` | Neon `main` |

There is no separate staging site: each pull request's preview is where a change is tried before it ships.

## Dependencies

Dependabot opens a pull request each week for minor and patch updates, grouped into one, and each month for GitHub Actions. They go through CI like any other change.

## Conflicts in `updates.md`

Every branch adds lines to the end of `updates.md`, so two open PRs often collide there. GitHub can't resolve that on its own. On your branch, run:

```bash
git fetch && git merge origin/main
git push
```

`.gitattributes` tells git to keep both sides' lines for this file, so the merge needs no hand edits.
