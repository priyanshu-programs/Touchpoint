# Touchpoint — Product Requirements and Architecture

Approved by the owner on 2026-10-10. Current phase and active work are tracked in `plan.md`.

## 0. Decisions

| Item | Decision |
|---|---|
| Cost | **The whole system must run at $0/month.** Every component has a free path; paid services are optional upgrades only |
| Hosting | Free tiers of managed services: Vercel Hobby, Neon Free, cron-job.org (section 14) |
| Mailbox | Personal @gmail.com with the owner's own Google OAuth client (section 11) |
| `security.md` deviations | The two points in section 13 are approved |
| Licence | Not chosen yet; needed before phase 7 |

---

## 1. Product summary

Touchpoint is a single-user, self-hostable workspace for a solo practitioner. It combines a CRM, a sales pipeline, lightweight project tracking, revenue records and an AI assistant, and it will later be open-sourced so others can run their own instance.

It must answer five questions at any time:

1. Who should I be talking to?
2. What has happened with each person or company?
3. What should I do next?
4. Which opportunities can generate revenue?
5. Is my business development working?

**Principles**

- Core CRM works with zero external services configured (no AI key, no Gmail, no enrichment).
- One source of truth per fact. Derived values (invoice status, time in stage, pipeline stage) are computed, not stored twice.
- Money is never guessed. Received, invoiced, outstanding, contracted and forecast are five separate numbers.
- The system never claims an email was sent, a reminder scheduled, or a payment received unless the responsible system confirmed it.
- The AI reads real records, shows its sources, and cannot take external actions without confirmation.

**Non-goals for v1:** multi-user teams, role-based access, payment gateway integration, accounting sync, automated LinkedIn activity, bulk email campaigns, mobile native apps.

---

## 2. Zero-cost bill of materials

| Need | Free choice | Limit to know |
|---|---|---|
| App hosting | See section 14 | Depends on choice |
| Database | Postgres in a container (VM/local), or Neon Free, or Supabase Free | Neon: 1 GB, 100 CU-hours/project/month, sleeps after 5 min. Supabase: 500 MB, pauses after 7 idle days |
| Scheduler (serverless hosting only) | cron-job.org or Upstash QStash | cron-job.org: 1-minute minimum, 30 s timeout. QStash: about 1,000 messages/day, 10 schedules |
| File storage | Local disk on a VM/PC; links-only when no storage is configured | Vercel has no persistent disk |
| Email and calendar | Gmail API and Google Calendar API | Free; restricted-scope rules in section 11 |
| Reminders | In-app, browser push, and email through the user's own Gmail | No paid email service |
| AI (optional) | Google Gemini API free tier, or local Ollama | Free tiers are rate-limited and may use prompts for training; check terms before sending client data |
| Enrichment (optional) | Built-in public-website reader; Hunter free tier | Hunter about 25 searches/month |
| Domain and TLS | `*.vercel.app`, or a free DuckDNS subdomain with Caddy + Let's Encrypt | Google OAuth needs an HTTPS hostname, not a bare IP |
| Backups | `pg_dump` to local disk or Google Drive | Neon Free keeps 6 hours of history only |

---

## 3. Scope

**MVP (v0.1) — useful with no integrations**

- Owner account, onboarding wizard, settings
- Contacts and organizations (both independent and organization-linked contacts), tags, custom fields, duplicate detection
- Unified activity timeline with manual logging (notes, calls, meetings, LinkedIn, emails pasted or summarised)
- Opportunities, pipeline board and list
- Workflow templates (visual editor), per-client workflow instances, Kanban, stage history
- Engagements with milestones, deliverables, risks, blockers, pending decisions
- Tasks, follow-ups, recurring tasks, reminders, Today and Week views
- Materials library with manual send logging
- Invoices, payments, allocations, revenue dashboard, core reports
- Global search, command palette, quick add
- Data export (JSON + CSV), audit log

**v0.2 — integrations:** Gmail read and send, Google Calendar read and create, thread-to-contact matching, sent-material detection, meeting links.

**v0.3 — AI assistant:** chat with tools, summaries, drafting, task creation, inspectable memory, meeting briefings, suggested next actions.

**v1.0 — open-source release:** Docker Compose, `.env.example`, setup and troubleshooting docs, backup and restore guide, licence (choice still to be made by the owner).

**Later:** semantic search with embeddings, enrichment provider plugins, recurring income automation, multi-currency reporting with rate tables, Outlook adapter, Gmail push sync, configurable AI autonomy.

**Optional extensions:** payment gateway and accounting integrations, additional users, public client portal.

---

## 4. Core concepts

| Concept | Meaning | Key relationships |
|---|---|---|
| Contact | A person | Belongs to zero or one organization; many emails |
| Organization | A company or agency | Has many contacts, opportunities, engagements |
| Opportunity | A possible deal with a value and probability | One organization (optional), many contacts; has one workflow instance as its pipeline |
| Engagement | Paid work in progress or completed | May originate from a won opportunity; has milestones, deliverables, invoices |
| Workflow template | A reusable set of stages and paths | Copied when applied |
| Workflow instance | One client's private copy of a workflow | Belongs to exactly one opportunity, engagement or contact |
| Activity | Something that happened (note, call, email, meeting) | Links to contacts, organization, opportunity, engagement |
| Task | Something to do | One row with optional links to any record; shown everywhere relevant, counted once |
| Material | A thing that can be sent (proposal, deck, link) | Has versions; each send is its own record |
| Invoice | A request for payment | Has lines; status derived from payments |
| Payment | Money actually received | Allocated to one or more invoices |

Opportunity, engagement and client relationship are separate on purpose: one organization can have several opportunities, several engagements, and work continuing long after a deal is won.

---

## 5. Primary user journeys

1. **First run.** Open the app, create the owner account, set currency and time zone, see which integrations are optional, land on an empty dashboard with seed workflow templates.
2. **Add and qualify a prospect.** Quick add a name and company domain; duplicates are flagged; optional enrichment shows candidates for review; apply the Prospecting workflow; a first follow-up task is generated.
3. **Daily review.** Dashboard shows overdue and due-today follow-ups, meetings, stalled opportunities and suggested next actions; each item opens the record in context.
4. **Log an interaction.** From a contact (desktop or mobile), record a call note, an outcome and a follow-up date in one form; the timeline and task list update together.
5. **Move a deal.** Drag an opportunity on the board, or advance it in its roadmap; required checklist items are checked; skipping them is allowed with a reason and recorded as an exception.
6. **Win and deliver.** Mark an opportunity won; create an engagement from it; apply a delivery workflow; add milestones and a payment schedule.
7. **Get paid.** Issue an invoice, record a payment against it, see outstanding balance fall and received revenue rise; a second identical payment is flagged before saving.
8. **Send and track a material.** Add a proposal to the library, log that it was sent to two contacts, and later see it on both contacts' pages.
9. **Review the business.** Open Reports to see conversion by stage, lost reasons, revenue by month and client, time to payment; metrics with no data say "not enough data", not zero.
10. **Ask the assistant (v0.3).** "What should I focus on today?" returns a ranked list with links to the records behind each recommendation.

---

## 6. Navigation and screen inventory

Left sidebar on desktop, bottom bar on mobile. Global: command palette (Ctrl/Cmd+K), search, quick add, assistant panel.

| Area | Screens |
|---|---|
| Today | Dashboard with filters (date range, client, organization, engagement, opportunity) |
| Companies (was People) | Companies list with a side panel per company (Overview, Contacts, Activity, Tasks; opened by `?company=<id>` on the list). The panel can archive a company or, after a confirmation, delete it: its contacts, tasks and activities stay, unlinked; People list, contact workspace. Organizations are called companies in the interface |
| Pipeline | Board per workflow template, list view, opportunity workspace |
| Work | Engagements list, engagement workspace (overview, roadmap, milestones, owed/waiting, files) |
| Tasks | Today, Week, All, Calendar |
| Workflows | Template list, visual template editor |
| Materials | Library, material detail with versions and send history |
| Money | Invoices, invoice detail, payments, revenue overview |
| Reports | Pipeline, outreach, revenue, follow-up compliance |
| Assistant | Side panel everywhere, full-page history |
| Settings | Profile, integrations, AI providers, enrichment providers, memory, custom fields, data export, security, audit log |
| Onboarding | First-run wizard, re-openable from settings |

Every workspace page (contact, organization, opportunity, engagement) uses the same tabs: Timeline, Tasks, Roadmap, Materials, Money, Emails. This is what makes records feel connected instead of living in separate modules.

---

## 7. Architecture

### 7.1 System shape

A modular monolith: one TypeScript codebase, one database. It runs in either of two modes with the same code.

```
                    ┌────────────────────────────────────────────┐
Browser ──HTTPS──▶  │ web: Next.js 16                            │
                    │  UI, server actions, route handlers, auth  │
                    └───────────────┬────────────────────────────┘
                                    │ calls
                    ┌───────────────▼────────────────────────────┐
                    │ src/modules/*  domain logic                │
                    │ src/integrations/*  adapters (Gmail, ...)  │
                    │ src/ai/*  providers, tools, memory         │
                    └───────────────┬────────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────────────┐
                    │ PostgreSQL: records, full-text search,     │
                    │ pgvector, jobs table, audit log            │
                    └───────────────▲────────────────────────────┘
                                    │ runDueJobs()
        container mode: worker process loops every few seconds
        serverless mode: free external cron calls POST /api/jobs/tick
```

- **Container mode** (VM or local PC): `docker compose up` starts `web`, `worker`, `postgres`, `caddy`.
- **Serverless mode** (Vercel): no worker exists, so a free scheduler calls a secret-protected tick endpoint that runs the same job function with a time budget.

Supporting both keeps the app free on either kind of host and gives open-source users a choice.

### 7.2 Stack

| Layer | Choice | Reason | Rejected |
|---|---|---|---|
| Framework | Next.js 16 App Router, TypeScript, Node 24 LTS | Owner preference; official docs confirm full feature support self-hosted | React Router 7, TanStack Start |
| UI | Tailwind v4, shadcn/ui, cmdk | Components are owned in-repo, accessible primitives | MUI, Mantine |
| Workflow canvas | `@xyflow/react` (MIT) | Standard node-canvas library | Custom canvas |
| Drag and drop | dnd-kit | Keyboard-accessible Kanban | react-beautiful-dnd (unmaintained) |
| Database | PostgreSQL with pgvector, tsvector FTS, pg_trgm | One store for data, search, vectors, jobs | Pinecone, Elasticsearch, Redis |
| ORM | Drizzle + drizzle-kit migrations | SQL-first, good for explainable aggregates | Prisma |
| Auth | Better Auth, database sessions | Users in our own Postgres; passkey and 2FA plugins | Auth.js (maintenance mode), Clerk (SaaS), custom |
| Jobs | Own `jobs` table claimed with `FOR UPDATE SKIP LOCKED`, driven by a tick function | Must work from a short-lived HTTP call as well as a worker loop | pg-boss (expects a long-running supervisor), BullMQ (needs Redis), Inngest/Trigger.dev (extra service) |
| AI | Vercel AI SDK with `toolApproval` | Provider-agnostic, typed tools, approval flow; open-source library, not tied to Vercel hosting | LangChain, LangGraph |
| Validation | zod, strict objects | security.md | |
| Tests | Vitest, Playwright | | |
| Package manager | pnpm, lockfile committed | security.md | |

### 7.3 Code layout

```
src/
  app/            routes and React only
    (auth)/       sign-in, first-run setup
    (app)/        dashboard, contacts, pipeline, ...
    api/          auth, OAuth callbacks, jobs tick, AI stream, files, export
  modules/        domain logic; no React, no provider SDKs
    contacts/ organizations/ opportunities/ engagements/ workflows/
    tasks/ activities/ materials/ money/ reports/ search/ jobs/ audit/ settings/
      schema.ts   zod input schemas
      service.ts  mutations (transactions + audit)
      queries.ts  reads
      *.test.ts
  integrations/   one interface per capability, one folder per provider
    email/        types.ts, gmail/
    calendar/     types.ts, google/
    enrichment/   types.ts, website/, hunter/
    storage/      types.ts, local.ts, s3.ts
  ai/             providers.ts, tools/, policy.ts, memory/, retrieval/
  db/             schema/, migrations/, client.ts, seed.ts
  lib/            auth.ts, crypto.ts, env.ts, money.ts, time.ts, logger.ts
  components/     ui/ (shadcn) and feature components
worker.ts         container-mode loop around runDueJobs()
```

Dependency rule: `app → modules → db`. Modules reach external services only through `integrations/*/types.ts` interfaces. UI never contains business rules.

### 7.4 Request paths

- **Read:** Server Component → `requireOwner()` → module query scoped by `owner_id` → render.
- **Write:** Server Action → `requireOwner()` → zod strict parse → module service in one transaction → audit row → revalidate.
- **Route handlers** exist only where a server action cannot work: auth, OAuth callbacks, job tick, AI streaming, file download, export.

Every table carries `owner_id`, and every query filters on it, so adding users later does not need a redesign.

### 7.5 Jobs

`jobs(id, kind, payload, run_at, status, attempts, max_attempts, locked_at, dedupe_key, last_error)`.

- `runDueJobs(budgetMs)` claims due rows with `SKIP LOCKED`, runs the handler, then marks done or reschedules with backoff.
- `dedupe_key` is unique, so the same reminder or sync cannot be queued twice.
- Kinds: `reminder.send`, `task.recur`, `gmail.sync`, `calendar.sync`, `enrichment.run`, `embedding.index`, `invoice.recurring`.
- The UI reads this table to show real state ("reminder scheduled for 09:00", "last sync failed: token expired").

### 7.6 Search

Generated `tsvector` columns with GIN indexes on contacts, organizations, opportunities, activities, materials, email messages. `pg_trgm` handles fuzzy names and duplicate detection. Embedding-based search is added later and only when an embedding provider is configured.

### 7.7 Files

`storage` interface with `put`, `get`, `delete`, `signedUrl`. Drivers: local disk (VM/PC) and S3-compatible. With no driver configured, materials are links only and upload controls are hidden. Uploads: size cap, MIME check by magic bytes, sha256 de-duplication.

### 7.8 Configuration and secrets

| Kind | Examples | Where it lives |
|---|---|---|
| Deployment secrets | `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET` | Environment only |
| Public config | `APP_URL`, feature flags | Environment, safe to expose |
| OAuth client credentials | Google client ID and secret | Environment, or settings UI stored encrypted |
| User-supplied keys | AI provider keys, enrichment keys | Settings UI, stored encrypted |
| OAuth tokens | Google access and refresh tokens | Database, encrypted |

Encryption is AES-256-GCM with a key derived from `APP_ENCRYPTION_KEY`, a random IV per value, and a stored key version for rotation. Decryption happens only inside server code at the moment of use. Keys are never returned to the browser; the settings page shows only "configured" and the last four characters. Environment variables are validated with zod at startup.

---

## 8. Data model

**Conventions:** UUID primary keys generated by Postgres (`gen_random_uuid()`); `owner_id` on every table; `created_at`/`updated_at` as `timestamptz`; core records are archived (`archived_at`) instead of hard-deleted; money is `bigint` minor units plus a 3-letter currency; emails stored as `citext`.

### 8.1 Identity, settings, audit

| Table | Key columns | Notes |
|---|---|---|
| `user`, `session`, `account`, `verification` | Managed by Better Auth | Sign-up disabled after the first owner exists |
| `settings` | base_currency, timezone, week_start, fiscal_year_start | One row per owner |
| `secrets` | kind, provider, ciphertext, iv, tag, key_version, last_test_status | AI and enrichment keys |
| `integration_connections` | provider, account_email, scopes[], status (connected/expired/revoked/error), encrypted tokens, sync_cursor, last_sync_at, last_error | Drives the integration status page |
| `audit_log` | actor (user/ai/job/system), action, entity_type, entity_id, before, after, tool_execution_id | Append-only |
| `jobs` | See 7.5 | |

### 8.2 People

| Table | Key columns | Constraints and deletion |
|---|---|---|
| `organizations` | name, domain, website, industry, description, city, region, country, status (prospect/client/past_client/partner/other) | Unique (owner, domain) when domain is set; the domain is stored normalised (`example.com`) |
| `contacts` | organization_id (nullable), first_name, last_name, full_name (generated), job_title, department, phone_e164, city, region, country, timezone, preferred_channel (email/phone/linkedin/whatsapp/other), status (active/dormant/do_not_contact), relationship_type (prospect/client/partner/referrer/vendor/other), custom (jsonb, added with custom fields) | Organization delete sets `organization_id` to null; archive, never cascade |
| `contact_emails` | contact_id, email, label, is_primary; `verification` is added with the first feature that sets it (enrichment or Gmail) | Unique (owner, email); one primary per contact |
| `contact_links` | contact_id, kind (linkedin/x/website/other), url | |
| `tags`, `contact_tags`, `organization_tags`, `opportunity_tags` | | Explicit join tables keep foreign keys real |
| `custom_field_defs` | entity_type, key, label, type, options | Values live in each entity's `custom` jsonb and are validated against these |
| `enrichment_runs` | organization_id, provider (`website`), status (queued/running/done/failed), input (`{ url }`), raw_result (the extracted values, never the page), error (a short code), started_at, finished_at; `reviewed_at` is added with the review screen | Deleted with its organization. At most one read per company per minute and 20 per owner per hour |
| `field_provenance` | entity_type, entity_id, field, source (manual/website; key-based providers add theirs), confidence (verified/inferred; `uncertain` is added with the first provider that reports it), retrieved_at, run_id | Unique (owner, entity, field). A read fills a field only when it is empty and has no `manual` row; editing or clearing a field writes a `manual` row |
| `organization_logos` | organization_id (primary key), content_type, bytes (bytea, at most 100 KB), sha256, source_url, fetched_at | Kept apart from `organizations` so lists never load image bytes. PNG, JPEG, GIF, WebP or ICO by magic bytes; SVG is refused. Served only to the owner at `/api/organizations/<id>/logo` |

Organization details are stored once on the organization; contacts show them by reference.

**Duplicate handling:** exact match on email and on organization domain blocks creation with a link to the existing record; trigram similarity on name plus organization raises a warning; merge keeps one record and re-points all links in a transaction.

### 8.3 Commercial

| Table | Key columns | Notes |
|---|---|---|
| `opportunities` | organization_id, title, value_minor, currency, probability (0–100), expected_close_date, source, status (open/won/lost), lost_reason, closed_at | **Stage is not stored here.** It is the current stage of the opportunity's workflow instance |
| `opportunity_contacts` | opportunity_id, contact_id, role | |
| `proposals` | opportunity_id, material_id, amount_minor, currency, status (draft/sent/accepted/rejected/expired/withdrawn), sent_at, decided_at, valid_until | A proposal is never revenue |
| `engagements` | organization_id, origin_opportunity_id, title, scope, objectives, status (planned/active/paused/completed/cancelled), value_minor, currency, payment_terms, start_date, target_end_date | |
| `engagement_contacts` | | |
| `milestones` | engagement_id, title, due_date, status, position | |
| `deliverables` | engagement_id, milestone_id, title, status (todo/in_progress/sent/approved/changes_requested), due_date, material_id | |
| `engagement_items` | engagement_id, kind (risk/blocker/change_request/decision/approval), owed_by (me/client), status, due_date | Powers "what I owe, what they owe, what I am waiting for" |
| `payment_schedule_items` | engagement_id, label (deposit/milestone/final/recurring), amount_minor, due_date, milestone_id, invoice_id | The basis for "contracted, not yet invoiced" |

### 8.4 Workflows

| Table | Key columns | Notes |
|---|---|---|
| `workflow_templates` | name, description, applies_to (opportunity/engagement/contact), version | |
| `workflow_template_stages` | template_id, name, description, position, kind (normal/won/lost/done), entry_criteria, completion_criteria, checklist, required_fields, default_tasks, sla_days, canvas_x, canvas_y | |
| `workflow_template_edges` | from_stage_id, to_stage_id, label, condition | Branches and conditional paths |
| `workflow_instances` | template_id (provenance only), template_version, exactly one of opportunity_id/engagement_id/contact_id, current_stage_id, status | CHECK enforces exactly one subject; one active instance per subject |
| `workflow_instance_stages` | instance_id, source_stage_id, plus a full copy of the stage definition and checklist state | |
| `workflow_instance_edges` | | |
| `stage_transitions` | instance_id, from_stage_id, to_stage_id, at, reason, note, actor, is_exception | Append-only |

See section 9 for behaviour.

### 8.5 Tasks and calendar

| Table | Key columns | Notes |
|---|---|---|
| `tasks` | title, notes, status (open/done/cancelled), priority (low/normal/high), due_on (the owner's calendar date, set for every task with a due date), due_at (the instant, set as well when the task has a time), snoozed_until, completed_at, recurrence_rule (RRULE: FREQ, INTERVAL, BYMONTHDAY), origin (manual/follow_up/workflow/ai/meeting), optional contact_id, organization_id, opportunity_id, engagement_id, instance_stage_id, milestone_id | One row, many optional links: appears everywhere, counted once. A CHECK requires due_on whenever due_at is set; due_on of open timed tasks is recomputed if the owner changes time zone. Link columns are added in the phase step that builds their target |
| `reminders` | task_id (calendar_event_id comes with the calendar), remind_at, channel (in_app; push and email are added when they can deliver), status (scheduled/sent/cancelled), sent_at, dismissed_at | Status reflects what actually happened. The job is found by its dedupe key `reminder:<id>` |
| `calendar_events` | connection_id, external_id, title, starts_at, ends_at, timezone, location, meeting_url, attendees, optional organization/opportunity/engagement links | Unique (connection, external_id) |
| `calendar_event_contacts` | | |

All instants are stored in UTC and displayed in the owner's time zone; all-day items keep a date without a time. Time zone arithmetic is done in application code and never in SQL: stock Postgres images do not ship legacy zone names such as `Asia/Calcutta`, which browsers and Node still report. Recurrence creates the next task when the current one is completed, in the same transaction, skipping occurrences that are already in the past and carrying the reminder forward at the same lead time. An in-app reminder is delivered by the `reminder.send` job and shown on Today until it is dismissed or its task is closed.

### 8.6 Activities and email

| Table | Key columns | Notes |
|---|---|---|
| `activities` | kind (note/call/meeting/email/linkedin/message/decision/objection/commitment), direction (inbound/outbound, optional), occurred_at, title, body, outcome, source (manual/gmail/calendar/ai), optional organization/opportunity/engagement/email_message/calendar_event links | The manual and communication log. An activity has at least one contact or an organization. Link columns other than organization are added in the phase step that builds their target. A mistaken entry is deleted outright and kept in the audit log |
| `activity_contacts` | activity_id, contact_id | An activity can involve several contacts |
| `email_threads` | connection_id, external_thread_id, subject, last_message_at, optional opportunity/engagement links | |
| `email_messages` | thread_id, external_message_id, from, to, cc, sent_at, direction, snippet, body_text (size-capped), has_attachments | Only threads involving a known contact are stored |
| `email_message_contacts` | | |
| `email_attachments` | message_id, filename, mime, size, external_attachment_id | Metadata only; content fetched on demand |
| `email_drafts` | connection_id, thread_id, to, subject, body, status (draft/approved/sent/failed), created_by (user/ai), sent_message_id, error | "Sent" is set only after Gmail returns a message ID |

The **timeline** is a database view that unions activities, stage transitions, payments, material sends and email messages, ordered by time. System events are therefore not duplicated into the activity table. Each row carries owner_id, event_type, event_id, occurred_at, kind, direction, title, body, outcome, organization_id and contact_ids (an array), so one query serves a contact's or an organization's Timeline tab. It holds activities only until the other sources exist; each later step adds its own branch to the union.

Logging an activity can create a follow-up task (origin `follow_up`) in the same transaction, linked to the first contact and the organization.

### 8.7 Materials

| Table | Key columns | Notes |
|---|---|---|
| `materials` | name, type (proposal/quote/deck/portfolio/contract/report/design/deliverable/link/other), description | |
| `material_versions` | material_id, version_label, file_id or url | |
| `files` | driver, storage_key, filename, mime, size, sha256 | Unique (owner, sha256): one stored copy per file |
| `material_sends` | material_version_id, sent_at, channel, evidence (manual/email_detected), email_message_id, status (sent/viewed/accepted/rejected/superseded), optional organization/opportunity/engagement links | One material, many sends, no file duplication |
| `material_send_recipients` | send_id, contact_id | |

### 8.8 Money

| Table | Key columns | Notes |
|---|---|---|
| `invoices` | number, organization_id or contact_id, engagement_id, issue_date, due_date, currency, status (draft/issued/void) | Unique (owner, number). Paid, partial and overdue are **derived** |
| `invoice_lines` | invoice_id, description, quantity, unit_amount_minor, amount_minor, service_category | |
| `invoice_adjustments` | invoice_id, amount_minor, reason | Discounts and write-offs, kept visible |
| `payments` | received_on, amount_minor (> 0), currency, kind (payment/refund), method, reference, external_ref, payer, fx_rate_to_base, idempotency_key | Unique (owner, external_ref) and unique (owner, idempotency_key) |
| `payment_allocations` | payment_id, invoice_id, amount_minor | Sum per payment ≤ payment amount; sum per invoice ≤ invoice balance; enforced in the transaction |
| `fx_rates` | currency, rate_to_base, as_of | Manual entry; used for forecasts only |

**Duplicate-payment prevention:** the form carries an idempotency key so a double submit creates one row; a payment with the same payer, amount, date and reference as an existing one triggers a blocking warning; imported payments are unique on `external_ref`.

### 8.9 AI

| Table | Key columns | Notes |
|---|---|---|
| `ai_conversations` | title, context_entity | |
| `ai_messages` | conversation_id, role, parts, provider, model, token counts | |
| `ai_tool_executions` | tool_name, input, risk_tier, status (proposed/approved/denied/executed/failed), result, error | The traceable record of every AI action |
| `ai_memories` | scope (preference/business/contact/organization/engagement), subject, content, created_by (user/ai_proposed), status | Listed, editable and deletable in settings |
| `embeddings` | entity_type, entity_id, chunk, content, embedding, model | Added in the later semantic-search release |

---

## 9. Workflow engine

- **Template vs instance.** Applying a template copies its stages and edges into instance tables. Editing an instance never touches the template or other clients. Editing a template never changes running instances; the instance records which template version it came from.
- **One pipeline per record.** An opportunity's stage is its instance's `current_stage_id`. Board drag, roadmap advance, and the assistant all call the same `transition()` service, so every view agrees.
- **Transition rules.** `transition()` checks that an edge exists, evaluates required checklist items and required fields, and either moves or returns what is incomplete. A forced move needs a reason and is saved with `is_exception = true`.
- **Terminal stages.** A stage of kind `won` or `lost` sets the opportunity status (and lost reason) in the same transaction.
- **Stage tasks.** Entering a stage creates its default tasks with due dates offset from the entry time, linked back to the instance stage.
- **History.** `stage_transitions` is append-only. Time in stage and average time between stages are computed from it.
- **Kanban.** A board shows all instances created from one template. Columns are the template's stages; a card sits in the column matching its current stage's `source_stage_id`. Stages a user added to a single instance appear in a "Custom" column.
- **Editor.** Stages are nodes and paths are edges on a React Flow canvas, with a side panel for description, checklist, required fields, default tasks and deadlines. A simple ordered-list editor is offered for linear workflows.
- **Automatic actions in MVP** are limited to: create tasks, set reminders, flag an SLA breach. Sending anything externally is never automatic.

Seed templates (editable, not hard-coded): Prospecting, Website Project.

---

## 10. Revenue and reporting definitions

Dashboard figures, each shown separately and each clickable through to its rows:

| Figure | Definition |
|---|---|
| Received | Sum of payments minus refunds with `received_on` in the period, converted with each payment's stored rate |
| Invoiced | Sum of issued, non-void invoice totals with `issue_date` in the period |
| Outstanding | For issued invoices: total − adjustments − allocations; overdue when past `due_date` |
| Contracted, not invoiced | Payment schedule items on active engagements with no invoice |
| Pipeline | Sum of open opportunity values |
| Weighted pipeline | Sum of value × probability for open opportunities |

Reports, each with its denominator:

| Metric | Formula |
|---|---|
| Reply rate | Contacts with an inbound activity after their first outbound ÷ contacts with at least one outbound, in period |
| Meetings booked | Count of meeting activities or calendar events linked to opportunities created in period |
| Proposal acceptance | Accepted ÷ (accepted + rejected + expired) proposals decided in period |
| Stage conversion | Instances that left stage A for stage B ÷ instances that entered stage A |
| Win rate | Won ÷ (won + lost) opportunities closed in period |
| Average time in stage | Mean gap between consecutive transitions, per stage |
| Lost reasons | Count and value by `lost_reason` |
| Revenue by month/client/service/source | Received, grouped via allocation → invoice → line category or engagement → opportunity source |
| Time to payment | Mean days from `issue_date` to the allocation that clears the invoice |
| Follow-up compliance | Follow-up tasks completed on or before due ÷ follow-up tasks due in period |

When a denominator is zero the report shows "not enough data". Amounts in a currency with no rate are listed per currency instead of being converted.

---

## 11. Integrations

### 11.1 Google (Gmail and Calendar)

**Why each instance brings its own OAuth client.** `gmail.readonly` is a restricted scope. A shared public client would need Google verification and a yearly security assessment. A personal client in the user's own Google Cloud project does not.

**Setup, shown step by step in onboarding:**
1. Create a Google Cloud project (free) and enable the Gmail and Calendar APIs.
2. Configure the consent screen as External and add yourself.
3. Publish to "In production" without submitting for verification. Left in "Testing", Google expires refresh tokens every 7 days. Unverified personal-use apps are allowed for under 100 users and show a warning screen at sign-in.
4. Create a Web OAuth client with redirect `APP_URL/api/integrations/google/callback`.
5. Enter client ID and secret, click Connect, then run the built-in connection test.

Step 3 is not explicitly documented by Google for restricted scopes, so the first task of the integration phase is a spike to confirm tokens survive past 7 days.

**Scopes, requested only when the feature is turned on:**

| Scope | Class | Enables |
|---|---|---|
| `gmail.readonly` | Restricted | Read and search threads |
| `gmail.send` | Sensitive | Send approved drafts |
| `calendar.readonly` | Sensitive | Read events, detect conflicts |
| `calendar.events` | Sensitive | Create meetings after confirmation |

Drafts are stored in Touchpoint, which avoids the restricted `gmail.compose` scope.

**Sync.** The mailbox is not mirrored. For each known contact email address, matching threads are fetched; afterwards the Gmail history cursor gives incremental changes on each sync job. Bodies are stored as size-capped plain text; attachments as metadata only.

**Matching.** Participants are matched to `contact_emails`. Organization is inferred from the domain, excluding free-mail domains. An unknown address in a matched thread is offered as a new contact. A thread is linked to an opportunity automatically only when the contact has exactly one open opportunity; otherwise it is suggested.

**Sending.** Draft → user approves → Gmail API send → message ID returned → draft marked sent and an activity created. Any failure leaves the draft unsent and shows the error.

**Materials.** An outgoing message whose attachment hash matches a stored file, or whose body contains a known material URL, proposes a `material_send` with evidence `email_detected`.

**Failure states.** `invalid_grant` or a revoked token sets the connection to `expired`, shows a banner, and pauses sync jobs. Nothing else in the app stops working.

**Calendar.** Events from 30 days back to 90 days ahead are synced with Google's sync token. Attendees are matched to contacts. Creating or changing an event always needs confirmation.

### 11.2 Enrichment

Interface: `enrich(input) → candidates[{field, value, source, confidence}]`.

- Built-in `website` provider: fetches the organization's public home and about pages, respects `robots.txt`, extracts name, description and social links from metadata. Outbound fetches block private and loopback addresses.
- Optional key-based providers (Hunter first).
- Results go to a review screen with per-field accept and reject. Accepted fields get a provenance row. Missing fields stay empty; nothing is invented.

**As built in Phase 3 (website provider only).** A company created with a domain or website is read once in the background (job `enrichment.run`, run straight after the response and by the scheduler as a fallback); the company panel has a button to read again. The reader fetches `robots.txt`, the home page and up to three icon candidates within ten seconds, through `src/lib/safe-fetch.ts`: public addresses on ports 80 and 443 only, checked inside the connection's own DNS lookup, at most three redirects, size caps after decompression. It takes the description (meta description, Open Graph, JSON-LD), the location (JSON-LD address), the website address and a logo. Industry is not read, because a site does not state it in a form that can be read without guessing. Profile links (JSON-LD `sameAs`) are kept in `raw_result` only. There is no review screen yet: a value is written only into an empty field the owner has not edited, each with a provenance row, and the panel marks it "From website". A home page that forwards to an unrelated site is not read. Sites that turn automated requests away are reported as such and left alone.

### 11.3 Adapters

`EmailProvider`, `CalendarProvider`, `EnrichmentProvider`, `StorageDriver` and `ModelProvider` are small interfaces. Adding Outlook later means adding a folder, not changing modules.

---

## 12. AI assistant (v0.3)

**Provider layer.** The AI SDK gives one interface over Anthropic, OpenAI, Google and OpenAI-compatible endpoints such as Ollama. The user picks provider and model in settings and supplies a key. With no provider configured, the assistant UI explains how to add one and the rest of the app is unaffected.

**Tools and permission tiers.** Enforcement is in server code, not in the prompt.

| Tier | Examples | Behaviour |
|---|---|---|
| 0 Read | search contacts, get timeline, list tasks, revenue summary, pipeline summary, search materials, search emails, read calendar | Runs automatically |
| 1 Small internal write | create task, add note, save email draft, propose memory | Runs, shows a card with undo, logged |
| 2 Consequential internal write | move stage, change opportunity value or status, record payment, edit contact fields, archive | Shows a before/after preview, needs confirmation |
| 3 External | send email, create or change calendar event | Always needs explicit confirmation |

Approval is a server action tied to the `ai_tool_executions` row; the model cannot approve its own call.

**Grounding.** Financial answers come from the same SQL functions as the dashboard, never from model arithmetic. Answers link to the records used. If a tool fails, the failure is reported as a failure.

**Untrusted content.** Email bodies, attachments and fetched web pages are passed to the model as labelled data. Once a conversation has read such content, tier 1 actions also require confirmation for the rest of that conversation. No tool can read secrets or tokens.

**Memory.** Five kinds: preferences, business context, contact or organization context, engagement context, and short-term conversation state (the message history). The assistant may propose a long-term memory; it is saved only when accepted. Settings has a Memory page to view, edit and delete. Emails are never bulk-stored as memory.

**Retrieval.** Full-text search first. Embeddings with pgvector are added only if an embedding provider is configured.

---

## 13. Security model

Mapped to `security.md`:

| Rule area | Implementation |
|---|---|
| Input validation | zod strict schemas on every server action and route handler |
| Auth | Better Auth; argon2/scrypt password hashing; optional passkey and TOTP; rate limit on sign-in |
| Authorization | `requireOwner()` on every action and query; `owner_id` filter everywhere |
| Injection | Drizzle parameterised queries only; no `dangerouslySetInnerHTML`; email HTML is never rendered, only plain text |
| Secrets | Section 7.8 |
| Headers | CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy` set in `next.config` |
| Rate limits | Auth, AI chat, enrichment, tick endpoint |
| Uploads | Size cap, magic-byte MIME check |
| Pagination | Keyset pagination on all lists |
| Logging | Structured JSON, auth attempts with time and IP, secret and token redaction |
| Data rights | Full JSON + CSV export; delete-contact and delete-everything flows |

**Two points that differ from the letter of `security.md`, approved by the owner on 2026-10-10:**

1. It asks for JWT access tokens of at most 15 minutes. Better Auth uses revocable database sessions in `httpOnly`, `Secure` cookies. This meets the intent (no tokens in browser storage, instant revocation) without JWTs.
2. It asks for `SameSite=Strict` cookies. A Strict session cookie is not sent on the redirect back from Google, so the OAuth callback validates a separate short-lived `SameSite=Lax` state cookie and then completes the connection from a same-site page.

---

## 14. Hosting options at $0

| Option | What runs where | Good | Catches |
|---|---|---|---|
| **A. Oracle Cloud Always Free VM** | Docker Compose: web, worker, Postgres, Caddy on one ARM VM (free allowance 2 OCPU, 12 GB RAM, 200 GB disk) | Always-on worker, exact reminders, no business-use restriction, same setup open-source users get | Sign-up asks for a card for verification; ARM capacity is often unavailable in busy regions; Oracle may reclaim VMs it judges idle over 7 days; you patch the server and run backups |
| **B. Vercel Hobby + Neon Free + cron-job.org** | Web on Vercel, Postgres on Neon, free scheduler calls the tick endpoint | No server to manage; accounts already connected | Vercel Hobby is "non-commercial personal use only" and defines commercial as a deployment used for anyone's financial gain, so a tool that runs your business is at risk of being paused; ticks must be about 15 minutes apart to stay inside Neon's 100 CU-hours (estimate), so reminders are that coarse; no file uploads without separate storage |
| **C. Your own PC + Tailscale** | Docker Desktop on Windows; private phone access through Tailscale's free plan | Most private, no sign-ups, no limits | Reminders and sync only run while the PC is on |

Supabase Free can replace Neon in option B (always-on, so per-minute ticks work) at the cost of a 500 MB database.

### Chosen: free managed tiers (option B)

| Job | Service | Free allowance | How we stay inside it |
|---|---|---|---|
| Web app | Vercel Hobby | 1M function calls, 4 h active CPU per month, 300 s per call | Single user; far below these |
| Database | Neon Free | 1 GB, 100 CU-hours per month | Email bodies size-capped; tick every 15 minutes |
| Scheduler | cron-job.org | 1-minute minimum, 30 s timeout | Calls `/api/jobs/tick` every 15 minutes; tick works in under 25 s |
| Scheduler backup | Vercel Cron (Hobby) | Once per day | One daily tick in case the external scheduler fails |
| Dev database | Neon `dev` branch | 10 branches per project | No Docker needed on the Windows machine |
| Files | None at first | — | Materials are links only until an S3-compatible bucket is configured |
| Email, calendar | Google APIs | Free | Own OAuth client |
| AI (optional) | Gemini free tier or local Ollama | Rate-limited | Off by default |

Known trade-offs accepted with this choice:

- Vercel Hobby's terms restrict it to non-commercial personal use. If Vercel objects, the same code moves to option A or C without changes, because nothing depends on Vercel-only APIs.
- Reminders fire within about 15 minutes of their time, not to the minute. Meeting alerts still come from Google Calendar itself.
- The Docker path (worker process) is kept working for open-source users and as the fallback.

---

## 15. Testing

- **Unit (Vitest):** money maths and allocation limits, duplicate-payment guard, revenue definitions, workflow transition rules and exceptions, template/instance isolation, recurrence, time-zone handling, encryption round-trip, AI tier policy.
- **Integration (Vitest + real Postgres):** every module service, owner scoping, migrations from empty.
- **End to end (Playwright):** the ten journeys in section 5, on desktop and mobile widths.
- **Integrations:** adapters tested against recorded fixtures; one manual checklist against a real Google account. Nothing is reported as working without a real run.

---

## 16. Roadmap outline

Each phase gets a detailed implementation plan when it starts. Outline:

| Phase | Delivers | Accepted when |
|---|---|---|
| 1 Spec | This document, agreed | Owner signs off sections 7–14 |
| 2 Foundation | Scaffold, schema and migrations, auth, app shell, design system, onboarding, settings, jobs runner, audit log | Fresh clone → `docker compose up` → create owner → sign in; tick runs a test job; CI green |
| 3 Core business | Contacts, organizations, search, timeline, opportunities, workflows (editor, instances, board), engagements, tasks and reminders, materials | Journeys 2–6 and 8 pass end to end; editing one instance leaves the template and others unchanged |
| 4 Revenue and reports | Invoices, payments, allocations, dashboard, reports, filters | Journey 7 and 9 pass; financial test suite green; every dashboard number drills down to rows |
| 5 Integrations | Google OAuth, Gmail sync and send, Calendar sync and create | Token survives 8+ days; revoked token shows expired state; send is recorded only with a Gmail message ID |
| 6 AI | Chat, tools, tiers, memory, briefings | The PRD's example questions answered from real rows with links; tier 3 never runs unconfirmed |
| 7 Open-source readiness | Compose file, `.env.example`, docs, backup/restore, licence | A second person deploys from the README alone |
| 8 Validation | Accessibility, responsive, error states, data integrity pass | No broken journeys; no dead buttons |

Dependencies: workflows need opportunities and tasks; revenue reports need invoices and allocations; email matching needs contact emails; AI tools need every module's service layer.

---

## 17. Risks and open questions

| Risk | Mitigation |
|---|---|
| Google token expiry for unverified restricted-scope apps | Spike first in phase 5; fallback is a clear weekly reconnect prompt |
| Free-tier limits change (Oracle halved its ARM allowance in June 2026) | App stays portable: plain Postgres, plain Docker, no host-specific APIs |
| Vercel Hobby terms | Stated plainly in docs; option A or C avoids it |
| Workflow editor complexity | Ship linear list editor first, canvas with branches second |
| Version claims from secondary sources (Drizzle, AI SDK) | Pin from official docs at scaffold time |
| Free AI tiers and client privacy | Assistant is off by default; onboarding states what each provider does with data |

Open question for the owner: licence choice before phase 7.
