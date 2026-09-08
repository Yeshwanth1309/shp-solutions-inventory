# Architecture

## Shape: modular monolith

One Next.js application, one deployable unit, internally organised into
modules with a clear boundary between them. No microservices — the brief
(section 7) explicitly asked for a modular monolith, and at the scale of a
2–3 person business, a service mesh would be pure overhead.

```
src/
  app/                 Routes: pages ((app)/, (auth)/) and API handlers (api/)
  components/ui/       Presentational primitives (Button, Dialog, Select, ...)
  components/layout/   App chrome: sidebar, mobile nav, topbar
  features/            Feature-level UI: product form, stock mutation dialog, ...
  hooks/                useSession, useDebouncedValue
  lib/                 Cross-cutting: env, errors, logger, permissions, utils
  server/
    db/                Drizzle schema, client, migration bootstrap
    services/          Business logic — the only code that runs SQL
    repositories/      (reserved — see note below)
    validation/        Zod schemas shared by client forms and API routes
    auth/              Password hashing, TOTP, session tokens, rate limiting
    http/              Session cookies, the auth guard, the route wrapper
```

**Business logic lives in `server/services/`, never in a route handler or a
React component.** A route handler's job is: authenticate, authorize, parse
input with Zod, call a service, shape the response. Nothing else. This is
what section 7 of the brief means by "keep business logic out of UI
components" — extended here to API routes too, since a route handler is
still a thin transport-layer concern, not where a stock-negative rule should
live.

`server/repositories/` is present in the tree per the original suggested
structure but is currently empty: with Drizzle, the service layer's query
builder calls already are the repository layer — there was no meaningful
extra abstraction to add without it becoming indirection for its own sake.
If a second data-access technology were ever introduced, this is where its
adapter would go.

## Frontend

Next.js App Router, React 19, TypeScript in strict mode. Two route groups:

- `(auth)/` — login, MFA verification. No sidebar, no session required.
- `(app)/` — everything behind the sidebar. `layout.tsx` here is a client
  component that checks `/api/auth/session` on mount and redirects to
  `/login` (or `/login/mfa`, or forces a password change) before rendering
  children — this is a UX convenience, **not** the access control boundary;
  see [SECURITY.md](./SECURITY.md#authorization).

State management is deliberately minimal: local component state plus a thin
`apiGet`/`apiPost`/`apiPatch`/`apiDelete` wrapper (`lib/api-client.ts`) that
attaches the CSRF header automatically. No global client-state library —
the data is server-owned and short-lived on the client (a product list, a
dashboard snapshot), which doesn't benefit from one.

## Backend

Every mutating route is wrapped in `withRoute` (`server/http/route-handler.ts`),
which:

1. Enforces CSRF on `POST`/`PUT`/`PATCH`/`DELETE` (double-submit cookie —
   see [SECURITY.md](./SECURITY.md#csrf))
2. Runs the handler
3. Catches `ZodError` → 422 with field-level details
4. Catches `AppError` (`lib/errors.ts`) → its declared status and message
5. Catches anything else → a generic 500 with a request ID, and logs the real
   error server-side — **no stack trace, SQL text, or file path ever reaches
   the client** (section 40 of the brief)

Authorization is `server/http/auth-guard.ts`: `requirePermission(permission)`
resolves the session, checks MFA is satisfied if enabled, and checks the
permission set. Every mutating route calls one of these before touching the
database. See [SECURITY.md](./SECURITY.md#authorization) for why this and
not a UI-only check is what actually matters.

## Inventory engine

This is the part the whole brief is really about (sections 10–13, 57), so it
gets its own section here even though the mechanics are documented in code
comments in `server/services/inventory-service.ts`. Three guarantees, in
order of importance:

1. **Atomicity.** The stock level and its ledger row are written inside one
   `db.transaction(...)` call. There is no window where one exists without
   the other.
2. **No negative stock.** A removal takes `SELECT ... FOR UPDATE` on the
   stock-level row before computing the new quantity. Two concurrent
   removals against the same product/location serialise on that lock — the
   second transaction blocks until the first commits, then reads the
   post-commit value, not a stale one. A `CHECK (quantity >= 0)` constraint
   in the database is the second line of defence in case a future code path
   ever bypasses the service layer.
3. **Idempotency.** Every mutation carries a caller-supplied `requestId`,
   `UNIQUE` on `stock_transactions`. A retried request (flaky network, a
   double-tap on mobile) either wins the insert or loses it to a duplicate-key
   error, in which case the service looks up and returns the transaction that
   already exists rather than moving stock a second time.

`tests/integration/concurrency.test.ts` proves guarantee 2 directly: 20
concurrent removals of 8 units against 100 in stock, asserting exactly 12
succeed (8 × 12 = 96 ≤ 100 < 8 × 13) and the final ledger reconstructs to
that exact number with no gaps. This is not a mocked test — it runs against
real PostgreSQL with real concurrent connections.

## Authentication

Session-based, not JWT: an opaque random token in an httpOnly cookie, hashed
(SHA-256 — the token itself is already high-entropy, so this is a lookup key,
not a password) and looked up server-side on every request
(`server/services/session-service.ts`). This means a session can be revoked
instantly (disable a user, change a password, hit "sign out everywhere") —
a stateless JWT cannot offer that without a separate revocation list, which
is just a session store by another name.

Sessions carry two independent deadlines — an absolute lifetime
(`SESSION_ABSOLUTE_TIMEOUT_HOURS`) and a sliding idle timeout
(`SESSION_IDLE_TIMEOUT_MINUTES`) — both checked on every lookup.

TOTP (RFC 6238, via `otplib`) is optional per-user MFA. The secret is
encrypted at rest with AES-256-GCM (`server/auth/crypto.ts`) using a key
derived from `AUTH_SECRET`, and is inert until the enrolment flow confirms
the user can actually generate a valid code from it.

**Enterprise SSO (OAuth 2.0 / OIDC)** is architected for but not wired to a
specific provider (section 31 of the brief: "do not require external OAuth
credentials to run the local application"). `getEnv().OIDC_*` and
`isOidcConfigured()` in `lib/env.ts` are the seam; a real implementation
would add an `/api/auth/oidc/callback` route that, on success, calls the same
`createSession` the password flow uses — the session and RBAC layers
underneath are provider-agnostic already.

## RBAC

Three roles (`lib/permissions.ts`): `ADMIN` (everything),
`INVENTORY_MANAGER` (catalogue, stock, suppliers, reports — not users),
`STAFF` (day-to-day stock operations and lookups — not creating products or
managing users). Per-user grants/denies (`user_permissions`) layer on top of
the role for the rare exception. Authorization is resolved once per request
in `resolveSession` and re-checked by every `requirePermission` call — see
[SECURITY.md](./SECURITY.md#authorization) for why the UI hiding a button is
not, on its own, a control.

## Security

Covered in full in [SECURITY.md](./SECURITY.md): here only in summary — RBAC
enforced server-side, CSRF via double-submit cookie, rate limiting on
login/MFA/stock mutations backed by a database counter table, parameterised
queries throughout (Drizzle never string-interpolates values), AES-256-GCM
for MFA secrets, bcrypt for passwords, structured logging with a fixed
redaction list so credentials can never leak into logs.

## Deployment

Multi-stage Docker build → a single Node process serving the Next.js
standalone output. See [DEPLOYMENT.md](./DEPLOYMENT.md). No infrastructure
beyond "a Node runtime and a PostgreSQL 16 database" is required — Redis,
message queues, etc. are explicitly not part of this design at this scale
(see the rate-limiting note in [SECURITY.md](./SECURITY.md#rate-limiting) for
the one place a future scale-out would want to add one).

## Scaling

The design that matters most for correctness (the row-level lock in the
inventory engine) scales horizontally without any change: two app instances
talking to the same PostgreSQL database still serialise correctly, because
the lock lives in the database, not in application memory. The one
component that does *not* scale past a single database automatically is the
rate limiter, which is a table-backed fixed-window counter — fine at this
business's scale, and flagged in the code as the place to swap in Redis if
traffic ever justified it.

## Observability

Structured JSON logs (`lib/logger.ts`) on every request: timestamp, level,
request ID, route, method, status, duration. A fixed redaction list removes
password/token/secret-shaped fields regardless of nesting, so a logging bug
elsewhere can't leak a credential. `/api/health` (liveness — is the process
up) and `/api/ready` (readiness — can it reach the database) are separate
endpoints for a reason: a load balancer should stop routing to an instance
that can't reach its database, but shouldn't restart a healthy process just
because the database had a blip.
