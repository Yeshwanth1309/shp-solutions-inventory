# Deployment

## Environment variables

See [README.md#environment-variables](./README.md#environment-variables) for
the full table. In production, at minimum: `DATABASE_URL`, `AUTH_SECRET`
(32+ random bytes — `openssl rand -base64 48`), `APP_URL` (the real
`https://` URL — this is what enables the `Secure` and `__Host-` cookie
behaviour described in [SECURITY.md](./SECURITY.md#sessions)).

## Database setup

A PostgreSQL 16 instance the app can reach at `DATABASE_URL`. Any managed
provider (RDS, Cloud SQL, Supabase, Neon, etc.) or a self-hosted instance
works — nothing in the schema uses a provider-specific extension beyond
`pg_trgm`, which is available everywhere Postgres is.

## Migrations

```bash
npm run db:migrate
```

Run this once per deployment, before the new app version starts serving
traffic — the `migrate` service in `docker-compose.yml` shows the pattern
(a one-off container that runs migrations to completion, then the app
container starts only after it succeeds).

## Build

```bash
npm run build
```

Produces `.next/standalone` — a self-contained Node app with a pruned
`node_modules`, per Next.js's standalone output mode (`output: 'standalone'`
in `next.config.mjs`).

## Deploying

### Option A — Docker (recommended)

```bash
docker build -t shp-inventory .
docker run -d \
  -e DATABASE_URL="postgresql://..." \
  -e AUTH_SECRET="..." \
  -e APP_URL="https://inventory.yourbusiness.example" \
  -p 3000:3000 \
  shp-inventory
```

Run the `migrate` step separately first (see `docker-compose.yml` for the
exact command) — the app image does not run migrations on its own startup,
by design: an auto-migrating app container is a common source of two
instances racing to migrate on a rolling deploy.

**As noted in [README.md](./README.md#docker):** the Dockerfile is written
and reviewed (multi-stage, non-root `nextjs` user, `HEALTHCHECK`, no secrets
baked into any layer) but has not been executed, because no Docker daemon
was available in the environment this project was built in. Build it
yourself and sanity-check the image before relying on it.

### Option B — Node directly

```bash
npm ci --omit=dev
npm run build
npm run db:migrate
node .next/standalone/server.js
```

Put this behind a process manager (systemd, pm2) and a reverse proxy
(nginx, Caddy) that terminates TLS — the app itself speaks plain HTTP.

## HTTPS

Terminate TLS at a reverse proxy or load balancer in front of the app; the
app does not handle certificates itself. `APP_URL` must start with
`https://` in production so the app knows to mark cookies `Secure` and use
the `__Host-` cookie prefix (see [SECURITY.md](./SECURITY.md#sessions)) —
running behind HTTPS without setting this correctly silently degrades
cookie security, so treat it as a required step, not optional polish.

## DNS

No requirements beyond pointing your domain at wherever the app (or its
reverse proxy) is reachable. `APP_URL` should match the domain you point
here.

## Authentication configuration

Password + TOTP MFA works with zero additional configuration. Enterprise SSO
(OIDC) is architected for (`OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/
`OIDC_REDIRECT_URI` in `.env.example`) but not wired to a specific
provider — see [ARCHITECTURE.md](./ARCHITECTURE.md#authentication) for the
seam if you need to add one.

## Backups

This app does not implement its own backup mechanism — that's rightly a
property of the database, not the application. What to configure depends on
your PostgreSQL provider:

- **Managed providers** (RDS, Cloud SQL, Supabase, Neon, etc.): enable
  automated daily snapshots with point-in-time recovery (PITR) if offered,
  and set a retention window matching your business's tolerance for data
  loss — 7–30 days is a reasonable starting point for a small business's
  transactional data.
- **Self-hosted:** `pg_dump` on a schedule at minimum; `pg_basebackup` +
  WAL archiving if you need PITR. Store backups somewhere other than the
  same disk as the database.
- **Retention:** the stock ledger (`stock_transactions`) is append-only and
  grows indefinitely by design (section 22 of the brief: history is never
  edited or deleted) — factor its growth into your backup storage sizing,
  though it's a narrow table (a handful of integers, an enum, and short
  text fields) and grows slowly relative to typical database storage
  budgets.
- **Restore testing:** periodically restore a backup to a scratch database
  and run `npm run db:migrate` against it to confirm the backup is actually
  usable, not just present. This is standard advice, included here because
  it's the step most often skipped, not because this app does anything
  unusual.
- **High availability:** a managed provider's built-in HA/read-replica
  offering is the pragmatic choice at this business's scale; nothing in the
  app assumes a single database instance beyond the connection string in
  `DATABASE_URL`.

## Monitoring

`GET /api/health` (liveness) and `GET /api/ready` (readiness, does a real
database round-trip) are the two endpoints to point a load balancer or
orchestrator's health checks at — see
[ARCHITECTURE.md#observability](./ARCHITECTURE.md#observability) for why
they're separate. Structured JSON request logs
(`lib/logger.ts`) are designed to be shipped to whatever log aggregation your
platform provides (CloudWatch, Stackdriver, a self-hosted ELK stack, etc.) —
nothing app-specific is required on the receiving end beyond JSON parsing.

## Rollback

Because migrations are plain, ordered SQL files and the app never
auto-migrates on startup, rolling back the application to a previous image
is safe as long as no *new* migration has been applied since that version —
schema changes here are additive in the normal case (new tables/columns),
so an older app version generally continues to work against a newer schema.
If a rollback needs to undo a migration too, write and review a
down-migration by hand before running it — none is auto-generated, on the
same principle that Drizzle's migrations are meant to be read, not blindly
trusted.
