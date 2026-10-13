# Project Plan — Touchpoint

> **Read this before planning or responding to any task.**

## Purpose

Touchpoint is a single-user, self-hostable personal business operating system for a solo practitioner: CRM, sales pipeline, reusable client workflows, lightweight project tracking, revenue records and an AI assistant. It will be open-sourced so others can run their own instance.

The full product requirements, data model and architecture are in `docs/PRD.md`. That document is the source of truth for scope and design.

## Current Phase

Phase 3 — Core business modules (PRD section 16)

Accepted when PRD journeys 2–6 and 8 pass end to end on desktop and phone widths, and editing one workflow instance leaves its template and sibling instances unchanged.

## Active Work Items

Each step is a vertical slice: migration, module (zod schema, service, queries, tests), screens and server actions, nav entry, Playwright coverage. A step is done when lint, typecheck, Vitest and Playwright pass and it is deployed.

- [x] Step 1: People — organizations, contacts, emails, links, tags; duplicate detection (exact email or domain refused, similar name warned); `/people/contacts` and `/people/organizations`
- [x] Step 2: Tasks and reminders — Today, Week and All views, recurrence, snooze, in-app reminders through the jobs runner; Today dashboard shows what is due; Tasks tab on contacts and organizations. The Calendar view in PRD section 6 is left for the calendar integration (phase 5)
- [x] Step 3: Activities and timeline — log an interaction (one or more contacts, optional organization) with an optional follow-up task; `timeline` view; Timeline tab on contacts and organizations; "Log activity" in the command palette. There is no Activities item in the navigation because the PRD has no such area
- [x] Between steps 3 and 4: Today also shows contact and organization counts, the week ahead (Coming up) and recent activity, using data from steps 1–3. Pipeline and revenue figures join it with opportunities (step 4) and Phase 4
- [x] Between steps 3 and 4: Companies workspace, asked for by the owner with reference screenshots. Organizations are called companies in the interface; routes, tables and modules keep the name `organizations`
  - [x] Slice 1: top bar with the account menu, collapsible sidebar (icon rail by default, remembered in a cookie, Ctrl+B), sidebar item Companies with Companies and People tabs, wording
  - [x] Slice 2: companies table (monogram until slice 3 adds logos, domain, industry, contacts, last activity, sort, filters), company side panel opened from the list by `?company=<id>`, New company dialog (name and website), add a contact inside a company. The company workspace pages are gone; `/people/organizations/<id>` redirects to the panel
  - [x] Slice 3: built-in enrichment from the company's own website (no third-party API): `enrichment_runs`, `field_provenance`, logos stored in Postgres, SSRF-guarded fetch, fills empty fields only and never overwrites what the owner typed. Reads description, location, website and logo; industry is not read; profile links are kept in the run but not shown. Sites behind bot protection refuse the read and are reported as such
  - [x] Added afterwards at the owner's request: Delete in the company panel, behind a confirmation. The company, its tags, logo and website reads go; its contacts, tasks and activities stay without a company
- [x] Between steps 3 and 4: company details and configurable fields, asked for by the owner with reference screenshots
  - [x] Slice 1: the Overview tab shows the description beside a Details column (every standard field, a dash where empty); companies have a phone and an email; the website reader fills them, and looks at the site's contact page when the home page leaves contact details out
  - [x] Slice 2: contacts inside the company panel: the Contacts tab is a table with a count and an in-place add; a star marks the company's one primary contact (the first person added gets it); a contact opens in the same panel (`?company=<id>&contact=<id>`) with a way back, its own Overview, Activity and Tasks tabs and a two-column Details list; GitHub is a link type. The full contact page stays for the People list and for contacts without a company. Not built: re-enrich for a person (no free source), Deals and Agent tabs, Owner
  - [x] Added afterwards at the owner's request: a company or person row opens from anywhere on the row; a person opens as a panel over the People list too (the full contact page is gone, its address redirects); the panel slides in from the right and away on close; dropdown lists follow the theme (styled where the browser allows it, the native list in the right theme elsewhere)
  - [x] Added afterwards at the owner's request: the website read also follows the site's team page and keeps the people it names (name and role); the company's Contacts tab offers them under "Found on the website" with Add and Add all, and nobody becomes a contact until the owner adds them. Not built: personal emails or phones (no free source), dismissing a suggestion, people named only on an About page (the home page followed on 2026-10-12, below)
  - [x] Asked for by the owner with reference screenshots on 2026-10-12, in three steps
    - [x] Step A: the company header shows Re-enrich and a three-dots menu holding Edit, Archive and Delete; a person has the same menu and can be deleted after a confirmation; the status badge of a company and the relationship badge of a person are menus that change it in place. Not built: the reference's Research button, which needs the AI assistant (Phase 6)
    - [x] Asked for on 2026-10-12, ahead of Step B: a person's picture from the company's own site. The team-page read keeps the picture shown in a person's card; it is downloaded when the owner adds the person and for existing contacts on a re-read, shown in the panel and the company's Contacts table, and removable for good. No face matching
    - [x] Asked for on 2026-10-12 after KBRS & Associates (cakbrs.com) showed nobody: the website read also handles sites a browser builds from scripts, and people named on the home page. An empty page is sent to Jina Reader (free, no key; `WEBSITE_RENDERER=off` stops it) and read as drawn for people, phone and email; a home page's people count only under a heading that introduces the team. Not built: people named only on an About page, sites the reader cannot draw
    - [x] Asked for on 2026-10-12: pictures are compressed before they are stored. Logos and contact photos are shrunk to fit (192 and 256 px) and re-encoded as WebP with `sharp`, without their metadata; larger originals are accepted now that the stored copy is a few kilobytes. Pictures stored before this stay as they are until read again
    - [x] Asked for on 2026-10-12, approved with a non-additive migration: one person at several companies. `contact_organizations` (title and star per company) replaces `contacts.organization_id` and `contacts.is_primary`; add an existing person from a company's Contacts tab, manage a person's companies in their panel; a website suggestion that looks like an existing contact can be said to be that person (what prompted it: Komal Bhotika at KBRS, already kept as Komal Bajaj Bhotika at Inoya Rouge). Not built: merging two existing duplicates (Step 9), changing the name a company's website lists someone under after linking
    - [x] Also asked for on 2026-10-12: profile links found by name (LinkedIn, X, GitHub) through Tavily's free tier, offered for the owner to add. With the optional `TAVILY_API_KEY` set, a person's Overview has "Find profile links": one search by name and first company, up to three candidates of each kind with the result's title, Add and Dismiss; kept in `profile_searches`, limited to 20 an hour and 900 in 30 days. This pulls one key-based provider forward from the list below. Not built: searching without being asked or for everyone at once, profile links for companies, the key entered in Settings (Phase 6), checking that a profile is the right person. Not yet tried against the live service: that waits for the owner's key
    - [x] Step B: the website read works out the country from the phone's international code or a country domain and guesses the industry from a keyword list, each stored with provenance confidence `guessed` (migration 0011) and shown as "Guessed from website"; it also reads the city, region and country from an address marked up in microdata, which counts as stated. A value the site later states replaces a guess; a guess replaces nothing. Not built: a street address or postcode (no column), guesses for shared phone codes (`+1`, `+7`) or general-use country domains (`.io`, `.co`), an industry when the page's wording is thin or evenly split
    - [x] Step C: Slice 3 below, in two parts
  - [x] Slice 3: a gear on the company's and the contact's Details opens a Fields panel with Companies and Contacts tabs: reorder and hide standard fields, add suggested fields in one click, create custom fields (`custom_field_defs`, pulled forward from Step 9). Values are edited on the Edit forms; the Deals tab of the reference waits for Step 4
    - [x] Part 1: the gear and the Fields panel (`&fields=companies|contacts`, in place of the open record, with a way back); fields are dragged into order by a handle or moved with the arrow keys, and shown or hidden with an eye; the order is kept in `field_layouts` (migration 0012) and both Details lists follow it. Uses dnd-kit, brought in ahead of Step 6
    - [x] Asked for on 2026-10-12 with reference screenshots, ahead of Part 2: the account menu moves from the top bar to the foot of the sidebar (it stays in the top bar on a phone, which has no sidebar), and the Fields panel takes the reference's look: a one-line subtitle, pill tabs, a "Standard fields" section that folds and gives its count, plain rows whose eye and handle show when pointed at, and a narrower panel. Not built: the reference's Deals tab (Step 4), its Suggested and custom sections (Part 2)
    - [x] Part 2: suggested fields in one click (five for companies: Segment, Territory, Lifecycle stage, Lead source, ICP fit score; the reference's Account type and BDR owner are left out, since Status and a single user cover them) and custom fields of four kinds, text, number, dropdown and date (`custom_field_defs`, a `custom` column on companies and contacts, migration 0013), with their values on the Edit forms and in Details; rename a custom field, add options to a dropdown, delete a field with its values. Not built: editing a value in place on Details, custom fields on the New forms, as list columns or in search, removing a dropdown's options, the Deals tab (Step 4)
- [ ] Between steps 3 and 4: lists, loader, activities and tasks in the panel, and company statuses of the owner's own, asked for by the owner with reference screenshots on 2026-10-13 and approved as six steps shipped one at a time
  - [x] Step 1: a bar across the top of the window while a page is on its way or a server action is running; pictures in the People list; a picture opens larger when clicked (People list, a company's Contacts table, the panel's header). Not built: a picture larger than the 256 px stored
  - [x] Step 2: the lists' look from the reference (each list's own title row with its primary button, search with an icon that runs on Enter, Filters and Sort as menus, Archived as a switch, the table in a card, "Showing a–b of n", sorting by domain and industry) and New company as a side panel asking for a name and a domain. Not built: the reference's Owner and Open deals columns (one user; deals arrive with Step 4); a starting number in the People list's count after its first page, since it pages by a cursor
  - [x] Step 3: company statuses of the owner's own, each with a colour (any colour, from the browser's picker; first shipped as a fixed list of nine and changed the same day at the owner's request, migration 0015, not additive and approved), shown in the companies table (a Status column, from tablet width up), the Filters menu and the status badge; "Edit statuses…" in a company's status menu adds, recolours, renames and deletes them, and deleting one moves its companies to Other (`company_statuses`, migration 0014, which also drops `organizations_status_check`, not additive and approved with the plan; the service checks the value instead). Not built: renaming, deleting or reordering the five built-in statuses (colour only), sorting the table by status, colours for a person's relationship, a count of companies beside each status
  - [x] Step 4: logging an activity, adding a task and opening an existing one all happen inside the panel (`&activity=new|<id>`, `&task=new|<id>`, in place of the record with a way back to its tab); a person opened inside a company comes back there after a save; the pages stay for Today, the Tasks area and Ctrl+K. Not built: the list's filters, sort and page kept after adding an entry or deleting an activity (the way back is built from ids; Back, Cancel and saving an existing entry do keep them); checking that an entry belongs to the record whose panel shows it (it only has to be the owner's)
  - [ ] Step 5: a Columns picker (kept in a cookie) and row checkboxes with archive and delete for several records at once
  - [ ] Step 6: saved views (`list_views`, migration 0016): a named set of filters and sort per list
- [ ] Step 4: Opportunities — value, probability, contacts, won and lost; `src/lib/money.ts`
- [ ] Step 5: Workflow engine — templates, list editor, instances, `transition()`, stage tasks, roadmap, starter templates
- [ ] Step 6: Pipeline board (dnd-kit) and canvas template editor (React Flow)
- [ ] Step 7: Engagements — from a won opportunity, milestones, deliverables, owed and waiting, payment schedule
- [ ] Step 8: Materials — library, versions as links, send logging, proposals
- [ ] Step 9: Search, quick add, custom fields, merge duplicates
- [ ] Step 10: Journey tests on desktop and phone; phase close-out

Left out of Phase 3 on purpose: key-based enrichment providers and the enrichment review screen (the website reader arrives with the Companies workspace above), file uploads and the `files` table (no storage on Vercel), email and push reminder channels (email needs Gmail in Phase 5; push needs a service worker), dashboard filters, money, reports and data export (Phase 4).

Phase 2 (foundation) is complete and live at https://touchpoint-sandy.vercel.app (Vercel `sin1`, Neon `main`, cron-job.org every 15 minutes).

Known gaps in Phase 2 work:

- Change password and revoke session are implemented but only checked for rendering, not exercised end to end.
- The tick endpoint relies on its secret and has no separate rate limit.
- Auth redirects are done per page with `requireOwner()`, not in `src/proxy.ts`.

## Key Decisions & Constraints

- **$0/month hard constraint.** Only free tiers; never make a paid service a requirement.
- Hosting: Vercel Hobby (web), Neon Free (Postgres), cron-job.org (scheduler, every 15 minutes), Vercel daily cron as backup.
- The Docker path (web + worker + Postgres) must keep working for open-source users.
- Stack: Next.js 16 App Router, TypeScript, Node 24, pnpm, Tailwind v4, shadcn/ui, Drizzle, Better Auth, zod, Vitest, Playwright.
- Jobs: own `jobs` table claimed with `FOR UPDATE SKIP LOCKED`; one `runDueJobs()` used by both the tick endpoint and the worker loop.
- Dependency rule: `app → modules → db`. Business logic lives in `src/modules/*`, never in UI or provider code.
- Every table has `owner_id`; every query filters on it.
- Never pass a time zone name to Postgres. Zone arithmetic happens in `src/lib/time.ts`; queries compare stored dates and instants. (Neon accepts legacy names such as `Asia/Calcutta`; the stock Postgres image used in CI and Docker does not.)
- Domain tables are added by migration in the phase that builds their module.
- Navigation shows only screens that exist. No dead links or placeholder buttons.
- Uses Graft for codebase navigation (mandatory — see CLAUDE.md)
- All changes logged in updates.md
- Security rules in security.md must be applied before writing any code

## Architecture Notes

See `docs/PRD.md` sections 7 (architecture), 8 (data model), 9 (workflow engine), 11 (integrations), 12 (AI) and 13 (security).

## Out of Scope (for now)

Not in Phase 3: money and reports (phase 4), data export (phase 4), Gmail and Calendar (phase 5), AI assistant and key storage (phase 6), file uploads, Docker Compose (phase 7).

Not in v1 at all: multi-user teams, role-based access, payment gateways, accounting sync, automated LinkedIn activity, bulk email campaigns, native mobile apps.
