# Database

PostgreSQL 16. Schema defined in `src/server/db/schema.ts` (Drizzle ORM —
see the [README's ORM note](./README.md#a-note-on-the-orm-drizzle-instead-of-prisma)),
migrations as reviewable SQL under `drizzle/`.

## Tables

### Identity and access control

| Table | Purpose |
|---|---|
| `roles` | The three system roles: `ADMIN`, `INVENTORY_MANAGER`, `STAFF` |
| `permissions` | The full permission catalogue (`lib/permissions.ts`) |
| `role_permissions` | Role → permission grants |
| `users` | Accounts. Password hash (bcrypt), lockout state, MFA flag |
| `user_permissions` | Per-user grant/deny layered on top of the role |
| `sessions` | Server-side sessions — see [SECURITY.md](./SECURITY.md#sessions) |
| `mfa_credentials` | Encrypted TOTP secret, one per user |
| `mfa_recovery_codes` | Single-use recovery codes, hashed |
| `rate_limit_counters` | Fixed-window counters backing the rate limiter |

### Catalogue

| Table | Purpose |
|---|---|
| `categories` | Self-referencing (via `parent_id`) for subcategories |
| `brands` | |
| `suppliers` | |
| `locations` | Warehouses/godowns. Exactly one may be `is_default` |
| `products` | The full product model — see below |

### Inventory

| Table | Purpose |
|---|---|
| `stock_levels` | Current quantity per (product, location) pair |
| `stock_transactions` | The immutable ledger — every stock change ever made |

### Audit

| Table | Purpose |
|---|---|
| `audit_logs` | Security and business-sensitive events (section 35 of the brief) |

## The product model

`products` supports every category in the brief (printers, toners, ink,
spare parts, accessories, paper, maintenance) through one flexible table
rather than one table per category, per section 4's requirement that "the
product model must be flexible enough to support all of these categories."

Printer-specific columns (`printer_type`, `color_type`, `consumable_type`,
`compatibility[]`, `part_number`, `manufacturer_part_number`) are all
nullable — a ream of A4 paper or a USB cable simply leaves them null, rather
than requiring a separate schema. `unit` is an enum (`PIECE`, `BOX`, `PACK`,
`SET`, `REAM`, `BOTTLE`, `KIT`, `METRE`) covering how each category is
actually counted.

## The append-only ledger

This is the one design decision worth reading in full, because it is the
mechanism behind three separate requirements in the brief at once (sections
10, 22, and 57).

`stock_levels.quantity` is the *current* number — a single integer per
(product, location). `stock_transactions` is the *history* — an immutable
row per change, carrying `previous_stock`, `quantity`, `new_stock`, `type`,
`direction`, `reason`, who did it, and when.

The two are written together, inside one SQL transaction, in
`server/services/inventory-service.ts::applyMutation`. Never separately.

Enforcement is layered, deliberately redundant:

1. **The service layer** is the only code that ever calls this function; no
   route handler, script, or test writes directly to `stock_levels`.
2. **A `CHECK (quantity >= 0)` constraint** on `stock_levels` makes negative
   inventory a database-level impossibility, not just an application
   convention.
3. **A trigger** (`drizzle/0001_hardening.sql`,
   `shp_block_ledger_rewrite()`) fires `BEFORE UPDATE OR DELETE` on
   `stock_transactions` and raises an exception unconditionally. Even a
   developer with a database console and a `psql` prompt cannot edit or
   delete a ledger row — a correction has to be a new `ADJUSTMENT` row, which
   is exactly what "corrections should create new adjustment transactions"
   (section 22) requires, made structurally true rather than just documented.

`tests/integration/inventory.test.ts` (`the ledger is append-only` describe
block) proves this directly: it attempts an `UPDATE` and a `DELETE` against a
real transaction row and asserts both are rejected by PostgreSQL itself, with
the trigger's message, not merely by application-layer validation.

### Idempotency: `request_id`

`stock_transactions.request_id` is `UNIQUE`. Every add/remove/adjust call
requires the caller to supply one (`server/validation/inventory-schemas.ts`).
A retried request with the same ID either wins the insert or collides with
it; on collision, the service returns the transaction that already exists.
This is what makes a flaky mobile connection or a double-tap safe — see
`tests/integration/inventory.test.ts`'s "idempotency" block and
`concurrency.test.ts`'s "survives simultaneous retries" case, which fires
five concurrent requests with the same ID and asserts exactly one stock
movement resulted.

## Constraints and indexes

Every foreign key, unique constraint, and check constraint is declared in
`schema.ts` and materialised in the migration SQL — nothing is
application-only. Notable ones beyond the obvious:

- `products_maximum_stock_valid` — `maximum_stock` (if set) must be ≥
  `minimum_stock`
- `stock_transactions_arithmetic` — `new_stock` must equal
  `previous_stock ± quantity` depending on `direction`; the database itself
  rejects an inconsistent row, not just the service layer
- `locations_single_default_idx` — a partial unique index ensuring at most
  one location has `is_default = true`
- `categories_parent_not_self` — a category cannot be its own parent

### Search indexes

Section 17 requires fast search by name, SKU, barcode, model, and part
number. B-tree indexes cover exact/prefix lookups; `pg_trgm` GIN indexes
(`drizzle/0001_hardening.sql`) cover the `ILIKE '%term%'` substring search
the product list actually uses, so a search for "toner" against thousands of
products stays index-backed rather than falling back to a sequential scan.

### Stock-status indexes

`stock_levels(quantity)` and `stock_levels(product_id, location_id)`
(unique) support the low-stock/out-of-stock queries and the per-location
lookup respectively. `stock_transactions(product_id, created_at)` and
`stock_transactions(created_at)` support the history page's default sort
and its per-product filter without a sequential scan over the whole ledger.

## Migration process

Migrations are plain SQL, generated from `schema.ts` by
`drizzle-kit generate` and reviewed before committing — nothing is applied
automatically or silently. Apply them with:

```bash
npm run db:migrate
```

which runs `scripts/migrate.ts`, a thin wrapper around
`drizzle-orm/node-postgres/migrator`. It is safe to run repeatedly: Drizzle
tracks applied migrations in its own metadata table and skips what's already
been run.

`drizzle/0000_init.sql` is the full initial schema (17 tables, all
constraints and indexes except the search/trigger set). `0001_hardening.sql`
is a hand-written, non-generated migration (`drizzle-kit generate --custom`)
adding the trigram indexes, the single-default-location constraint, and the
append-only trigger — these needed raw SQL (`CREATE EXTENSION`,
`CREATE TRIGGER`) that Drizzle's schema DSL doesn't express directly.

Both migrations have been applied to a real PostgreSQL 16 instance and
verified — `\dt` shows all 17 tables, and
`select tgname from pg_trigger where not tgisinternal` shows
`stock_transactions_immutable` present — as part of building this project,
not as a claim taken on faith.
