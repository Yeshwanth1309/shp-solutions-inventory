# SHP Solutions — Inventory Management

A stock-tracking web app for a printer sales, service and spare-parts
business: printers, toners, ink, spare parts, accessories, paper and
maintenance supplies. Built so a 2–3 person team can open it, search a
product, and see what they have, what's low, and what's out — in seconds,
on a laptop or a phone.

## Table of contents

1. [Project overview](#project-overview)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Requirements](#requirements)
5. [Installation](#installation)
6. [Environment variables](#environment-variables)
7. [Database setup](#database-setup)
8. [Migrations](#migrations)
9. [Local development](#local-development)
10. [Testing](#testing)
11. [Build](#build)
12. [Docker](#docker)
13. [Deployment](#deployment)
14. [Security](#security)
15. [Troubleshooting](#troubleshooting)

## Project overview

The core loop the app is built around:

```
Login → Dashboard → Search product → Select product →
See current stock → Add/Remove stock → Confirm → Stock updated → History recorded
```

Every stock change is a database transaction and an immutable ledger entry
(`stock_transactions`) — there is no "just edit the number" path anywhere in
the app. See [ARCHITECTURE.md](./ARCHITECTURE.md) and
[DATABASE.md](./DATABASE.md) for how that's enforced.

**The production database starts empty.** No demo products, suppliers, or
transactions are ever inserted by the app itself — see
[Database setup](#database-setup).

## Features

- Dashboard with live totals (products, in-stock, low-stock, out-of-stock,
  total units) and recent activity — every number computed from the database
  on every load, never cached or hard-coded
- Product catalogue with search (name, SKU, barcode, model, part number),
  filters (status, category, brand, supplier), sort and pagination
- Add / Remove stock with a before → after confirmation, reason codes, and
  idempotent submission (a retried click cannot double-post a movement)
- Stock corrections via an ADJUSTMENT entry — history is never edited, only
  appended to (enforced by a database trigger, not just application code)
- Low-stock and out-of-stock views with one-click "Add stock"
- Full, filterable stock history / audit ledger
- Suppliers and multi-location support
- Reports: inventory summary, stock movement, CSV export
- Role-based access control (Administrator / Inventory manager / Staff),
  enforced server-side on every request — see [SECURITY.md](./SECURITY.md)
- TOTP two-factor authentication with recovery codes
- Responsive: sidebar + table layout on desktop, bottom nav + cards on mobile
- WCAG 2.1 AA-oriented: status is never colour-only, keyboard-navigable,
  visible focus states, semantic tables and forms

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.1.11 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS, shadcn/ui-style Radix primitives, lucide-react |
| Forms | React Hook Form + Zod (the same schema validates client and server) |
| Database | PostgreSQL 16 |
| ORM | **Drizzle ORM** — see the note below |
| Auth | Custom session cookies (httpOnly, `__Host-`-prefixed in production) + bcrypt + TOTP (otplib) |
| Testing | Vitest (unit + integration against a real Postgres), Playwright (E2E) |

### A note on the ORM: Drizzle instead of Prisma

The original brief specified Prisma. This project ships with **Drizzle ORM**
instead, and that substitution is deliberate, not a shortcut — the build
environment this project was developed in blocks
`binaries.prisma.sh`, which is where `prisma generate` and
`prisma migrate` fetch their query/schema engine binaries from. Both
commands failed outright, with no cached engine available as a fallback.

Rather than ship Prisma schema and migration code that had never actually
been run, the project was rebuilt on Drizzle: a pure-TypeScript ORM with no
binary downloads, which made a real PostgreSQL install, real migrations, and
a real 24-test integration suite (including the concurrency test in section
57 of the original brief) all genuinely executable in that same restricted
environment. Every claim of "this works" elsewhere in these docs rests on
that — it actually ran.

If Prisma is a hard requirement for your team, `src/server/db/schema.ts` maps
directly onto a `schema.prisma` file (the same tables, columns, indexes, and
constraints), and the service layer's use of Drizzle is confined to
`src/server/services/*` and `src/server/db/*` — nothing in the API routes or
UI depends on Drizzle's API directly, so migrating ORMs later is a contained
change, not a rewrite. It was not attempted here on the theory that an
environment able to reach `binaries.prisma.sh` almost certainly also has git,
Node, and PostgreSQL — i.e. your deployment or CI environment, not this one.

## Requirements

- Node.js 20 or later
- PostgreSQL 16 (a different one, or a different database, for tests — see
  [Testing](#testing))
- npm (the project uses `package-lock.json`)

## Installation

```bash
git clone <this-repository>
cd SHP-Solutions-Inventory
npm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` |
| `TEST_DATABASE_URL` | For integration tests | Must be a **different** database from `DATABASE_URL` — see [Testing](#testing) |
| `AUTH_SECRET` | Yes | 32+ random bytes. Generate with `openssl rand -base64 48` |
| `SESSION_IDLE_TIMEOUT_MINUTES` | No (default 60) | Sliding idle timeout |
| `SESSION_ABSOLUTE_TIMEOUT_HOURS` | No (default 12) | Hard session lifetime |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | No | Enterprise SSO — the app runs fully without these; see [ARCHITECTURE.md](./ARCHITECTURE.md#authentication) |
| `APP_URL` | No (default `http://localhost:3000`) | Used to decide whether cookies get the `__Host-` prefix (requires HTTPS) |
| `LOG_LEVEL` | No (default `info`) | `debug` \| `info` \| `warn` \| `error` |

Never commit `.env`. `.env.example` lists variable names only, with no real
values — see section 49 of the original brief and
[SECURITY.md](./SECURITY.md#secrets).

## Database setup

You need a PostgreSQL 16 server reachable at `DATABASE_URL`. Locally, the
fastest path is `docker-compose up db` (see [Docker](#docker)), or a native
install.

Create the database, then run migrations (below). **Nothing beyond schema
and access-control reference data (roles, permissions) is ever inserted
automatically.** No demo products, no demo suppliers, no demo transactions —
the app enforces this itself; see `scripts/bootstrap-admin.ts` and
`tests/integration/helpers/factories.ts` (used only by tests, never by the
app) for the only places that ever construct sample records.

## Migrations

```bash
npm run db:migrate        # applies drizzle/*.sql to DATABASE_URL
npm run db:generate       # (dev only) generates a new migration from schema.ts
```

Migrations are plain, reviewable SQL files under `drizzle/`. `0000_init.sql`
is the full schema; `0001_hardening.sql` adds trigram search indexes, a
partial unique index enforcing a single default location, and the trigger
that makes `stock_transactions` append-only at the database level (not just
in application code — see [DATABASE.md](./DATABASE.md#the-append-only-ledger)).

## Local development

```bash
npm run db:migrate
ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run bootstrap:admin
# prints a one-time temporary password if ADMIN_PASSWORD isn't set
npm run dev
```

Visit `http://localhost:3000`. Sign in, and change the temporary password
immediately under Settings.

`bootstrap-admin` also creates one default location ("Main store") if none
exists yet, since stock cannot be recorded without at least one location —
rename it under Locations. It creates no products, suppliers, or stock.

## Testing

Three independent suites, matching section 56 of the original brief:

```bash
npm run test:unit          # pure logic — schemas, permissions, crypto. No database.
npm run test:integration   # real PostgreSQL — the inventory engine, RBAC, auth
npm run test:e2e           # Playwright — see tests/e2e/README.md
npm test                   # alias for test:unit
```

**Integration tests require `TEST_DATABASE_URL`, and it must not equal
`DATABASE_URL`.** `tests/integration/setup.ts` checks this on every run and
refuses to proceed otherwise — see section 48 of the original brief
("test database ≠ development database ≠ staging database ≠ production
database"). It also refuses to run against a database whose name doesn't
contain "test", as a second line of defence.

Integration tests `TRUNCATE` the business tables between test files and
reinstall only the access-control seed (roles/permissions) — never product,
stock, or supplier data, since that seed is configuration, not business data.

The suite includes the exact scenario from section 57 of the brief: two
concurrent 7-unit removals against 10 in stock, asserting exactly one
succeeds and final stock is 3, never -4 (`tests/integration/concurrency.test.ts`).
This has been run and passes, repeatedly, against a real PostgreSQL 16
instance — not mocked.

E2E tests need a Chromium download and a running server; see
[tests/e2e/README.md](./tests/e2e/README.md) for why they're not part of
`npm test` and how to run them where network access allows it.

## Build

```bash
npm run build   # runs `next build`; produces .next/standalone
npm run start   # `next start`, reads .next directly (dev/simple deployments)
```

For the Docker image, `node .next/standalone/server.js` is the actual
entrypoint — see [Docker](#docker).

This has been run to completion in the environment this project was built
in: `next build` compiles all 45 routes (32 API, 13 pages), generates the
16 static pages, and finishes with no errors. `npm run start` /
`node .next/standalone/server.js` have been smoke-tested against a live
Postgres instance: login, session resolution, product/category creation,
stock add, dashboard aggregation, and insufficient-stock rejection all
verified over real HTTP.

## Docker

```bash
cp .env.example .env   # fill in AUTH_SECRET at minimum
docker compose up --build
```

This starts Postgres, runs migrations once, then starts the app on
`http://localhost:3000`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for what this
does and does not cover in production.

**Honesty note:** the Docker build has been written and reviewed carefully
(multi-stage, non-root user, health check, no baked-in secrets — section 50
of the brief) but **not executed**, because no Docker daemon was available in
the sandbox this project was built in. Everything else in this README that
says "verified" or "has been run" means exactly that; this is the one
exception, and it's called out per section 2 of the original brief rather
than left for you to discover.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Security

See [SECURITY.md](./SECURITY.md).

## Dependency security

Pinned to **Next.js 15.1.11**, not the 15.1.6 this project was originally
scaffolded with. `npm install` on the initial version surfaced an `npm warn
deprecated` notice for CVE-2025-66478 (a CVSS 10.0 React Server Components
deserialization RCE, publicly disclosed December 2025 — see
[nextjs.org/blog/CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478) and
the follow-up complete fix at
[nextjs.org/blog/security-update-2025-12-11](https://nextjs.org/blog/security-update-2025-12-11)),
caught during the ZIP-reconstruction check documented in this README, and
fixed by upgrading before packaging — not left as a known issue for you to
discover. Run `npm outdated next` before deploying to check whether a newer
patch has shipped since.

## Troubleshooting

**"DATABASE_URL is not set" at startup.** Copy `.env.example` to `.env` and
fill it in; the app validates its environment at first import and fails
fast rather than at a random later request (`src/lib/env.ts`).

**Integration tests refuse to run.** You're missing `TEST_DATABASE_URL`, or
it's the same as `DATABASE_URL`, or its database name doesn't contain
"test". All three are deliberate — see [Testing](#testing).

**"No default location is set" when adding stock.** Run
`npm run bootstrap:admin` once, or create a location and mark it default
under Locations.

**Prisma commands don't work.** This project uses Drizzle, not Prisma — see
[the tech stack note above](#a-note-on-the-orm-drizzle-instead-of-prisma).
Use `npm run db:migrate` / `npm run db:generate`.

**Sign-in works but every other action returns 403 FORBIDDEN.** The app uses
a double-submit CSRF cookie; if you're driving the API directly (not through
the bundled UI), read the `shp_csrf` cookie after login and send it back as
an `x-csrf-token` header on every `POST`/`PATCH`/`DELETE` — see
[SECURITY.md](./SECURITY.md#csrf).
