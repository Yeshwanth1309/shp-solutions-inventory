# API

All endpoints are under `/api`, implemented as Next.js Route Handlers. Every
mutating endpoint requires the `x-csrf-token` header (see
[SECURITY.md](./SECURITY.md#csrf)) and, except `/api/auth/login`, an
authenticated session with the listed permission
(`server/http/auth-guard.ts::requirePermission`).

## Conventions

**Authentication.** A session cookie, set by `/api/auth/login`. There is no
separate API token scheme — the same session that drives the UI drives the
API.

**Authorization.** Listed per-endpoint below as a permission key from
`lib/permissions.ts`. A request without it gets `403 FORBIDDEN`. A request
with no session at all gets `401 UNAUTHENTICATED` (or `401 MFA_REQUIRED` if
the user has MFA enabled but hasn't completed it this session).

**Validation.** Every request body is parsed with a Zod schema
(`server/validation/*`) — the same schema the client-side form uses. A
failing request gets `422 VALIDATION_ERROR` with field-level detail in
`error.details`.

**Error shape.** Every error response has the same envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock. Only 10 units are currently available.",
    "details": { "available": 10, "requested": 15 },
    "requestId": "c1a9f0b2-..."
  }
}
```

`requestId` here is the *HTTP request* trace ID (echoed in the
`x-request-id` response header and in the server log), not to be confused
with the *idempotency key* the client sends when adding/removing stock —
different concept, unfortunate near-collision in terminology, called out
explicitly so it isn't a source of confusion later.

**Pagination.** List endpoints return
`{ items, total, page, pageSize, pageCount }`. `pageSize` is capped at 100
server-side regardless of what's requested.

## Products

### `GET /api/products`
**Permission:** `product:view`
Query: `search`, `status` (`ALL`\|`IN_STOCK`\|`LOW_STOCK`\|`OUT_OF_STOCK`),
`categoryId`, `brandId`, `supplierId`, `locationId`, `isActive`, `page`,
`pageSize`, `sortBy`, `sortDir`.
Returns a paginated product list plus `options` (categories/brands/suppliers,
for populating filter dropdowns in one round trip).

### `POST /api/products`
**Permission:** `product:create`
Body: see `server/validation/product-schemas.ts::productSchema`. Rejects a
duplicate SKU or barcode with `409 CONFLICT`.

### `GET /api/products/:id`
**Permission:** `product:view`
Returns the product plus `byLocation` (stock broken down per location).

### `PATCH /api/products/:id`
**Permission:** `product:update`
Partial update. Setting `isActive: false` also fires a `PRODUCT_DEACTIVATED`
audit entry instead of `PRODUCT_UPDATED`.

### `GET /api/products/search?q=`
**Permission:** `product:view`
Lightweight typeahead (max 20 results) for the quick-search bar and the
stock-mutation dialog's product picker.

## Inventory

### `POST /api/inventory/:id/add`
### `POST /api/inventory/:id/remove`
**Permission:** `inventory:add` / `inventory:remove`
Body: `{ quantity, reason, notes?, locationId?, requestId }`.
`requestId` is the **idempotency key** — the client generates one per
confirmed action and must reuse the same value on any retry of that same
action. `locationId` defaults to whichever location is marked default.

`remove` rejects a quantity larger than what's on hand with
`409 INSUFFICIENT_STOCK` and `error.details = { available, requested }`; the
stock level and ledger are left exactly as they were (see
[DATABASE.md](./DATABASE.md#the-append-only-ledger)).

Response: `{ previousStock, newStock, replayed, transactionId }`.
`replayed: true` means this exact `requestId` had already been applied and
the original result was returned rather than moving stock again.

### `POST /api/inventory/:id/adjust`
**Permission:** `inventory:adjust`
Body: `{ targetQuantity, reason, notes?, locationId?, requestId }`. Sets
stock to an exact figure by appending a correcting `ADJUSTMENT` movement —
never rewrites prior history.

### `GET /api/inventory/history`
**Permission:** `inventory:history:view`
Query: `productId`, `sku`, `type`, `performedById`, `reason`, `locationId`,
`from`, `to`, `page`, `pageSize`. Read-only.

### `GET /api/inventory/low-stock`
### `GET /api/inventory/out-of-stock`
**Permission:** `inventory:view`
No query parameters. `low-stock` = `0 < stock ≤ minimumStock`;
`out-of-stock` = `stock ≤ 0`. Ordered by how far below minimum, most urgent
first.

## Dashboard

### `GET /api/dashboard`
**Permission:** `dashboard:view`
Returns `{ stats, recentActivity, isEmpty }`. Every figure in `stats` is
computed from the database on this request — nothing is cached or
precomputed (section 14/58 of the brief).

## Reports

### `GET /api/reports/inventory`
**Permission:** `report:view` (add `?format=csv` — also requires `report:export`)
Without `format`, returns the summary JSON. With `format=csv`, streams a CSV
download (`Content-Disposition: attachment`); accepts the same filters as
`GET /api/products`.

### `GET /api/reports/movement?from=&to=`
**Permission:** `report:view`
Units added/removed/net, plus a breakdown by transaction type, over the
given (optional) date range.

## Suppliers, locations, categories, brands

Standard list/create pattern, `GET`/`POST` on the collection,
`PATCH` on `/:id` where editing makes sense:

| Endpoint | Permission (read) | Permission (write) |
|---|---|---|
| `/api/suppliers`, `/api/suppliers/:id` | `supplier:view` | `supplier:manage` |
| `/api/locations`, `/api/locations/:id` | `location:view` | `location:manage` |
| `/api/categories` | `product:view` | `product:create` |
| `/api/brands` | `product:view` | `product:create` |

Creating a location with `isDefault: true` atomically clears the flag on any
other location first (a partial unique index backs this up at the database
level too — see [DATABASE.md](./DATABASE.md)).

## Users

### `GET /api/users`
### `POST /api/users`
**Permission:** `user:view` / `user:manage`

### `PATCH /api/users/:id`
**Permission:** `user:manage`
Role and active-state changes are guarded in the service layer against two
specific footguns: an admin cannot disable or demote their own account, and
the last active `ADMIN` cannot be demoted or disabled — see
[SECURITY.md](./SECURITY.md#authorization).

### `DELETE /api/users/:id/sessions`
**Permission:** `session:revoke`
Force-signs a user out of every device by revoking all their sessions.

## Auth

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Email + password. Returns `mfaRequired` if a second factor is needed. **Exempt from CSRF** — see [SECURITY.md](./SECURITY.md#csrf) for why that's safe. |
| `POST /api/auth/logout` | Revokes the session server-side, not just the cookie |
| `GET /api/auth/session` | Who am I, and what can I do — returns the resolved permission list |
| `POST /api/auth/mfa/verify` | Completes sign-in with a TOTP code or a recovery code |
| `POST /api/auth/mfa/enroll` | Issues a new (unconfirmed) TOTP secret + QR code |
| `POST /api/auth/mfa/confirm` | Proves the authenticator app works; returns one-time recovery codes |
| `POST /api/auth/mfa/remove` | Requires the current password again — a recent-auth-gated action |
| `POST /api/auth/password` | Change password; revokes every other session |

## Audit

### `GET /api/audit`
**Permission:** `audit:view`
Query: `action`, `actorId`, `entityType`, `entityId`, `from`, `to`, `page`,
`pageSize`.

## Health

### `GET /api/health` — liveness, no auth, no database touch.
### `GET /api/ready` — readiness, no auth, does a real `select 1` against the database and returns `503` if it fails.
