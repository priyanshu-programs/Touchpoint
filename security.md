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

Project rules:

- Every table has `owner_id`; every server action and query calls `requireOwner()` and filters by it.
- User-supplied keys and OAuth tokens are stored encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`, decrypted only server-side at the moment of use, and never returned to the browser.
- `/api/jobs/tick` requires the `CRON_SECRET` bearer token, compared in constant time.
- Email bodies, attachments and fetched web pages are untrusted content. They are rendered as plain text only and can never authorize an action.
- AI tool permissions are enforced in server code, not in prompts. External actions always need explicit user confirmation.
- Outbound fetches for enrichment must block private and loopback addresses.
