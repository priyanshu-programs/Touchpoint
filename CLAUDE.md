# Touchpoint — Agent Instructions

## Trail — use first, always

Before ANY file search, code lookup, or symbol trace, use the `trail` CLI:

- `trail ask "<task>" --source` — find ranked nodes for the task, with code inlined at file:line
- `trail grep "<literal>"` — every occurrence, grouped by enclosing symbol
- `trail skeleton <file>` — a file's function/class signatures and spans
- `trail callers <sym> [--direction out] [--depth N|all]` — callers or callees; run before changing a symbol
- `trail map` — an orientation overview of the whole repo

When the `mcp__trail-code__trail_*` tools are listed, use them in place of the CLI
(find_code = ask, find_all = grep, trace_calls = callers, file_api = skeleton,
repo_map = map); the CLI is the fallback.

Only fall back to Glob, Grep, or Read when trail returns nothing relevant.
Run `trail check` before committing, pushing, or opening a PR.

## Required reading — before every reply or code change

1. Read `plan.md` — understand the current project phase and active work items
2. Read `updates.md` — understand recent changes before adding more

Do not skip this step even for small changes. These files are the authoritative
source of project intent and recent state.

## Required reading — before writing code or creating a plan

3. Read `security.md` — apply every rule there to any new code you write

If a planned feature conflicts with a rule in `security.md`, flag it before
implementing and suggest a compliant approach.

## Change logging — after every change

After completing any change (file edit, config update, package install, etc.),
append a one-line entry to `updates.md` in this exact format:

```
- [YYYY-MM-DD] <what changed and why>
```

Never batch multiple changes into one line — one line per distinct change.

## Git workflow — nothing goes straight to `main`

`main` is protected on GitHub: it takes only a squash-merged pull request whose CI
`check` is green, and it deploys to production. See `CONTRIBUTING.md` for the full flow.

1. Start from an up-to-date `main`: `git switch main && git pull`, then
   `git switch -c <type>/<short-kebab>` where type is `feat`, `fix`, `chore` or `docs`.
2. Commit on the branch. Run `trail check` before pushing, then `git push -u origin <branch>`.
3. Open the PR with `gh pr create`, filling in `.github/pull_request_template.md`.
4. Wait for CI and the Vercel preview. The owner clicks through the preview and merges,
   or asks you to (`gh pr merge --squash --auto`). Never merge without being asked.
5. After the merge: `git switch main && git pull`. The branch is deleted on GitHub by itself.

A parallel session works in its own git worktree (`claude --worktree`, or EnterWorktree),
never in the shared checkout, because switching branches there changes the files under
every other window. If a PR conflicts on `updates.md`, run `git merge origin/main` on the
branch (`.gitattributes` keeps both sides' lines) and push.

## QA steps — after every feature

The owner tests every feature by hand. When a feature or fix is shipped (PR open and the
preview is up, or merged), end the reply with a **"Try it yourself"** section the owner can
follow without reading any code:

1. **Where** — the link to open (the PR's Vercel preview, or `corepack pnpm dev` →
   http://localhost:3000) and the page to start on.
2. **Steps** — numbered, one action each: what to click, and what to type, with a real
   example value in quotes (e.g. type "Maple Studio" in Name, "hello@maple.test" in Email).
   Use made-up names, never real client data.
3. **What you should see** — after each step that changes something, the result in plain
   words ("Maple Studio appears at the top of the list").
4. **End to end** — follow the data all the way: create it, then find it where else it shows
   up (list, search, the record's tabs, Today), refresh the page to check it was saved, then
   edit or delete it.
5. **Should be refused** — at least one wrong input and the exact message the app shows
   (e.g. add "hello@maple.test" again → the duplicate-email message, quoted word for word).
6. **On a phone** — if the feature has a phone layout, repeat the key steps at phone width
   (browser dev tools, or narrow the window).
7. **Clean up** — how to remove the test data, if it should go.

No jargon, file paths or code in these steps. Keep it short: what someone needs to try it,
nothing more.

## General coding rules

- No comments unless the WHY is non-obvious
- No error handling for impossible scenarios
- Validate only at system boundaries (user input, external APIs)
- No speculative abstractions — only what the current task requires
- Never hard-code secrets; use environment variables

## QA steps — after every feature

The owner checks every feature by hand. After finishing any feature or fix, end the
reply with a short **"Try it yourself"** list:

- Numbered steps in plain words: where to click, what to type, what should appear.
- Run against the app the owner will open: `corepack pnpm dev` locally, or the PR preview.
- Include at least one thing that should be refused or warned about, and what it says.
- If the feature has a phone layout, end with the same check at phone width
  (browser dev tools, or the window narrowed).
- Use made-up names for the data, and no code, file paths or jargon.
