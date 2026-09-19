# Deployment

## Environment variables

See [README.md#environment-variables](./README.md#environment-variables) for
the full table. In production, at minimum: `DATABASE_URL`, `AUTH_SECRET`
(32+ random bytes — `openssl rand -base64 48`), `APP_URL` (the real
`https://` URL — this is what enables the `Secure` and `__Host-` cookie
behaviour described in [SECURITY.md](./SECURITY.md#sessions)).

## Database setup

A PostgreSQL 16 instance the app can reach at `DATABASE_URL`. Any managed
provider (Railway's own PostgreSQL add-on, RDS, Cloud SQL, Supabase, Neon,
etc.) or a self-hosted instance works — nothing in the schema uses a
provider-specific extension beyond `pg_trgm`, which is available everywhere
Postgres is.

## Migrations

```bash
npm run db:migrate
```

Run this once per deployment, before the new app version starts serving
traffic. The app does not auto-migrate on its own startup, by design — an
auto-migrating process is a common source of two instances racing to
migrate on a rolling deploy.

## Build

```bash
npm run build
```

Produces the standard `.next` build output.

## Deploying

**This project has been deployed to and verified on
[Railway](https://railway.app)**, and that's the path documented below in
full. The app has no Railway-specific code in it — anywhere that runs a
persistent Node process (not a short-lived serverless function — see the
note on this in the README's tech-stack section) and can reach a
PostgreSQL database works the same way: a plain VPS with a process manager,
Render, Fly.io, and similar platforms all fit this model.

### Railway (verified)

1. Push the repository to GitHub
2. In Railway: **New Project → Deploy from GitHub repo**, select the repo
3. **+ New → Database → Add PostgreSQL** in the same project
4. On the app service's **Variables** tab: link `DATABASE_URL` to the
   Postgres service (Railway's "Add Reference" makes this one click), then
   set `AUTH_SECRET` and `NODE_ENV=production`
5. **Settings → Build Command:** `npm run build`; **Start Command:**
   `npm run start`
6. **Settings → Networking → Generate Domain**, then set `APP_URL` to that
   domain with `https://` in front
7. Run `npm run db:migrate` once against the new database (Railway's own
   CLI — `railway connect Postgres --tunnel-only` — gives you a secure
   local tunnel to run this from your own machine without exposing the
   database publicly)
8. Run `npm run bootstrap:admin` once, the same way, to create the first
   login

### Node directly, on your own server

```bash
npm ci --omit=dev
npm run build
npm run db:migrate
npm run start
```

Put this behind a process manager (systemd, pm2) and a reverse proxy
(nginx, Caddy) that terminates TLS — the app itself speaks plain HTTP.

## HTTPS

Terminate TLS at a reverse proxy, load balancer, or your platform's own
edge (Railway does this automatically for the domain it generates) — the
app does not handle certificates itself. `APP_URL` must start with
`https://` in production so the app knows to mark cookies `Secure` and use
the `__Host-` cookie prefix (see [SECURITY.md](./SECURITY.md#sessions)) —
running behind HTTPS without setting this correctly silently degrades
cookie security, so treat it as a required step, not optional polish.

## DNS

No requirements beyond pointing your domain at wherever the app is
reachable. `APP_URL` should match the domain you point here.

## Authentication configuration

Username and password only — no additional configuration needed. Enterprise
SSO (OIDC) is architected for (`OIDC_ISSUER`/`OIDC_CLIENT_ID`/
`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI` in `.env.example`) but not wired to
a specific provider — see [ARCHITECTURE.md](./ARCHITECTURE.md#authentication)
for the seam if you need to add one.

## Backups

This app does not implement its own backup mechanism — that's rightly a
property of the database, not the application. What to configure depends on
your PostgreSQL provider:

- **Railway's Postgres add-on** has a Backups tab in its own dashboard —
  turn it on.
- **Other managed providers** (RDS, Cloud SQL, Supabase, Neon, etc.): enable
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
  though it's a narrow table and grows slowly relative to typical database
  storage budgets.
- **Restore testing:** periodically restore a backup to a scratch database
  and run `npm run db:migrate` against it to confirm the backup is actually
  usable, not just present.
- **High availability:** a managed provider's built-in HA/read-replica
  offering is the pragmatic choice at this business's scale; nothing in the
  app assumes a single database instance beyond the connection string in
  `DATABASE_URL`.

## Monitoring

`GET /api/health` (liveness) and `GET /api/ready` (readiness, does a real
database round-trip) are the two endpoints to point a load balancer or
orchestrator's health checks at — see
[ARCHITECTURE.md#observability](./ARCHITECTURE.md#observability) for why
they're separate. Structured JSON request logs (`lib/logger.ts`) are
designed to be shipped to whatever log aggregation your platform provides —
nothing app-specific is required on the receiving end beyond JSON parsing.

## Rollback

Because migrations are plain, ordered SQL files and the app never
auto-migrates on startup, rolling back the application to a previous
deployment is safe as long as no *new* migration has been applied since
that version — schema changes here are additive in the normal case (new
tables/columns), so an older app version generally continues to work
against a newer schema. If a rollback needs to undo a migration too, write
and review a down-migration by hand before running it — none is
auto-generated, on the same principle that Drizzle's migrations are meant
to be read, not blindly trusted.
