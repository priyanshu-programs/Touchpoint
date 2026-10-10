# Touchpoint

A single-user, self-hostable personal business operating system: CRM, sales pipeline, reusable client workflows, lightweight project tracking, revenue records and an AI assistant.

**Status:** early development (Phase 2, functional foundation). Not ready for use yet.

- Product requirements and architecture: [docs/PRD.md](docs/PRD.md)
- Current phase and work items: [plan.md](plan.md)

## Development

Requirements: Node 24, pnpm, and a PostgreSQL database.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm db:migrate              # create the tables
pnpm dev                     # http://localhost:3000, first visit creates the owner account
pnpm worker                  # in a second terminal: runs reminders and background jobs
```

Tests need a separate, disposable database: set `TEST_DATABASE_URL` in `.env.local`. Its tables are emptied on every run.

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm worker` | Run the background job loop |
| `pnpm db:generate` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm lint` | Lint |
| `pnpm typecheck` | Type-check |
| `pnpm test` | Unit and database tests |
| `pnpm test:e2e` | Browser tests against a production build |
| `pnpm build` | Production build |
