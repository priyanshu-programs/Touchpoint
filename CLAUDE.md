# Touchpoint — Agent Instructions

## Graft — use first, always

Before ANY file search, code lookup, or symbol trace, use Graft MCP tools:

- `graft_find_code` — find ranked nodes relevant to the current task
- `graft_file_api` — get function/class signatures for a specific file
- `graft_trace_calls` — trace callers or callees for a symbol
- `graft_find_all` — regex search grouped by symbol
- `graft_repo_map` — get an orientation overview of the whole repo
- `graft_check_freshness` — verify the graph is current before relying on it

Only fall back to Glob, Grep, or Read when Graft returns nothing relevant.
Run `graft build` in the terminal if `graft_check_freshness` reports the graph is stale.

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

## General coding rules

- No comments unless the WHY is non-obvious
- No error handling for impossible scenarios
- Validate only at system boundaries (user input, external APIs)
- No speculative abstractions — only what the current task requires
- Never hard-code secrets; use environment variables
