# Security Rules — Touchpoint

> **Read this before writing any code or creating any plan.**
> Apply every rule below to any new code. If a planned feature conflicts with a rule, flag
> it before implementing and propose a compliant approach.

---

## Input Validation

- Validate and sanitize ALL user-supplied input at system boundaries (API routes, form handlers, CLI args)
- Never trust request bodies, query params, headers, path segments, or cookies without validation
- Use schema validation for all API payloads (e.g. zod, joi, valibot)
- Reject unknown fields — use strict schema parsing, not loose coercion

## Authentication & Authorization

- Never implement custom auth from scratch — use a proven library (NextAuth, Supabase Auth, Lucia, Clerk, etc.)
- Check authorization server-side on every protected route and action — never trust client-side state alone
- Use short-lived access tokens (JWTs ≤ 15 min); store refresh tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies
- Never store tokens, passwords, or secrets in `localStorage` or `sessionStorage`
- Always hash passwords with bcrypt, argon2, or scrypt — never MD5/SHA1 alone

## Injection Prevention

- Use parameterized queries or an ORM — never concatenate user input into SQL strings
- Never pass user input to `exec()`, `eval()`, `child_process`, or shell commands
- Sanitize any user-supplied content rendered as HTML (use DOMPurify or framework-native escaping)
- Avoid `dangerouslySetInnerHTML` in React unless the content is already sanitized

## Secrets & Environment Variables

- Never hard-code secrets, API keys, DB URLs, or tokens in source files
- Use `.env` files (gitignored) and validate required variables at application startup
- Never log secrets, tokens, passwords, or PII — scrub them from error messages too
- If a secret is accidentally committed: rotate it immediately, then remove from history

## Dependencies

- Run `npm audit` (or equivalent) before shipping new dependencies
- Prefer actively maintained packages with minimal transitive dependency trees
- Pin or lock versions (`package-lock.json` / `bun.lockb`) in production
- Review what a new package actually does before installing it

## HTTP Security Headers

Set these on every HTTP response:
- `Content-Security-Policy` — restrict script/style/image origins
- `X-Frame-Options: DENY` — prevent clickjacking
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` — HSTS for HTTPS endpoints
- `Referrer-Policy: strict-origin-when-cross-origin`

CORS:
- Never use wildcard `*` origins in production
- Explicitly allowlist trusted origins
- Restrict allowed methods and headers

## Rate Limiting & DoS

- Apply rate limiting on all auth endpoints and any expensive/side-effectful operations
- Validate file upload size (set a hard limit) and MIME type (check magic bytes, not just extension)
- Paginate all list endpoints — never return unbounded result sets

## Logging & Monitoring

- Log authentication attempts (success and failure) with timestamp and IP
- Do NOT log PII, passwords, tokens, or secrets
- Use structured logs (JSON) so they are machine-parseable
- Log at the appropriate level — don't silence errors in production

## Project-Specific Notes

Approved deviations (owner sign-off 2026-10-10, see `docs/PRD.md` section 13):

- Sessions are Better Auth database sessions in `httpOnly`, `Secure` cookies, not 15-minute JWTs. They are revocable server-side and never stored in browser storage.
- The Google OAuth callback uses a separate short-lived `SameSite=Lax` state cookie, because a `SameSite=Strict` cookie is not sent on the redirect back from Google. The session cookie itself is unaffected.

- The website read sends the address of a company's page to Jina Reader (`r.jina.ai`, no key) when that page arrives empty because a browser builds it from scripts (owner sign-off 2026-10-12). Only the address goes, after this app has fetched the page itself and checked the site's robots rules; what comes back is untrusted page text like any other. `WEBSITE_RENDERER=off` stops it.
- Pictures fetched from company websites are decoded and re-encoded by `sharp` (native code) before they are stored. Only bytes that pass the magic-byte check for PNG, JPEG, GIF or WebP are handed to it, under a download cap, a 40-million-pixel limit and a five-second timeout, and only inside a background job.
- "Find profile links" sends a person's full name and the name of their first company to Tavily (`api.tavily.com`) to look for their LinkedIn, X and GitHub profiles (owner sign-off 2026-10-12). It happens only when the owner presses the button, never by itself, and only when `TAVILY_API_KEY` is set; without the key the button is not shown. The key travels in a header that is never carried across a redirect. What comes back is untrusted: only addresses that are a profile on one of the three sites are kept, each title is shown as plain text, and nothing is saved on the person until the owner adds it. Searches are limited to 20 an hour, 900 in 30 days and one a minute for the same person.

Project rules:

- Every table has `owner_id`; every server action and query calls `requireOwner()` and filters by it.
- User-supplied keys and OAuth tokens are stored encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`, decrypted only server-side at the moment of use, and never returned to the browser.
- `/api/jobs/tick` requires the `CRON_SECRET` bearer token, compared in constant time.
- Email bodies, attachments and fetched web pages are untrusted content. They are rendered as plain text only and can never authorize an action.
- AI tool permissions are enforced in server code, not in prompts. External actions always need explicit user confirmation.
- Outbound fetches for enrichment must block private and loopback addresses.
- A link between a contact and a company is written only after both are checked against the owner. Saying a person a website names is an existing contact is accepted only for a pair the server itself offered for that company.
- A profile link found by name is added only if the stored search offered that address for that person.
- Archiving, restoring or deleting several records at once takes a list of ids from the browser: between 1 and 50, each a uuid, checked by zod in the action. Each id then goes through the same owner-filtered, audited service call as a single record, so an id that is not the owner's changes nothing.
- Which columns a list shows is kept in a cookie the browser writes (`columns-companies`, `columns-contacts`; not `httpOnly`, since it holds a preference and nothing private). The page takes from it only the names of that list's own columns and ignores the rest.
- The page behind a whiteboard's drawing is kept in a cookie the browser writes (`board-paper`; not `httpOnly`, since it holds a preference and nothing private). The board's page takes from it only one of the four names in code (`paperOf` in `src/app/(board)/workflows/[id]/paper.ts`) and falls back to the dotted grid; the name becomes an attribute that a stylesheet rule matches, so nothing from the cookie is ever written into a style.
- A form opened in a panel says where it came from in two hidden fields, a record kind and a company id (`readOrigin` in `src/lib/form.ts`, strict: one of the known kinds, a uuid or nothing). The action never follows an address sent by the browser: it builds the way back itself from those and from the ids it has just saved, and the page it lands on checks the company and the person against the owner, and that the person is at that company, before showing either. An activity or task named in an address (`activity=`, `task=`) is shown only if it is the owner's.
- A custom value is stored only for a field the owner defined for that kind of record, and only if it fits that field's kind and options; a form's other keys are never read. A suggested field is added by its key from the list in code, never from a label or options sent with the request.
- A starter workflow is added by its key from the list in code (`src/modules/workflows/starters.ts`), never from a name or a drawing sent with the request. An owner has at most 50 workflows. Names and descriptions are drawn as plain text.
- **Approved deviation (owner sign-off 2026-10-13): a workflow's drawing is not checked field by field.** The rule above says to reject unknown fields. A drawing is a list of whiteboard elements (Excalidraw), each with dozens of fields that differ by kind and by version of the whiteboard, so a strict list of them would refuse every save after an update. Instead (`sceneSave` in `src/modules/workflows/schema.ts`): the envelope is strict (a version and a list of elements, nothing else), a drawing is at most 3 MB and 10,000 elements with at most 100 stages, and in each element everything the server reads or that could do harm is checked: the kind is one of eight (boxes, arrows, lines, free strokes, text, frames; never an embedded page or iframe, and no picture until pictures have storage), `customData` is exactly a stage's status or nothing, and `link` is kept only if it is an http or https address and dropped otherwise. The remaining fields (position, size, colours, stroke points) are stored as they came. They are never rendered as HTML by this app and never read by the server; they only go back to the whiteboard in the owner's own browser, which draws them on a canvas. A stage's name is the text in its box, cut to 200 characters and drawn as plain text.
- The whiteboard saves through `PUT /api/workflows/<id>/scene`, the one route that changes data with a session and is not a server action (a server action would flash the progress bar every two seconds). It checks the owner, refuses any request whose `Origin` is not this app's own (`APP_URL`), which is what a server action does by itself, takes the id as a uuid, and updates only a workflow that is the owner's. A save names the version it was loaded at and is refused if the stored one has moved on. Saves are not written to the audit log, since one is made every few seconds while drawing; creating, renaming and deleting a workflow are. A GET of the same address gives the stored drawing to its owner only, with `Cache-Control: no-store`.
- The whiteboard is a third-party component (`@excalidraw/excalidraw`, MIT, pinned to 0.18.1) and runs only in the browser, on the workflow page. It is given no way to reach another site: its fonts are copied into this app at build time (`scripts/copy-board-fonts.mjs`) and the copies it lists on a CDN (esm.sh) are taken out of every font before it is made (`board-canvas.tsx`), its shared-library browser and its tool for embedding another site's page are turned off, and the CSP is unchanged (`font-src 'self'`, `connect-src 'self'`), so anything that slipped past would be blocked. The e2e suite fails if the workflow page asks another host for anything or logs an error. Four packages it depends on had open advisories at the versions it pins; `pnpm-workspace.yaml` overrides them to fixed releases (nanoid, lodash-es, katex) and drops `sass`, a build tool it lists and never loads.
- A workflow is started on a company or a person only after the record is checked against the owner, and from a workflow only if that workflow is the owner's and a template (never another record's board). The browser names the record by kind and id (strict: exactly one of the two, a uuid) and the workflow by id; the drawing that is copied is the stored one. A record has at most 20 boards.
- A stage's status set from a record's panel names a board, an element and one of the four statuses, checked by zod in the action. The board must be the owner's and a record's own, and the element must already be one of its stages; the status and the colour that goes with it (from the list in code) are all that is written, so nothing else of a drawing can be changed that way. It is audited.
- The order of the workflows is taken as a list of 1 to 50 ids, each once, and kept only if it is exactly the owner's own templates; otherwise nothing is moved.
- A record's board leads back to its record by an address built on the server from the board as stored (after a delete, as it was stored), never from one the browser sent.
- A company's status is stored only if it is one of the five built in or one the owner defined, checked in the organizations service inside the transaction that writes it, since no database rule lists the statuses any more. A status's colour is any the owner picks, and it is drawn through an inline style (which the CSP allows: `style-src 'self' 'unsafe-inline'`), so its shape is the whole safeguard: it is accepted only as `#` and six hex digits (`src/lib/color.ts`), checked by zod in the action, by a check constraint on `company_statuses.color`, and again where it is drawn, which leaves anything else out of the style. No colour name, function or other CSS can be stored or drawn. (Until 2026-10-13 a colour was one of nine names turned into classes; the owner asked for a free picker.)
