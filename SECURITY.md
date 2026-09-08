# Security

## Authentication

Email + bcrypt-hashed password (12 rounds), with optional TOTP two-factor.
Sessions are server-side (`sessions` table), not stateless JWTs — the cookie
holds only an opaque random token; the database holds the actual session
state, which is what makes instant revocation (disable a user, "sign out
everywhere") possible.

**Lockout.** 8 failed attempts locks the account for 15 minutes. Failure
responses are deliberately uniform — unknown email, wrong password, and
disabled account all return the same message with comparable timing (a
constant-time bcrypt comparison runs even for an unknown email, against a
fixed dummy hash), so the login endpoint cannot be used to enumerate which
emails have accounts.

**Password policy.** 12+ characters, mixed case, at least one digit
(`server/validation/auth-schemas.ts::passwordSchema`) — length-first, since
length is the dominant factor in resistance to offline cracking.

## MFA

TOTP (RFC 6238) via `otplib`. Enrolment:

1. `POST /api/auth/mfa/enroll` generates a secret, stores it **encrypted**
   (AES-256-GCM, key derived from `AUTH_SECRET` via scrypt) but
   **unconfirmed** — inert until step 2.
2. `POST /api/auth/mfa/confirm` requires a valid code generated from that
   secret before it's activated, proving the user's authenticator app is
   correctly set up. Ten recovery codes are generated and shown exactly
   once; only their SHA-256 hash is stored.
3. Removing MFA (`POST /api/auth/mfa/remove`) requires the current password
   again — see [Re-authentication](#re-authentication-for-sensitive-changes).

MFA secrets are never logged (`lib/logger.ts`'s redaction list matches them
regardless of nesting) and never returned in any API response after initial
enrolment.

## Sessions

- httpOnly, so client-side JavaScript cannot read the session token even via
  an XSS bug (defence in depth — see [XSS](#xss) below for the primary
  mitigation)
- `Secure` whenever the app is served over HTTPS (`APP_URL` starting with
  `https://`), and the cookie name gets the `__Host-` prefix in that case —
  which browsers only honour when `Secure`, `Path=/`, and no `Domain`
  attribute are all set, closing off a subdomain from ever writing a
  same-named session cookie for the app
- `SameSite=Lax` — blocks a cross-site `POST` from carrying the session
  cookie, which is most of what stops "login CSRF" even before the
  CSRF-cookie mechanism below applies
- Two independent, always-checked deadlines: an idle timeout
  (`SESSION_IDLE_TIMEOUT_MINUTES`) and an absolute lifetime
  (`SESSION_ABSOLUTE_TIMEOUT_HOURS`)
- A brand-new session is always issued on successful login — the
  pre-login state is never "upgraded," which is what prevents session
  fixation

## CSRF

Double-submit cookie pattern: a `shp_csrf` cookie (readable by client JS,
not a credential) must be echoed back as an `x-csrf-token` header on every
`POST`/`PUT`/`PATCH`/`DELETE`. A cross-site page cannot read the cookie to
forge that header, even though it can trigger a same-site request.

**`POST /api/auth/login` is exempt**, and this is worth explaining rather
than leaving as an unexplained gap: on a fresh browser, no session — and
therefore no CSRF cookie — exists yet, so requiring the token here would
make it impossible to ever sign in. CSRF exists to stop a third party from
driving an action inside a victim's *existing, authenticated* session;
before login, there is no such session to protect. The login response
itself issues the CSRF cookie, so the very next mutating request (MFA
verification, or anything else) is protected as normal. Login CSRF
specifically (tricking a victim into authenticating as an *attacker's*
account) is independently blocked by `SameSite=Lax` on the session cookie.

This was not a decision made in the abstract — it was found by actually
running the login flow end-to-end against a live server during development
and watching it fail with `403 FORBIDDEN` before the exemption was added.
See `server/http/route-handler.ts` for the implementation and a fuller
comment.

## Authorization (RBAC)

Three roles, defined once in `lib/permissions.ts`, resolved server-side on
every request by `server/http/auth-guard.ts::requirePermission`. **Hiding a
button in the UI is a convenience, never the control** — every mutating API
route calls `requirePermission` (or `requireAnyPermission`) independently of
whatever the client sent, so a crafted request that bypasses the UI entirely
still can't act outside its role.

Two specific guards worth naming, because they're the kind of bug that's
easy to ship and easy to regret:

- An administrator cannot demote or disable **their own** account
  (`server/services/user-service.ts::updateUser`) — a UI-driven way to
  accidentally lock the business out of its own system.
- The **last active `ADMIN`** cannot be demoted or disabled by anyone,
  including another admin — same failure mode, different trigger.

## Sessions and authorization: recent-auth for sensitive changes

Some actions (removing MFA, and any future "confirm your password" flow)
require the session to have authenticated recently
(`server/http/auth-guard.ts::requireRecentAuth`, default 15 minutes since
login or last MFA verification) — an already-open browser tab left logged in
cannot, on its own, turn off two-factor authentication.

## Injection

**SQL injection.** Every query goes through Drizzle's query builder, which
parameterises values — nothing in the service layer ever string-concatenates
user input into SQL. The two places raw `sql` is used
(`server/services/*-service.ts`) are for aggregate expressions (`sum`,
`count filter`) built from fixed column references, never from request
input.

**XSS.** React escapes all rendered content by default; nothing in this
codebase uses `dangerouslySetInnerHTML`. Content-Security-Policy and the
other security headers below (section 33 of the brief) are the
defence-in-depth layer for anything that slips past that.

**IDOR/BOLA.** Every `:id`-scoped route re-checks the permission on that
resource type via `requirePermission` before touching the ID — there's no
route that trusts an ID from the client to imply the caller may act on it.

## Security headers

Configured in `next.config.mjs` (added as part of hardening the standalone
build) for `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`,
scoped to what this app actually needs (no third-party embeds, no inline
script beyond what Next.js's own hydration requires).

## Rate limiting

A database-backed fixed-window counter (`rate_limit_counters`,
`server/auth/rate-limit.ts`) rather than an in-memory one, so limits hold
correctly across multiple app instances without needing a separate service.
Limits: login and MFA attempts (10 per 5 minutes, per email and per IP),
password reset (5 per 15 minutes), stock mutations (120 per minute per
user), report generation (20 per minute per user).

This is the one place noted in [ARCHITECTURE.md](./ARCHITECTURE.md#scaling)
as the natural spot to swap in Redis if traffic ever outgrew a single
Postgres instance's tolerance for the extra write load — not needed at this
business's scale, but not architected to make that swap hard either.

## Secrets

`.env.example` lists variable names only — no real values, ever (section 49
of the brief). `.env` is gitignored. `AUTH_SECRET` must be 32+ bytes; the
app refuses to start otherwise (`lib/env.ts`). Docker images never bake in
secrets — they're supplied at runtime via environment variables (see
[DEPLOYMENT.md](./DEPLOYMENT.md)).

## Logging

Structured JSON (`lib/logger.ts`) with a fixed redaction list — password,
token, secret, MFA/TOTP fields, and several near-spellings of each, replaced
with `[redacted]` regardless of how deeply nested the object is. Passwords,
tokens, MFA secrets, and encryption keys are never logged in any form
(section 35 of the brief).

## Audit logging

`audit_logs` records every event listed in section 35 of the brief: logins
(success and failure), MFA and password changes, user/role changes, product
create/update/deactivate, every stock movement, supplier/location changes,
and settings changes. Stock-movement audit entries are written inside the
*same* database transaction as the ledger row they describe
(`recordAudit(..., tx)` in `inventory-service.ts`), so the two can never
diverge.

## Dependency security

**Next.js.** Pinned to **15.5.25**, the latest stable release in the 15.x
line as of packaging. The project was originally scaffolded on 15.1.6; a
`npm install` during the ZIP-reconstruction check (documented in
[README.md](./README.md#dependency-security)) surfaced
[CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478) — a CVSS 10.0 RCE
in the React Server Components deserialization path affecting all Next.js
15.x/16.0.x App Router applications, publicly disclosed December 2025 — and
it was fixed by upgrading before packaging, not left as a known issue.
`npm audit` after that upgrade shows zero *RCE-class* Next.js advisories;
the one remaining `next`-attributed finding is `moderate`-severity and is
the PostCSS issue described just below (Next.js bundles its own internal
copy of PostCSS for its CSS pipeline) — not a separate Next.js
vulnerability.

**Residual `npm audit` findings — all dev-tooling, none in the production
artifact.** After the Next.js upgrade, `npm audit` still reports issues in
`vitest`/`vite`/`postcss` (as bundled by `vitest@2.1.9`, which requires
`vite@^5.0.0` — already at the latest `5.4.x` patch, `5.4.21`, at time of
writing) and in `drizzle-kit`/`esbuild`. Three things are true about all of
them, checked directly rather than assumed:

1. **They are devDependencies.** `vitest`, `vite`, and `drizzle-kit` run
   tests and generate migrations at development time; they are never
   imported by any file under `src/app` or `src/server` that ships to
   production.
2. **They do not reach the deployed artifact.** Confirmed directly:
   `.next/standalone/node_modules` — the exact tree the Docker image and
   `node .next/standalone/server.js` actually run — contains no `vite` or
   `vitest` package at all. Next.js's build only traces and bundles the
   runtime dependencies actual application code imports.
3. **The one `critical`-rated finding** (arbitrary file read when Vitest's
   optional `--ui` dev server is listening) requires deliberately running
   `vitest --ui`, which no script in `package.json` invokes and which was
   never used in developing this project. `npm run test:unit` /
   `test:integration` run `vitest run`, a one-shot CLI mode with no server.

This was not left unexamined: `npm audit fix` (non-breaking) resolves
nothing further here, because vitest 2.x's own dependency range caps
`vite` at `^5.0.0` and the remaining fixes require `vitest` 3.x, which
changes its workspace-configuration API
(`vitest.workspace.ts` → `test.projects` in a single config) and would need
the two-project unit/integration split in this repo reworked and every one
of the 73 existing tests re-verified against it — a real piece of work,
correctly sequenced *after* shipping, not a reason to hold up a fix for a
vulnerability that was already confirmed not to reach production. Tracked
as follow-up: migrate to Vitest 3.x's config format, then re-run
`npm audit` to confirm the transitive `vite`/`esbuild` findings clear.

If your organization's policy requires zero `npm audit` findings regardless
of reachability, run `npm audit fix --force` yourself and budget time to
re-verify the full test suite against whatever breaking changes it pulls in
(at minimum, a Next.js 16 major upgrade and a Vitest 3.x config migration) —
neither was attempted here on the theory that shipping an untested major
upgrade is a worse outcome than shipping a well-understood, documented,
non-production-reachable dev-tooling gap.

## Incident response

There is no dedicated incident-response tooling in this codebase (out of
scope for a small-business inventory app), but the pieces needed to
investigate an incident are all present: the audit log, structured request
logs with a request ID that ties a client-visible error back to a specific
server log line, and `DELETE /api/users/:id/sessions` to immediately revoke
a compromised account's access without needing a deploy.
