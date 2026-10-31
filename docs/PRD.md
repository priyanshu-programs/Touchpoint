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
- Workflows drawn on a whiteboard, a copy per client with a status on each stage, Kanban
- Engagements with milestones, deliverables, risks, blockers, pending decisions
- Tasks, follow-ups, recurring tasks, reminders, Today and Week views
- Materials library with manual send logging
- Invoices, payments, allocations, revenue dashboard, core reports
- Global search, command palette, quick add
- Data export (JSON + CSV), audit log

**v0.2 — integrations:** Google Calendar read and create, meeting links. Gmail read and send, thread-to-contact matching and sent-material detection moved to v0.3 with the assistant (owner's choice, 2026-10-29: the assistant reads Gmail on request, and only the emails the owner picks are saved to a record).

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
| Workflow template | A workflow drawn on a whiteboard: boxes, arrows and free drawing, with some boxes marked as stages | Copied when started on a record |
| Workflow instance | One client's own copy of a workflow's whiteboard, each stage with a status | Belongs to exactly one company or person (an opportunity or engagement later) |
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

Left sidebar on desktop, bottom bar on mobile. The account menu (the owner's name, Sign out) is at the foot of the sidebar, and in the top bar on a phone, which has no sidebar. Global: command palette (Ctrl/Cmd+K), search, quick add, assistant panel. Search lives in the command palette ("Go to" on a phone), "Search or jump to…": the screens and actions whose names hold the typed text, and from two characters on the owner's companies, people, materials, workflows (theirs first, then the copies on records, "On <record>"), brainstorm boards (2026-10-24), activities and tasks that match, up to five of each under their own heading with a hint (domain, companies, type, date, due date or Done); a choice opens the record where it already lives (a company's or person's panel, a material's page, the whiteboard, an activity's or task's page). Companies and people are found by name, domain or email, title and tag, and by a name typed with a small slip from four characters on; archived ones and cancelled tasks are left out (2026-10-18). Quick add (`/quick-add`, from a **+** in the top bar on every width and first among the palette's actions) is journey 2 in one form: a person (first and last name, email, job title), where they work (a new company by name and domain, an existing one picked from a search, or none), an optional workflow (Prospecting listed first) started on the company or, with none, on the person, and a follow-up task due three days out in the owner's zone unless the date is cleared. It is saved in one transaction after every check, so a taken email or domain, or a look-alike company or person not yet confirmed ("Add anyway"), saves nothing; it lands on the person's panel inside the company, and a new company's website is read as on New company (2026-10-24). While a page is on its way or a server action is running, a thin bar moves across the top of the window; it waits 120 ms before showing, so quick ones never flash it.

| Area | Screens |
|---|---|
| Today | Dashboard with filters (date range, client, organization, engagement, opportunity) |
| Companies (was People) | Two lists under one sidebar item, Companies and People, each with its own title, a primary button at the right of the title row (New company, Add contact) and the tabs to the other. Above each table: a search box that runs on Enter, a Filters menu (status and tag for companies, tag for people) showing how many are in force, a Sort menu for companies (company, domain, industry, contacts, last activity; picking the leading column again turns it round) and an Archived switch; every choice is an address, so the list is what its URL says. The table sits in a card with sortable column names for companies, and under it "Showing 1–50 of 132" beside the page links. The companies table has a Status column (from tablet width up) showing each company's status as a pill with a dot in that status's colour; the Filters menu and the status menu show the same dots. New company opens a panel at the side asking for a name and a domain (a full URL is accepted and reduced to the host), with Add company, Cancel and a link to the full form. Companies list with a side panel per company (Overview, Contacts, Activity, Tasks; opened by `?company=<id>` on the list). Overview shows the description beside a Details column that lists every standard field, a dash where one is empty, and the state of the website read. Contacts is a table with a star for the company's primary contact and an in-place add; under it, "Found on the website" lists the people the last website read found (name and role) with Add and Add all, and nobody becomes a contact until the owner adds them. A suggested person who resembles an existing contact (name similarity of 0.6, or 0.4 for someone already at this company) is shown with "Looks like <name> (<their companies>)" and two choices: say they are the same person, which puts that contact at this company under the website's title and remembers the website's name for them, or add them as a new person; Add all leaves these for the owner. Beside "Add contact", "Add existing person" picks someone already among the contacts and an optional title at this company, and a new contact refused for an existing email or a similar name offers "Add <name> to this company". A contact opens inside the same panel (`&contact=<id>`) with a way back, its own Overview, Activity and Tasks tabs, a two-column Details list, a Companies card and its emails and links. The Companies card lists every company the person is at with the title held there (editable in place), Remove, and "Add to a company". Inside a company's panel the heading gives the title and the star for that company; over the People list it gives the person's own title, names the company only when there is one, and shows a star badge for each company they are primary at. The People list shows every company beside a person, and the person's picture or initials before the name. A picture, in the People list, a company's Contacts table or the panel's header, opens larger in a dialog when clicked, at the 256 px it is stored at. The company picker is on the form for a new person only; afterwards companies are kept in the panel. The header of a company or a person has a three-dots menu (Edit, Archive or Restore, Delete), and a company with a website has Re-enrich beside it, the one way to start a website read; the status badge (a company's status, a person's relationship) is a menu that changes it in place. A company's status menu ends with "Edit statuses…", which opens the list of company statuses: each has a round swatch that opens the browser's own colour picker, so any colour can be chosen (it is saved when the picker is closed); the pill's text is the colour mixed with the theme's text colour, so a pale or a very dark pick still reads in light and dark; the five built-in ones keep their names; the owner adds their own with a name and a colour, renames them, and deletes them after a confirmation, which moves every company holding that status to Other. The owner's statuses are offered wherever a company's status is chosen: the badge, the Filters menu and the full New and Edit forms. A gear beside the Details heading of a company or a person opens the Fields panel in place of the record (`&fields=companies` or `&fields=contacts`), with a way back and Companies and Contacts tabs drawn as a pill switch; the panel is narrower than a record. Each tab has a "Standard fields" section that folds away and gives its count ("9 · reorder and hide only"), listing that kind of record's fields as plain names; pointing at or focusing a row shows its eye, to show or hide the field, and its handle, to drag it into order or move it with the arrow keys (both stay in view on a touch screen, and a hidden field keeps its crossed eye). Under it, for companies, "Suggested fields" (folded at first, "5 · one click to add") offers ready-made fields with an Add button each; an added one is no longer offered. Below is the owner's own: "No custom fields yet" with a New field button until there is one, then a "Custom fields" section listing each field with its kind or its options, arranged like the standard ones, with a three-dots menu holding Edit (rename, more options for a dropdown, and the dropdown's options listed with how many records hold each and a remove that asks first in the row and clears the option from those records) and Delete, which asks first and removes the field's values everywhere. New field asks for a name and a kind (text, number, dropdown with its options one to a line, date). Custom fields are filled in on the full New and Edit forms of a company or a person, under "Custom fields", and shown in Details after the standard fields, a dash where empty. A custom value is also changed where Details shows it (Step 9 slice 4 part 2, 2026-10-26): pressing it (a pencil shows on pointing or focus) turns it into the input its kind takes, with Save and Cancel; Enter saves, Escape cancels without closing the panel, a blank or "Not set" clears it, and a refused value keeps the editor open with the reason. Standard fields are changed on Edit only. Details follows that order and leaves hidden fields out, for every company or every person alike, and each change is saved as it is made. Deleting asks first: a company's contacts, tasks and activities stay, unlinked; a person's emails, links and tags go with them, they are taken off the activities logged with them, and their tasks stay; People list, where a person opens in the same kind of panel (`/people/contacts?contact=<id>`); `/people/contacts/<id>` redirects there. A row opens its record wherever it is clicked, and the panel slides in from the right and away again. Logging an activity, adding a task and opening an existing one from a company's or a person's Activity and Tasks tabs happen in the panel too (`&activity=new|<id>`, `&task=new|<id>`), in place of the record with a way back to the tab; saving a new one returns to that tab, inside the company when the person was opened there. The pages `/activities/…` and `/tasks/…` stay for Today, the Tasks area and the command palette. Each list's toolbar has a Columns menu that shows or hides every column but the name; the choice is the owner's for that list whatever it is narrowed to, kept in a cookie (`columns-companies`, `columns-contacts`) and not in the address. The owner's custom fields are listed under it as "Custom fields" (Step 9 slice 4 part 3, 2026-10-26), off until turned on (`columns-companies-custom`, `columns-contacts-custom`), in the Fields panel's order; a custom column shows each value as Details does, from tablet width up, and sorts by its heading or from the Sort menu (`sort=custom.<key>`): numbers as numbers and dates by date, largest first when first chosen, text and dropdowns A to Z without regard to case, records without a value last either way. The People list sorts too (by name, or a custom field) and pages by number like Companies, so its footer gives where each page starts. Custom text, dropdown and date values are found by Ctrl+K and by both lists' search boxes; numbers are not searched. Each row has a checkbox and the heading one that ticks the whole page; while any are ticked a bar at the foot of the window gives their number with Archive (Restore when the list shows archived records), Delete behind a confirmation that says what goes and what stays, and Clear. Organizations are called companies in the interface Merging two people (Step 9 slice 3, part 1, 2026-10-26): "Merge with…" in a person's three-dots menu searches for the other person and opens the two side by side in the panel (`&merge=<id>`); the open person is kept and a Swap link turns it round. Each field that differs (first and last name, title, department, phone, location as one, time zone, preferred channel, status, relationship, each custom field, the photo, the primary email) is a choice between the two, the kept value first unless it is empty; everything else the other person has (emails, links, tags, companies with their title and star, activities, tasks, workflows, material sends, profile searches) is brought over, listed, and the other person is deleted after a confirmation, in one transaction. Merging two companies (part 2, 2026-10-26) works the same way from a company's three-dots menu (`?company=<id>&merge=<id>`): each field that differs (name, website with its domain as one, phone, email, industry, description, location as one, status, each custom field, the logo) is a choice; the other company's people (someone at both is kept once, with the kept company's primary contact or else the other's), tags, activities, tasks, workflows and material sends are brought over, and its website reads come too when its website is the one kept. A merge waits while a website read is under way on either company. |
| Pipeline | The pipeline of a client is their own copy of a workflow's whiteboard, not a separate board. Built so far: on a company's or a person's board, the record is a chip (picture and name) standing on the drawn stage box it is at, on two boxes when a branching drawing has it at both, or in a "Not started" or "Done" tray at the foot of the board. The chip keeps its size at any zoom. It is dragged onto another box or a tray to move the record there; pressed, or opened with the keyboard, it gives a "Move to…" menu of Not started, every stage in order and Done; a selected stage's card has "Move <record> here". A move is a change to the drawing: one undo takes it back and it is saved with the drawing. A workflow that is only drawn has no chip. The Kanban across clients that Phase 3 Step 6 built (`/workflows/pipeline`, a column per stage named by its typed name) was removed on 2026-10-17 at the owner's request, with its tab and the "Pipeline" link on each workflow's row. A list view and the opportunity workspace wait for Opportunities |
| Work | Engagements list, engagement workspace (overview, roadmap, milestones, owed/waiting, files). Deferred by the owner on 2026-10-16 until after Phases 4 to 8, with Opportunities: a first slice was built (a Work item in the sidebar, `/work`, a company's Engagements tab) and taken out again the same day, its tables dropped by migration 0025. When it returns it starts from a won opportunity, and an engagement has no Activity or Tasks tab of its own |
| Tasks | Today, Week, All, Calendar. Calendar (2026-10-31, Phase 5 step 4, `/tasks/calendar`) is one week from the owner's "Week starts on", moved by Previous, This week and Next: open tasks on their due date and meetings on their days, each opening its own page; on a phone, a list of the days that have something |
| Workflows | Whiteboards. `/workflows` lists the owner's workflows, each with its name and description and no list of its stages, in the order the owner puts them in: a row is dragged by its handle or moved a place at a time from it with the arrow keys, each move is saved, and a new workflow goes last. "New workflow" is at the right of the title row; under the list, "Starter workflows" offers Prospecting and Website Project with an Add button each, and an added one is no longer offered. A workflow opens at `/workflows/<id>` as a whiteboard that takes the whole window, outside the sidebar and top bar: a slim header with a way back, the workflow's name and a three-dots menu (Rename, which also edits the description, and Delete after a confirmation), and under it the canvas (Excalidraw): boxes, diamonds, ellipses, arrows that stay attached, lines, free drawing, text, frames, a link on any element, and Mermaid text turned into a diagram. Selecting one box shows a card with "Make this a stage"; a stage is named by the text inside the box and listed in the order the arrows give. A shape drawn with the pen that closes into a box or a circle brings "Make this a stage?" beside it: Yes swaps the stroke for a real box or circle in the same place, size and colour, in the hand-sketched style, and one undo brings the stroke back. Pen strokes that are selected (handwriting, a scribble) show a card with a name box instead: "Make this a stage" puts a box behind them, grouped with them so they move as one, and the stage goes by the typed name, since handwriting is not read. Every stage has a soft glow behind its box that slowly grows and fades (still when the system asks for less motion): lime on a workflow that is only drawn, the colour of the stage's status on a record's board. The glow is on screen only and is not part of a saved image. The page behind the drawing is the owner's choice from "Page" in the whiteboard's menu: a dotted grid (the default), a grid of squares, ruled lines, or plain; the choice is kept in a cookie (`board-paper`) and holds for every whiteboard. The page moves and grows with the drawing as it is moved and zoomed; zoomed far out, every other mark is left out so they do not run together. It is not part of a saved image. The drawing saves itself two seconds after the last change and says so ("Saved", "Saving…", "Unsaved changes"); a whiteboard open in two places refuses the older one's save and asks for a reload, and while a change is not yet saved the browser asks before the tab is closed or reloaded. The whiteboard follows the system's light or dark theme and opens with the whole drawing in view. Left out of the whiteboard's own controls: its shared-library panel, embedding another site's page, and loading and saving files. In the sidebar Workflows comes after Tasks; the phone's bar keeps Today, Companies, Tasks and Settings, and Workflows is reached there through "Go to". On a company and a person: the panel has a Workflows tab (`tab=workflows`) with "Start a workflow", a menu of the owner's workflows and "Blank board…"; a workflow chosen there is copied to the record with every stage not started, and a blank board asks for a name and opens at once. The tab lists the record's boards as the Workflows page lists workflows: a row each with a star, the board's icon, its name (which opens the whiteboard) and its description, and no stages, since a drawing that branches has no one place it is at; a stage's status is set on the board. One board of a company or a person can be starred, as one contact of a company can; starring another moves the star, and the starred board is listed first, the rest newest first. Every workflow on `/workflows` and every record's board has an icon picker before its name: a grid of 34 plain icons in the site's style, or none; a copy takes its workflow's icon when it is started and keeps its own from then on. A record's board opens as the same whiteboard, with the record's name as the way back to its Workflows tab; a selected stage box there also shows its status as four choices (not started, in progress, done, blocked), and choosing one recolours the box. Deleting a record's board returns to that tab. A record has at most 20 boards. A selected box's card also lists the links and files that box carries: "Add link" takes an address and an optional name (a link given none goes by its site's), "Add file" takes a PDF, a picture or a Word, Excel or PowerPoint file of up to 4 MB, each opens in a tab of its own and each can be taken off; a box that carries anything has a mark above its corner with an icon for each kind it carries (PDF, Word, Excel, PowerPoint, picture, link, note) and a count where there are several, on a workflow and on a record's board alike, and the card's list uses the same icons. The card also lists the box's notes: "Add note" takes up to 2,000 characters, each note is shown as plain text under the time it was written and can be taken off, and a board carries at most 200; the notes go with the workflow when it is started on a record. Pictures go on the whiteboard with its picture tool, by pasting or by dropping a file: PNG, JPEG, GIF and WebP are kept, each at most 1440 px on its longer side, and a picture of any other kind (SVG, BMP, AVIF, an icon) is taken off again with a sentence saying why. A picture is still there after a reload and on every copy of the workflow started on a record; while one is on its way to be stored the whiteboard says "Saving…" and the browser asks before the tab is closed. On a phone the save state beside the tools is its coloured dot alone (green saved, amber not yet, red failed), since the tools take the whole width; a save that failed or stopped is still said in words. Colours (2026-10-25): at the top of the whiteboard's properties panel (beside the drawing, or the sheet above the foot on a phone) a grid of this app's own takes the place of the whiteboard's Stroke and Background rows: Line and Fill, a light, a bright and a dark shade of ten hues, six greys and no colour, and how much shows through (100, 75, 50 or 25 %). A choice colours what is selected (with its line, the text inside a selected box too) and the next thing drawn, and one undo takes it back; on a record's board a stage's fill still follows its status |
| Materials | Library, material detail with versions; send history on the records sent to. Built so far (Phase 3 Step 8, slice 1): Materials in the sidebar after Workflows (reached through "Go to" on a phone) and "New material" in the command palette. `/materials` lists the owner's materials in a card (name, type, the current version's label, last change) with a search by name that runs on Enter, a Filters menu by type, a Sort menu (name, type, last change) and "Showing 1–50 of n" with pages of 50. New material asks for a name (not one the owner already has, whatever its case), a type (proposal, quote, deck, portfolio, contract, report, design, deliverable, link, other), a description and, optionally, a link or an uploaded file that becomes its first version ("v1" unless named); with a file, the material is made only if the file is kept (2026-10-22). A material's page (`/materials/<id>`) shows its name, type and description, a three-dots menu with Edit and Delete (after a confirmation that says its versions and their files go too), and a Versions card listing its versions newest first, the newest marked Current, each with its kind's icon, label, the file's name and size or the link's site, and the day it was added; each opens in a tab of its own and can be removed. "Add version" takes a label (the next number offered) and either a link or an uploaded file: a PDF, a picture or a Word, Excel or PowerPoint file of up to 4 MB. Each version has an Edit (2026-10-22) that opens it in place: its label can always change; until it has been sent, a link or another file can be put in place of what it holds; once sent, what it holds stays and a new version is added instead. An edit leaves the version where it is in the list. Sends (slice 2, 2026-10-18): "Log a send" is beside "Log activity" in a company's and a person's Activity tab (in the panel, `&send=new`, with the person and their company filled in). It asks for the material and the version (the current one first), when, how (email, WhatsApp, LinkedIn, in person, other), one or more people, an optional company and a note; saving returns to where it was opened. A send shows on the Activity tab of each person and the company it went to, and on Today's recent activity, as "Sent material" with "<material> · <version>" linking to the material's page, how it went, the people, the note, its status (sent, viewed, accepted, rejected, superseded) as a menu that changes it in place, and a remove for one logged by mistake. Sending a newer version marks an older send that is still sent or viewed superseded once everyone it went to has had a newer one. Who got what is activity, so it is logged and read only on the records it went to: the material's page had a Sends card and its own "Log a send" until 2026-10-22, when the owner had both taken off. A version that has been sent says how often and offers no remove; deleting a material says its sends go with it. There is no Materials tab on a record |
| Brainstorming | Asked for by the owner on 2026-10-24: Miro-like whiteboards of the owner's own for notes and ideas, apart from workflows and from any client. Brainstorming in the sidebar after Materials (through "Go to" on a phone) and "New brainstorm board" in the command palette. `/brainstorm` lists the boards, the one drawn on last first, each with an icon picker (the workflows' 34 icons), its name and the day it was last edited, with a search by name and pages of 50; "New board" asks for a name (not one the owner already has, whatever its case) and opens the board. A board (`/brainstorm/<id>`) takes the whole window as a workflow's does, with a way back to Brainstorming, its name and a three-dots menu (Rename, Delete after a confirmation), and the same whiteboard: every drawing tool, the page behind the drawing, saving two seconds after the last change, the leave prompt. There are no stages, glows, record chips or links, files and notes on boxes. "Sticky note" at the top right (above the bar at the foot on a phone) adds a 200 px square in one of the colour grid's light and bright colours (light yellow first; the menu beside it picks another, 2026-10-25) near the middle of the screen where it covers nothing, ready to type on; it is a plain box with its text, so it moves, resizes and takes arrows like any other. It looks like a sticky note (2026-10-26): square corners, a soft shadow deepest at its foot, a faint shading, and in the dark theme its own bright colour with dark text, as in the light theme. A note carries a mark in the drawing (`customData.sticky`), so it keeps the look after a reload and when pasted onto a workflow's board; notes put down before the mark get it as the board opens. A board is found in the palette under "Brainstorm boards". At most 200 boards. Pictures (2026-10-24) are kept as on a workflow's board: dropped, pasted or added with the picture tool, stored once as WebP no larger than 1440 px, fetched again when the board opens, at most 100 a board, out of the owner's 200 MB; one that cannot be kept (SVG, over 4 MB, no room) comes off the board with a sentence saying why |
| Money | Overview (revenue), invoices, invoice detail, payments, reports |
| Reports | Pipeline, outreach, revenue, follow-up compliance. Built so far (Phase 4 Step 4 part 1, 2026-10-27): a Reports tab under Money (`/money/reports`, the owner's choice), after Overview, Invoices and Payments, with the overview's period menu and From and To, and four cards: revenue by month (a bar chart and a table), by client (the top ten, all of them on a page of their own), by service, and time to payment, defined in section 10. Each states what it counts, says "Not enough data" when nothing does, and opens its rows: the Payments list for a month or a client, or a page of rows (`/money/reports/<report>`, pages of 50) for a service, money not yet put towards an invoice and the invoices paid in full. Part 2 (2026-10-28) added three cards under "Follow-ups and sales": follow-up compliance, reply rate and proposal acceptance, each a percentage with what it was counted out of, opening its rows (`/money/reports/follow-ups`, `/replies`, `/proposals`), each row opening the task, the person or the material |
| Assistant | Side panel everywhere, full-page history |
| Settings | Profile, integrations, AI providers, enrichment providers, memory, custom fields, data export, security, audit log. Built so far: Profile, Integrations, Security, System status, Audit log and Export. Integrations (2026-10-29, Phase 5 step 1, `/settings/integrations`) takes the owner's Google OAuth client (stored encrypted, shown by the end of its ID), connects and disconnects Google Calendar, tests the connection and guides the client's setup with the redirect address to copy; an expired connection shows a banner on every page. Export (2026-10-29, Phase 4 step 5) is a tab after Audit log (`/settings/export`) with "Download export": one zip, `touchpoint-export-<date>.zip`, holding a README, `data.json` (every table of the owner's data as stored, drawings and the audit log included, under a `format`, `formatVersion`, time zone, base currency and the owner's name and email) and a `csv` folder of spreadsheets readable in Excel or Google Sheets (companies and people with their custom fields as columns, tasks, activities, materials (a row per version), material sends, invoices (total, paid, still owed and the status the app shows), invoice lines and adjustments, payments, workflows, brainstorm boards and the files in use), names written in instead of ids, amounts as plain decimals beside their currency, times in the owner's zone. Left out: sign-in (password, sessions, tokens), the job queue, the bytes of files, pictures, logos and photos (files.csv lists them), search indexes and the page text a website read kept. The tab says when the last export was made; at most 5 an hour |
| Public pages | `/about` (what Touchpoint is and how it uses Google) and `/privacy` (what it keeps, the Google data it reads and Google's Limited Use statement), open without signing in and linked from the sign-in page (2026-10-30). Google requires both before the owner's OAuth client can be published; `GOOGLE_SITE_VERIFICATION` puts Search Console's ownership tag on every page and `CONTACT_EMAIL` an address on the privacy page |
| Onboarding | First-run wizard, re-openable from settings |

Every workspace page (contact, organization, opportunity, engagement) uses the same tabs: Timeline, Tasks, Roadmap, Materials, Money, Emails. This is what makes records feel connected instead of living in separate modules.

Money (2026-10-27, Phase 4 step 1): the owner designs each invoice in Figma, so Touchpoint keeps a record of it and never lays one out or makes a PDF. "Invoices" in the sidebar after Materials (named "Money" until the owner renamed it on 2026-10-27, with the record tab) (through "Go to" on a phone) opens `/money/invoices`: number, client (logo or photo), issue and due dates, total and a status pill (Draft, Issued, Void), with search by number or client, Status and Currency filters (Currency once there are two), sort by number, issue date, due date or total, and pages of 50; `?company=` or `?person=` narrows it to one client. "New invoice" (also in the palette, and on a company's or person's Invoices tab with the client filled in) takes the number as it is on the invoice, the client picked by search among companies and people, the issue date (today in the owner's zone) and due date (15 days later until changed), a currency (the base one at first; any currency), lines (description, service, quantity to two decimals, price; the amount and the total are shown as typed), discounts and write-offs with a reason, notes and optionally the exported PDF or picture; it is saved as a draft or as issued. There are no tax fields: tax is typed as a line. `/money/invoices/<id>` shows it with its lines, adjustments, total and file (attach, replace, remove; opens in a tab of its own) and a three-dots menu: Edit (not once void), Mark as issued and Delete for a draft, Void for an issued invoice after a confirmation, and Delete for any invoice after a confirmation (owner's choice, 2026-10-28). A company's and a person's panel has an Invoices tab listing their invoices; a company or person with invoices cannot be deleted (archive them instead), and a merge moves the other record's invoices to the one kept. Ctrl+K finds invoices by number.

Payments (2026-10-27, Phase 4 step 2): the Invoices page has two tabs, Invoices and Payments (`/money/payments`). An invoice's status pill is worked out, never stored: Draft, Unpaid, Partly paid, Overdue (issued, still owing, past its due date in the owner's zone), Paid or Void, and the list's Status filter offers the same six. "Record payment" (on an issued invoice that still owes, on the Payments list, on a company's or person's Invoices tab, and in the palette) takes who paid (a company or person, by search), the date it arrived (today, never later), the amount and currency (the base one, or the invoice's), the rate to the base currency for any other, how it was paid (bank transfer, UPI, card, cash, cheque, other), a reference and notes, then lists the client's open invoices in that currency with an amount box each, filled from the amount oldest due first (the invoice it was opened from first) and editable; what is not put towards an invoice stays on the payment as unallocated. A second form sent twice records once; the same client, amount, date and reference as an existing payment stops the form with "Record anyway". From an invoice it returns to the invoice, whose footer and figures show Paid and Still owed and whose Payments card lists them. A payment's page (`/money/payments/<id>`) shows it, the invoices it paid and, while some is unallocated, "Put towards an invoice"; Delete (after a confirmation) removes it, and its invoices owe that again. An invoice with payments is not edited or voided until they are deleted, but it can be deleted: the confirmation asks whether to keep its payments, with what they put towards it left unallocated, or to delete them too (owner's choice, 2026-10-28). A company or person with payments cannot be deleted, and a merge moves them. Refunds, imported payments and a payment edited after it is recorded are not built.

Revenue overview (2026-10-27, Phase 4 step 3): the sidebar entry is "Money" again and opens `/money`, an Overview tab before Invoices and Payments (the tab on a company or person stays "Invoices"). A period is picked from a menu (This month, the default, Last month, This quarter, This year, Last 12 months, All time; calendar quarters and years) or typed as From and To, and the figures are for every client or one picked by search; each choice is in the address. Received is the payments dated in the period in the base currency, a payment in another currency counted at the rate stored with it and said under the figure ("Includes $1,200 at your recorded rates"); a payment with no rate to the base currency (one recorded before it was changed) is left out and named. Invoiced is the issued invoices dated in the period, drafts and void ones left out, one figure per currency. Outstanding today is what issued invoices still owe now, whatever the period, per currency, with how much is overdue. Every figure is a link to the Payments or Invoices list narrowed to exactly its rows (both lists take a date range; the Invoices list's Status filter also offers All issued and Outstanding). Today shows Received this month, Invoiced this month and Outstanding today in the base currency once any invoice or payment exists, other currencies named after the figure, each opening its rows.

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
| Workflow whiteboard | `@excalidraw/excalidraw` (MIT), pinned | Free drawing, shapes, attached arrows and links in one maintained component; tldraw needs a licence key and shows a watermark | Custom canvas; React Flow (nodes only, no free drawing) |
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

Generated `tsvector` columns with GIN indexes on contacts, organizations, opportunities, activities, materials, email messages. `pg_trgm` handles fuzzy names and duplicate detection. Embedding-based search is added later and only when an embedding provider is configured. Built so far: the columns on contacts and organizations (Phase 3 Step 1) and on activities (title, body, outcome) and tasks (title, notes), migration 0028; materials and workflows are matched by name with `ilike` and `word_similarity`, since a library and a list of workflows stay small. One query per kind runs in `src/modules/search`, for the command palette.

### 7.7 Files

`storage` interface with `put`, `get`, `delete`, `signedUrl`. Drivers: local disk (VM/PC) and S3-compatible. With no driver configured, materials are links only and upload controls are hidden. Uploads: size cap, MIME check by magic bytes, sha256 de-duplication.

Built so far, ahead of that interface: files on a workflow's boxes, pictures on a whiteboard and materials' versions are kept in Postgres (`files`, section 8.4), since the free hosting has no disk, so uploads are shown whether or not a driver is configured. A storage driver is not built yet.

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
| `integration_clients` | provider, client_id, client_secret_enc, key_version | The owner's own OAuth client, typed in Settings (owner's choice, 2026-10-29); unique (owner, provider). Migration 0035 |
| `integration_connections` | provider, account_email, scopes[], status (connected/expired/revoked/error), encrypted tokens (refresh_token_enc, access_token_enc, access_expires_at, key_version), sync_cursor, last_sync_at, last_refresh_at, last_error, connected_at | Drives the integration status page; unique (owner, provider). Migration 0035 |
| `audit_log` | actor (user/ai/job/system), action, entity_type, entity_id, before, after, tool_execution_id | Append-only |
| `jobs` | See 7.5 | |

### 8.2 People

| Table | Key columns | Constraints and deletion |
|---|---|---|
| `organizations` | name, domain, website, phone (as written, 7 to 15 digits), email, industry, description, city, region, country, status (one of the built-in prospect/client/past_client/partner/other, or the key of one of the owner's `company_statuses`), custom (jsonb, `{}` by default: the values of the owner's own fields by key), search (generated tsvector of name, domain, industry, city and the custom values that are text, since 2026-10-26) | Unique (owner, domain) when domain is set; the domain is stored normalised (`example.com`). No database rule lists the statuses since migration 0014: the organizations service accepts a status only if it is built in or the owner has it |
| `company_statuses` | owner_id, key, label, color (`#` and six lowercase hex digits, enforced by a check constraint since migration 0015, which turned the nine colour names used before into their hex values), created_at, updated_at | A company status the owner made, or the colour they gave a built-in one (a row under the built-in's key, whose label is not read); unique (owner, key). The key is made from the first name given and never changes, so renaming keeps every company on it. At most 20 of the owner's own; a name may not repeat a built-in's or another of theirs. Built-in statuses cannot be renamed or deleted. Deleting one of the owner's sets every company holding it to `other` in the same transaction |
| `contacts` | first_name, last_name, full_name (generated), job_title (the person's own), department, phone_e164, city, region, country, timezone, preferred_channel (email/phone/linkedin/whatsapp/other), status (active/dormant/do_not_contact), relationship_type (prospect/client/partner/referrer/vendor/other), custom (jsonb, `{}` by default: the values of the owner's own fields by key), search (generated tsvector of first and last name, job title, department and the custom values that are text, since 2026-10-26) | The companies a person is at are rows of `contact_organizations`. A contact is archived to hide it, or deleted from its panel after a confirmation: emails, links, tag joins and `activity_contacts` rows cascade, tasks keep with `contact_id` null |
| `contact_organizations` | contact_id, organization_id (together the primary key), job_title (the title at this company; where empty the person's own is shown), listed_as (the name this company's website gives the person when it differs, so the website stops offering them as new), is_primary (the company's primary contact) | One row for each company a person is at; a person can be at several and stays one record, with one set of emails, picture, tasks and activity. Rows go with either the contact or the company (cascade), so deleting a company leaves its people in place at their other companies. At most one primary contact per company (partial unique index), and a person may be it at more than one; the first active person put at a company gets it, and archiving a contact clears it everywhere. Replaced `contacts.organization_id` and `contacts.is_primary` in migration 0009, which copied every existing link first |
| `contact_emails` | contact_id, email, label, is_primary; `verification` is added with the first feature that sets it (enrichment or Gmail) | Unique (owner, email); one primary per contact |
| `contact_links` | contact_id, kind (linkedin/x/github/website/other), url | |
| `tags`, `contact_tags`, `organization_tags`, `opportunity_tags` | | Explicit join tables keep foreign keys real |
| `custom_field_defs` | owner_id, entity_type (organization/contact), key, label, type (text/number/select/date), options (jsonb list, for a select), created_at, updated_at | A field the owner added to every company or every person; unique (owner, entity_type, key). The key is made from the first name given and never changes, so renaming keeps the values. Values live in the record's `custom` jsonb and are accepted only for a field the owner has, in that field's own kind: text up to 500 characters, a number, one of a select's options, a date. At most 50 fields per kind of record and 30 options per select; a name may not repeat a standard field's or another custom field's. Options are added on Edit; one is removed only while another remains, and removing it clears it from every record of that kind that held it. Deleting a field removes its value from every record and its place in `field_layouts`. Suggested fields (Segment, Territory, Lifecycle stage, Lead source, ICP fit score, for companies) are defined in code and added by key |
| `field_layouts` | owner_id, entity_type (organization/contact; together the primary key), fields (jsonb: `{ key, hidden }` in display order), updated_at | The order of Details and what it leaves out, one row per kind of record. No row means the built-in order with nothing hidden. A saved layout may name only fields that record has; a field it has never seen is shown at the end, so one added later still appears. A custom field is listed as `custom.<key>`; Details shows the standard fields first and the custom ones after, and the two are arranged apart |
| `contact_photos` | contact_id (primary key), content_type, bytes, sha256, source_url, fetched_at | A person's picture from their company's website, stored as WebP fitted to 256 × 256; deleted with the contact. A removal by the owner is a `field_provenance` row (contact, `photo`, manual) |
| `profile_searches` | contact_id, status, results | One search by name for a person's LinkedIn, X and GitHub profiles (Tavily, optional `TAVILY_API_KEY`). `results` holds the candidates still on offer (`kind`, `url`, `title`); the rows are also what the search limits count. Deleted with the contact |
| `enrichment_runs` | organization_id, provider (`website`), status (queued/running/done/failed), input (`{ url }`), raw_result (the extracted values, never the page), error (a short code), started_at, finished_at; `reviewed_at` is added with the review screen | Deleted with its organization. At most one read per company per minute and 20 per owner per hour |
| `field_provenance` | entity_type, entity_id, field, source (manual/website; key-based providers add theirs), confidence (verified/inferred/guessed: `inferred` is what the site states, `guessed` is what the read worked out from a hint; `uncertain` is added with the first provider that reports it), retrieved_at, run_id | Unique (owner, entity, field). A read fills a field only when it is empty and has no `manual` row, or when its value is a guess and the site now states it; a guess replaces nothing; editing or clearing a field writes a `manual` row |
| `organization_logos` | organization_id (primary key), content_type, bytes (bytea, at most 100 KB), sha256, source_url, fetched_at | Kept apart from `organizations` so lists never load image bytes. PNG, JPEG, GIF, WebP or ICO by magic bytes; SVG is refused. Stored as WebP fitted to 192 × 192, except an ICO, which is kept as it came. Served only to the owner at `/api/organizations/<id>/logo` |

Organization details are stored once on the organization; contacts show them by reference.

**Duplicate handling:** exact match on email and on organization domain blocks creation with a link to the existing record; trigram similarity on name plus organization raises a warning; merge keeps one record and re-points all links in a transaction. Built for people (2026-10-26, `mergeContacts` in `src/modules/contacts/merge.ts`): both are locked, together they may have at most 20 tags and 20 workflows, a shared activity or send keeps one row for the kept person, the photo and its `field_provenance` row follow the choice, and one `contact.merge` audit row holds both people as they were. Built for companies (2026-10-26, `mergeOrganizations` in `src/modules/organizations/merge.ts`): the same locks and limits, refused while a website read is queued or running on either, each picked field's `field_provenance` rows follow the value, the logo and the website reads follow their picks, and one `organization.merge` audit row holds both companies as they were.

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
| `workflow_boards` | name, description, scene, stages, version, position, starter_key, icon, starred, source_board_id, organization_id, contact_id | One row per whiteboard. With no company and no person it is a template; a copy started on a record carries that record and the template it came from |
| `files` | content_type, size, sha256, bytes | An uploaded file, its bytes kept in Postgres: one stored copy per owner and sha256, 200 MB an owner |
| `workflow_attachments` | board_id, element_id, title, url, file_id | A link or a file on one box of a board: exactly one of `url` and `file_id` is set |
| `workflow_notes` | board_id, element_id, body | A note on one box of a board, as plain text of up to 2,000 characters |
| `workflow_pictures` | board_id, file_key, file_id | A picture drawn on a board, once per board under the whiteboard's own id for it |

See section 9 for behaviour.

Built so far (migrations 0017 and 0018): `workflow_boards`. Migration 0023 added `icon` (a key from the list in code, its shape held by a check) and `starred` (only on a record's board, at most one per company and one per person by two partial unique indexes). `name` is unique per owner among templates without regard to case; `scene` is the drawing as the whiteboard gave it (`{ elements }`); `stages` is worked out from the scene on every save (`[{ elementId, name, status }]`, by `stagesOf` in `src/modules/workflows/stages.ts`) so that a list never opens a drawing; `version` goes up with every save and a save made from an older one is refused; a check allows at most one of organization_id and contact_id, and a board goes with the record it belongs to. Migration 0018 dropped `workflow_templates`, `workflow_template_stages` and `workflow_template_edges`, the stage-list design built first (migration 0016) and replaced at the owner's request on 2026-10-13. An owner has at most 50 workflows; a drawing at most 10,000 elements, 3 MB and 100 stages. Migration 0019 added `position`, where a template stands in the owner's list (ties fall back to the name, so workflows never moved stay in name order). A copy is a row with the record's id, the template's id in `source_board_id` (emptied if the template is deleted) and the template's drawing with the same element ids; a record has at most 20.

Migration 0020 added `files` and `workflow_attachments`. A file's kind is read from its bytes when it is stored (`fileType` in `src/modules/files/sniff.ts`) and never taken from the upload; the same bytes are stored once per owner, and a file is deleted when the last attachment pointing at it goes, whether that was removed by hand or went with its board, or with the board's company or person (`dropUnusedFiles`). An attachment names its box by the whiteboard's own element id, and there is no `kind` column: a row is a link when `url` is set and a file when `file_id` is. A board carries at most 50, a file is at most 4 MB, and an owner uploads at most 30 in a minute. A copy of a workflow gets rows of its own that point at the same stored files. Migration 0022 added `workflow_notes`: a note on one box of a board, named by the whiteboard's element id like an attachment, copied with its time when the workflow is started on a record, and dropped with its board or, once its box is gone from the stored drawing, when the whiteboard is next opened.

Migration 0021 added `workflow_pictures`. The whiteboard gives each picture an id (a hash of the file as it was added) and every element showing that picture names it, so a picture is kept per board and id (`file_key`), not per element: duplicating or pasting a picture stores nothing more. The bytes are never kept as they came: they are read as a picture and written out again as WebP no larger than 1440 px on the longer side, the bound the whiteboard itself shrinks a picture to, without the file's metadata (`addPicture` in `src/modules/workflows/pictures.ts`, through the same `compressImage` as logos and contact photos). The result is a row in `files` like any upload, so the 200 MB an owner may store and the rule that the same bytes are stored once cover pictures too, and `dropUnusedFiles` counts a file as used while an attachment or a picture points at it. A board holds at most 100 pictures, and an owner sends at most 60 in a minute. A copy of a workflow gets rows of its own for the pictures its drawing shows, pointing at the same stored files.

`brainstorm_boards` (migration 0029, additive, 2026-10-24): name (citext, unique per owner), icon, scene, version. A whiteboard of the owner's own on no record: no stages column, nothing copied, and `customData` dropped from every element it saves. `updated_at` is set by the database's clock on every change, and the list is in that order.

`brainstorm_elements` (migration 0034, 2026-10-28): one row per element of a brainstorm board's drawing: owner, board (cascade), the element's id (with the board, the key), the whiteboard's version and nonce for it, deleted or not, the element as jsonb, its size and the board's clock when it last changed. `brainstorm_boards` gains `clock`, `live`, `bytes` and `pruned`. The migration moved every board's `scene` into rows at clock 1 and emptied it; `scene` and `version` are no longer read and are dropped later. A device saves only what it changed and merges what other devices saved, the way Excalidraw merges a drawing shared live; a board holds up to 100,000 elements and 50 MB.

`brainstorm_pictures` (migration 0030, additive, 2026-10-24): owner, board (cascade), the whiteboard's id for the picture (unique per board) and the stored file, as `workflow_pictures` is. A file is freed only when no workflow picture, brainstorm picture, box or material version points at it.

### 8.5 Tasks and calendar

| Table | Key columns | Notes |
|---|---|---|
| `tasks` | title, notes, search (generated tsvector of title and notes), status (open/done/cancelled), priority (low/normal/high), due_on (the owner's calendar date, set for every task with a due date), due_at (the instant, set as well when the task has a time), snoozed_until, completed_at, recurrence_rule (RRULE: FREQ, INTERVAL, BYMONTHDAY), origin (manual/follow_up/workflow/ai/meeting), optional contact_id, organization_id, opportunity_id, engagement_id, instance_stage_id, milestone_id | One row, many optional links: appears everywhere, counted once. A CHECK requires due_on whenever due_at is set; due_on of open timed tasks is recomputed if the owner changes time zone. Link columns are added in the phase step that builds their target |
| `reminders` | task_id (calendar_event_id comes with the calendar), remind_at, channel (in_app; push and email are added when they can deliver), status (scheduled/sent/cancelled), sent_at, dismissed_at | Status reflects what actually happened. The job is found by its dedupe key `reminder:<id>` |
| `calendar_events` | connection_id, external_id, title, all_day, starts_at and ends_at (timed) or starts_on and ends_on (all-day), timezone, location, meeting_url, html_link, attendees, optional organization link (opportunity and engagement links come with those modules) | Unique (connection, external_id). A copy of the primary calendar's meetings, without descriptions; deleted on disconnect and when another account connects |
| `calendar_event_contacts` | event_id, contact_id | Worked out from the attendees on every sync |

All instants are stored in UTC and displayed in the owner's time zone; all-day items keep a date without a time. Time zone arithmetic is done in application code and never in SQL: stock Postgres images do not ship legacy zone names such as `Asia/Calcutta`, which browsers and Node still report. Recurrence creates the next task when the current one is completed, in the same transaction, skipping occurrences that are already in the past and carrying the reminder forward at the same lead time. An in-app reminder is delivered by the `reminder.send` job and shown on Today until it is dismissed or its task is closed.

### 8.6 Activities and email

| Table | Key columns | Notes |
|---|---|---|
| `activities` | kind (note/call/meeting/email/linkedin/message/decision/objection/commitment), direction (inbound/outbound, optional), occurred_at, title, body, outcome, search (generated tsvector of title, body and outcome), source (manual/gmail/calendar/ai), optional organization/opportunity/engagement/email_message/calendar_event links | The manual and communication log. An activity has at least one contact or an organization. Link columns other than organization are added in the phase step that builds their target. A mistaken entry is deleted outright and kept in the audit log |
| `activity_contacts` | activity_id, contact_id | An activity can involve several contacts |
| `email_threads` | connection_id, external_thread_id, subject, last_message_at, optional opportunity/engagement links | |
| `email_messages` | thread_id, external_message_id, from, to, cc, sent_at, direction, snippet, body_text (size-capped), has_attachments | Only threads involving a known contact are stored |
| `email_message_contacts` | | |
| `email_attachments` | message_id, filename, mime, size, external_attachment_id | Metadata only; content fetched on demand |
| `email_drafts` | connection_id, thread_id, to, subject, body, status (draft/approved/sent/failed), created_by (user/ai), sent_message_id, error | "Sent" is set only after Gmail returns a message ID |

The **timeline** is a database view that unions activities, stage transitions, payments, material sends, meetings that have started (since Phase 5 step 3, migration 0037) and email messages, ordered by time. System events are therefore not duplicated into the activity table. Each row carries owner_id, event_type, event_id, occurred_at, kind, direction, title, body, outcome, organization_id and contact_ids (an array), so one query serves a contact's or an organization's Timeline tab. Built so far: activities and, since migration 0027, material sends (kind is the channel, title "<material> · <version>", body the note, plus material_id and status, which are null for an activity); each later step adds its own branch to the union.

Logging an activity can create a follow-up task (origin `follow_up`) in the same transaction, linked to the first contact and the organization.

### 8.7 Materials

| Table | Key columns | Notes |
|---|---|---|
| `materials` | name, type (proposal/quote/deck/portfolio/contract/report/design/deliverable/link/other), description | |
| `material_versions` | material_id, version_label, file_id or url | |
| `files` | driver, storage_key, filename, mime, size, sha256 | Unique (owner, sha256): one stored copy per file |
| `material_sends` | material_version_id, sent_at, channel, evidence (manual/email_detected), email_message_id, status (sent/viewed/accepted/rejected/superseded), optional organization/opportunity/engagement links | One material, many sends, no file duplication |
| `material_send_recipients` | send_id, contact_id | |

Built so far (migration 0026): `materials` (name as citext, unique per owner; type, held by a check to the ten kinds; description) and `material_versions` (material_id, label, exactly one of url and file_id by a check, and title, the name a file was uploaded under). A version's file is a row of the shared `files` table of section 8.4, not the driver-based one above: its kind is read from its bytes, the same bytes are stored once per owner, and `dropUnusedFiles` keeps a file while a box, a picture or a version points at it. Deleting a material takes its versions with it. At most 500 materials an owner and 50 versions a material; the current version is the one added last. Migration 0027 adds `material_sends` (version_id, cascading with its version; sent_at; channel and status, each held by a check; organization_id, set null when the company goes; note) and `material_send_recipients` (send_id, contact_id, both cascading), and replaces the `timeline` view with a branch for sends. The evidence and email_message_id columns wait for Gmail in Phase 5, and the opportunity and engagement links for those records. A version with a send cannot be removed; at most 30 sends are logged a minute. `proposals` waits with Opportunities.

### 8.8 Money

| Table | Key columns | Notes |
|---|---|---|
| `invoices` | number, organization_id or contact_id, engagement_id, issue_date, due_date, currency, status (draft/issued/void), notes, file_id, file_name | Unique (owner, number). Paid, partial and overdue are **derived**. A record of an invoice made elsewhere (Figma); `file_id` is the exported PDF or picture in `files`. Exactly one client; a client with invoices is not deleted. `engagement_id` waits with Engagements (migration 0032 has none) |
| `invoice_lines` | invoice_id, position, description, quantity, unit_amount_minor, amount_minor, service_category | Quantity to two decimals; the amount is worked out on the server, rounded half up. No tax column: tax is a line |
| `invoice_adjustments` | invoice_id, amount_minor, reason | Discounts and write-offs, kept visible |
| `payments` | organization_id or contact_id, received_on, amount_minor (> 0), currency, method, reference, notes, fx_rate_to_base, idempotency_key | Unique (owner, idempotency_key). The payer is the client, exactly one, and a client with payments is not deleted. `fx_rate_to_base` only for a currency other than the base one. Migration 0033 leaves out `kind` (refunds are not built) and `external_ref` (no import yet) |
| `payment_allocations` | payment_id, invoice_id, amount_minor | Unique (payment, invoice). Sum per payment ≤ payment amount; sum per invoice ≤ invoice balance; enforced in the transaction. Only the client's issued invoices in the payment's currency; an invoice with allocations is not edited or voided; deleting it removes its allocations (the payments kept, unallocated) or its payments, as the owner chooses |
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

**Changed design (owner's decision, 2026-10-13).** This section first described stages kept as rows and moved by a `transition()` service, with checklists, required fields, tasks made on entering a stage and an append-only history. A list editor for that was built, and the owner found it too plain: a workflow is now a whiteboard drawn freely. What that design had and this one does not, unless it is asked for again: checklists and required fields on a stage, tasks made on entering a stage, deadlines, forced moves with a reason, the move history and the time-in-stage figures.

- **Whiteboard.** A workflow is one drawing (Excalidraw): boxes, arrows, free strokes, text and frames, saved whole in `workflow_boards.scene`.
- **Stages.** Any box, diamond or ellipse can be made a stage; the mark and its status are kept on the element itself (`customData.stage`). A stage is named by the text inside it; a stage made around handwriting, whose box holds no text, goes by a name kept in the mark (`customData.stage.name`, up to 200 characters). A shape drawn with the pen is not a stage itself: taken up, it is swapped for a real box or circle, since arrows attach only to those and only those hold text. Their order follows the arrows that join them, and for boxes no arrow joins, how they read on the page: top to bottom, then left to right.
- **Template and copy.** Starting a workflow on a company or a person copies the template's drawing, every stage set to not started. Changing a copy never touches the template or another client's copy, and changing the template never changes a copy. A copy keeps the template's element ids, so copies of one template can be lined up stage by stage.
- **Status.** A stage is not started, in progress, done or blocked, and takes its colour from that. Where a client stands is read from the stored list of stages, without opening the drawing.
- **Saving.** The whiteboard saves the whole drawing a little after the last change, from the version it loaded; a save from an older version is refused, so a drawing open in two places cannot silently lose work. Saves are not written to the audit log; creating, renaming, reordering, deleting and starting a workflow are. Moving a client along its stages is a change to the drawing like any other (below), so it is saved, and can be undone, with the rest of it.
- **Links and files.** A box can carry links and uploaded files (PDFs, pictures, and Word, Excel and PowerPoint files), kept in Postgres up to 4 MB each and 200 MB an owner; anything else or larger is attached as a link. They are kept beside the drawing, not in it, so adding one does not move the drawing's version on, and it goes only on a box of the drawing as stored (the whiteboard saves first). Starting a workflow on a record copies what its boxes carry without storing a file again. What a deleted box carried is removed when the whiteboard is next opened and not when the box is deleted, since until then an undo can bring the box back.
- **Pictures.** A drawing holds only a picture's id; the bytes are kept beside it. A picture put on the whiteboard is sent to be stored first, and the element showing it goes with the drawing's save only once it is, so a stored drawing never shows a picture that is not there. As a whiteboard opens it is given the ids of its board's pictures and fetches each. A picture nothing in the stored drawing shows is removed when the whiteboard is next opened and not when it is deleted, since an undo could bring it back until then; one stored in the last ten minutes is left, because the drawing that shows it may still be on its way from a page that was just closed.
- **The whiteboard is the pipeline.** On a company's or a person's own copy, the record stands as a chip (its picture and name) on the stage box it is at: on each stage in progress or blocked, or with none of those, on each stage it can begin, so a drawing that branches can show it on two. Not begun, or every stage done, it sits in a "Not started" or a "Done" tray at the foot of the board. Which stage leads to which is read from the arrows between stage boxes; an arrow drawn back to an earlier stage in the stage order is not followed, and a drawing with no arrows between its stages goes by the stage order. Moving the record to a stage (dragging the chip onto the box, choosing it from the chip's menu, or "Move here" on a stage's card) marks every stage upstream of it done and that stage in progress, starts again what is downstream (done or in progress go back to not started; blocked stays blocked) and leaves another branch as it is. The box the chip is moved from (every box it stands on, for "Move here") is left behind even when no arrow joins it to the new one: done when it comes earlier in the stage order, otherwise not started, so a move never leaves a second chip behind; a record is put on two branches at once by setting both stages in progress on their cards. Moving it to a tray sets every stage so. A board with no stages yet shows the chip in "Not started". The drawing is never read for handwriting: a stage's box, where it sits and the arrows are what count. A cross-client Kanban (one template's copies in a column per stage) was built in Phase 3 Step 6 and taken out on 2026-10-17 at the owner's request: its columns, named by typed stage names, looked nothing like the drawings, and the owner wanted the pipeline on the record's own drawing.

Built so far: the whiteboard, stages and their order, templates in the owner's own order, the two starters, copies and blank boards on companies and people, the status of a stage set on the board, links and files on a box, pictures, and the record's chip on its own board.

Seed templates (editable, not hard-coded): Prospecting, Website Project, each a row of stage boxes joined by arrows. They are offered on the Workflows page and added in one click, not written when the account is made, so an account older than the feature gets them too; once added a starter is an ordinary workflow, and it is offered again only if it is deleted.

**Order of work (owner's decision, 2026-10-13).** Workflows are built before opportunities exist, so a copy belongs to a company or a person; an opportunity and an engagement are further kinds of record it can belong to, added with their modules. Until then a stage called Won or Lost sets nothing else.

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

**As built (Phase 4 Step 4 part 1, 2026-10-27).** Revenue by month is the payments received in the period, per calendar month of `received_on`, in the base currency at each payment's stored rate (as Received); its months run from the first payment in the period to the period's end or today, whichever is sooner, a month with nothing showing nothing. Revenue by client groups the same payments by who paid. Revenue by service splits each allocation of a payment received in the period across its invoice's lines by their amounts and groups the shares by the line's service ("No service named" for none), each service rounded once, so the rows can differ from Received by a minor unit (the card says so when they do); what payments have not yet been put towards an invoice is a row of its own. Time to payment is the mean, rounded to a day, of the days from `issue_date` to the day the invoice was paid in full (the latest `received_on` among its payments, or its `issue_date` when that money came in before, as an advance), over invoices paid in full in the period. Revenue by source waits with Opportunities.

**As built (Phase 4 Step 4 part 2, 2026-10-28).** Follow-up compliance counts follow-up tasks (`origin = 'follow_up'`, not cancelled) with `due_on` in the period whose day has come: each due before today, and one due today once it is done, since it is not yet late; one is on time when `completed_at`, as a date in the owner's zone, is on or before `due_on`. Reply rate counts the contacts an outbound activity with `occurred_at` in the period reached (the period's dates as instants in the owner's zone); one replied when an inbound activity linked to them came after their first outbound in the period, at any time since, so an inbound before it is no reply. Proposal acceptance counts sends of materials of type proposal with `sent_at` in the period (the owner's choice: sent, not decided, in the period), as accepted ÷ (accepted + rejected); sends still sent or viewed are named as waiting for an answer and superseded ones as replaced by a newer version, and neither is counted. Expired proposals wait for the `proposals` table, which arrives with Opportunities.

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

**Calendar.** Events on the primary calendar from 30 days back to 90 days ahead are synced with Google's sync token, and the window is read whole once a day, because a token never reports an old recurring meeting that has just come within it. Cancelled and declined events, focus time, out of office, working location and birthdays are not kept. Older meetings stay as history until the owner disconnects, which deletes the copy, as does connecting another account; an expired connection keeps it and pauses. Attendees are matched to contacts on every sync. Creating or changing an event always needs confirmation.

### 11.2 Enrichment

Interface: `enrich(input) → candidates[{field, value, source, confidence}]`.

- Built-in `website` provider: fetches the organization's public home and about pages, respects `robots.txt`, extracts name, description and social links from metadata. Outbound fetches block private and loopback addresses.
- Optional key-based providers (Hunter first).
- Results go to a review screen with per-field accept and reject. Accepted fields get a provenance row. Missing fields stay empty; nothing is invented.

**As built in Phase 3 (website provider only).** A company created with a domain or website is read once in the background (job `enrichment.run`, run straight after the response and by the scheduler as a fallback); the company panel has a button to read again. The reader fetches `robots.txt`, the home page, up to three icon candidates and, when contact details are still missing and the home page links to one, the site's contact page, all within ten seconds, through `src/lib/safe-fetch.ts`: public addresses on ports 80 and 443 only, checked inside the connection's own DNS lookup, at most three redirects, size caps after decompression. It takes the description (meta description, Open Graph, JSON-LD), the location (JSON-LD address), the phone and email (JSON-LD `telephone`, `email` and `contactPoint`, then `tel:` and `mailto:` links, preferring an address at the company's own domain), the website address and a logo. Phone numbers and emails printed as plain text are not read, because guessing them from page text gets them wrong too often. The location is also read from an address marked up in the page's tags (schema.org microdata: `addressLocality`, `addressRegion` and `addressCountry` inside the first element whose `itemtype` ends in `PostalAddress`), after anything JSON-LD states, and a two-letter country code is spelled out (`IN` becomes India). Two things a site rarely states are worked out (`website/guess.ts`) and stored as guesses, confidence `guessed`, which the panel marks "Guessed from website". The country, when no page states it, comes from the phone number's international code (only a number written with `+`; codes several countries share, such as `+1` and `+7`, give nothing), else from a country domain (`.in`, `.co.uk`; ones sold as general names, such as `.io`, `.ai` and `.co`, give nothing). The industry comes from a fixed list of 29, each with words that name the trade outright (two points each) and words that only hint at it (one point): the page's title, descriptions, keywords and JSON-LD type, and a drawn page's first twenty headings, are lower-cased and split into words, and the industry with the most points is taken when it has at least two and no other ties with it. A later read that finds the value stated replaces a guess; a guess never replaces a typed value, a stated one or another guess, and an industry the owner edits or clears is left alone like any other field. Profile links (JSON-LD `sameAs`) are kept in `raw_result` only. People are read too, as suggestions: when the home page links to the site's own team page (a last path segment starting with team, our-team, people, leadership, management or founders), that page is fetched under the same rules and read for a name in a heading (`h2` to `h6`, two to four capitalised words, honorific dropped) with the role in the text under it; headings inside the footer, navigation, header or an aside are ignored, and a heading level counts only when someone on it holds a named position (founder, owner, director, chief, CEO, partner, head, lead, manager, president). People the organisation's JSON-LD names (`founder`, `employee`, `member`) are added to them. At most twelve are kept, in `raw_result.people`. The read never creates a contact: the company panel offers the people who are not yet contacts there, and the owner adds them (`addSuggestedContactsAction`, through `createContact` and its similar-name check). A person's picture is read with them when the page shows one in their own card: the first `<img>` that shares a closer container with the name's heading than any other name does, at most four levels above it (`src`, then `data-src`, then the first `srcset` entry; no SVG, no `data:` address, nothing declared smaller than 40 px), or the `image` of a JSON-LD person. Only its address is kept with the suggestion, and a picture the site's robots rules disallow is dropped. The picture itself is downloaded by a `contact.photo` job (through `safe-fetch`, at most 5 MB, PNG, JPEG, GIF or WebP by magic bytes) when the owner adds the person, and for people a read finds who are already contacts at that company and have none; it is stored in `contact_photos` and served by `GET /api/contacts/[id]/photo` to the signed-in owner only. "Remove photo" in the person's menu deletes it and records the choice, so no later read brings one back. No face is ever matched: a picture is taken only because it sits beside the name. Every picture is compressed before it is stored (`compressImage` in `website/image.ts`, using `sharp`): turned the way its orientation note says, shrunk to fit a square (256 px for a person, 192 px for a logo; never enlarged), and re-encoded as WebP (quality 80 for a person, 90 for a logo, transparency kept), which also leaves behind the file's metadata, location included. Only the first frame of an animation is kept. A file that claims more than 40 million pixels, is cut short or takes over five seconds is not stored. Because what is kept is a few kilobytes, a logo may be up to 1 MB as downloaded and must be at most 100 KB as stored. Personal emails and phones are not read. A home page is read for people too, under a tighter rule, since testimonial, customer and service names share its headings: a name counts only when the nearest higher-level heading above it introduces the team (team, leadership, founders, management, directors, "our people") and is not about joining it (join, careers, hiring, jobs, openings); the position rule is not applied there. Team-page people are listed first, so they win when a name is on both. A leading "CA" in capitals is dropped like an honorific. Names on an About page are not read. A page that arrives with fewer than 200 characters of text outside `script`, `style`, `template`, `noscript` and `title` is one a browser builds from scripts; for the home page, and for a team page that names nobody, the read then asks Jina Reader (`https://r.jina.ai/<address>`, free, no key, markdown answer of at most 500 KB, ten seconds each, twenty seconds for both, apart from the site's own ten) for the page as drawn, and reads that markdown (`website/render.ts`) for `tel:` and `mailto:` links, the site's own contact and team page links, and names in headings under the same two rules, with the role on the next line and the picture whose description ends with the name. The contact page is never sent. The run records `raw_result.rendered`. If the reader refuses, is over its limit (20 requests a minute per address without a key) or cannot be reached, the read keeps what the site itself said. `WEBSITE_RENDERER=off` turns this off, and the test suites never use it. There is no review screen yet: a value is written only into an empty field the owner has not edited, each with a provenance row, and the panel marks it "From website". A home page that forwards to an unrelated site is not read. Sites that turn automated requests away are reported as such and left alone.

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
| Data rights | Full JSON + CSV export (built 2026-10-29: Settings → Export, section 6; records only, not the bytes of uploaded files); delete-contact and delete-everything flows |

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

- **Unit (Vitest):** money maths and allocation limits, duplicate-payment guard, revenue definitions, workflow stage order and save rules, template and copy isolation, recurrence, time-zone handling, encryption round-trip, AI tier policy. `pnpm test:money` runs the financial suite on its own: money maths, invoices, payments (two at once included), revenue and reports (2026-10-29).
- **Integration (Vitest + real Postgres):** every module service, owner scoping, migrations from empty.
- **End to end (Playwright):** the ten journeys in section 5, on desktop and mobile widths. Journeys 2, 3, 4 and 8 are in `e2e/22-journeys.spec.ts`, each told as one story at 1280 px and at 390 px (2026-10-26), and journeys 7 and 9 since 2026-10-29; the others join it with the phases that build them.
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
| 5 Integrations | Google OAuth and Calendar: sync, meetings on Today and the Activity tab, a Calendar view, scheduling a meeting (Gmail moved to phase 6, owner's choice, 2026-10-29) | Token survives 8+ days; revoked token shows expired state; a meeting is recorded only with a Google event ID; journey 3 shows meetings on Today |
| 6 AI | Chat, tools, tiers, memory, briefings | The PRD's example questions answered from real rows with links; tier 3 never runs unconfirmed |
| 7 Open-source readiness | Compose file, `.env.example`, docs, backup/restore, licence | A second person deploys from the README alone |
| 8 Validation | Accessibility, responsive, error states, data integrity pass | No broken journeys; no dead buttons |

Dependencies: workflows need opportunities and tasks; revenue reports need invoices and allocations; email matching needs contact emails; AI tools need every module's service layer.

**Changed order (owner's decision, 2026-10-13).** Opportunities, and saved views for the two lists, are deferred until Phases 4 to 8 are done. Phase 3 goes on without them: workflows run on companies and people (section 9), and a record's own board shows where it is. Engagements are deferred with them (owner's decision, 2026-10-16). Phase 3 is accepted on journeys 2–4 and 8; journeys 5 and 6 are accepted with the deferred work. What waits with opportunities in later phases: the Pipeline and Weighted pipeline figures and the win rate, lost reasons and meetings booked reports of section 10 (left out until then, not shown as zero), "stalled opportunities" in journey 3, and the assistant's questions about deals.

**Phase 3 accepted (2026-10-26).** Journeys 2, 3, 4 and 8 pass end to end on a desktop and a phone, and a workflow's copy, its template and sibling copies do not change each other. Journey 3 is accepted on what Today shows now (owner's choice): overdue and due-today follow-ups, the week ahead and recent activity, each opening its record. Its meetings wait for the calendar (Phase 5), its suggested next actions for the assistant (Phase 6) and its stalled opportunities for Opportunities.

**Phase 4 accepted (2026-10-29).** Journeys 7 and 9 pass end to end on a desktop and a phone, `pnpm test:money` is green, and every figure on the money overview, Today and Reports opens the rows it counts. Journey 9 is accepted on the reports that exist: revenue by month, client and service, time to payment, follow-up compliance, reply rate and proposal acceptance, each saying "Not enough data" when nothing counts. Its conversion by stage and lost reasons wait for Opportunities, with the Pipeline and Weighted pipeline figures.

---

## 17. Risks and open questions

| Risk | Mitigation |
|---|---|
| Google token expiry for unverified apps | Phase 5 asks only for calendar (sensitive) scopes; a daily `google.check` records each refresh, so 8+ days is shown by a real connection. The restricted `gmail.readonly` scope arrives with phase 6, and its own check with it; fallback is a clear weekly reconnect prompt |
| Free-tier limits change (Oracle halved its ARM allowance in June 2026) | App stays portable: plain Postgres, plain Docker, no host-specific APIs |
| Vercel Hobby terms | Stated plainly in docs; option A or C avoids it |
| Workflow editor complexity | A maintained whiteboard component (Excalidraw) instead of an editor of our own |
| Version claims from secondary sources (Drizzle, AI SDK) | Pin from official docs at scaffold time |
| Free AI tiers and client privacy | Assistant is off by default; onboarding states what each provider does with data |

Open question for the owner: licence choice before phase 7.
