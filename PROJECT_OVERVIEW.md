# SHP Solutions Inventory — How This Website Works

A complete, plain-language guide to how the application is built, where
everything lives, and how the pieces fit together. Written for someone
opening this project for the first time — no prior context assumed.

---

## 1. The big picture

This is a **single web application** with three layers, all living in one
project (not three separate services):

```
Your browser  →  Next.js application (pages + API routes)  →  PostgreSQL database
```

- **Next.js** is the framework that builds both the pages you see (the
  dashboard, the products list, etc.) and the backend API endpoints that
  those pages talk to. It's one technology doing both jobs — there's no
  separate "frontend project" and "backend project."
- **PostgreSQL** is the actual database — the permanent, structured storage
  where every product, every stock movement, every user account really
  lives. Next.js never stores data itself; it always reads from and writes
  to Postgres.

When you deployed to Railway, Railway is running two things: the Next.js
application (as a live, always-on process) and a PostgreSQL database
(as a separate managed service). They talk to each other over a database
connection string (`DATABASE_URL`).

---

## 2. Where the database actually is

**Locally** (on your own laptop), it's whatever PostgreSQL server you
installed — the one you connect to with `psql` at `127.0.0.1` or
`localhost`, in a database named `shp_dev`.

**In production** (the live site your client uses), it's the PostgreSQL
service Railway created inside your project when you clicked "Add
PostgreSQL." It is a completely separate database from your local one —
nothing you do locally ever touches it unless you explicitly point a
command at Railway's database (which we did a few times, using
`railway connect Postgres` to open a secure tunnel).

The connection string that tells the application which database to use is
the `DATABASE_URL` environment variable — set in your local `.env` file for
local development, and set in Railway's Variables tab for production. This
is the *only* thing that decides which database gets used; the application
code itself is identical either way.

---

## 3. Folder structure — what lives where

```
SHP-Solutions-Inventory/
│
├── src/
│   ├── app/                    ← Every page and every API endpoint
│   │   ├── (auth)/             ← Login pages (no sidebar, not logged in yet)
│   │   │   └── login/
│   │   ├── (app)/              ← Everything behind the sidebar (logged in)
│   │   │   ├── dashboard/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── brands/
│   │   │   ├── suppliers/
│   │   │   ├── customers/
│   │   │   ├── locations/
│   │   │   ├── inventory/
│   │   │   │   ├── history/
│   │   │   │   ├── low-stock/
│   │   │   │   └── out-of-stock/
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   ├── audit/
│   │   │   └── settings/
│   │   └── api/                ← The backend. Every folder here is one URL.
│   │       ├── auth/           ← login, logout, session, MFA, password
│   │       ├── products/
│   │       ├── inventory/      ← add / remove / adjust stock, history
│   │       ├── categories/
│   │       ├── brands/
│   │       ├── suppliers/
│   │       ├── customers/
│   │       ├── locations/
│   │       ├── reports/
│   │       ├── users/
│   │       ├── audit/
│   │       ├── dashboard/
│   │       ├── health/         ← is the server running at all
│   │       └── ready/          ← can the server reach the database
│   │
│   ├── components/
│   │   ├── ui/                 ← Small reusable pieces: buttons, dialogs, inputs
│   │   └── layout/              ← The sidebar, mobile menu, top search bar
│   │
│   ├── features/               ← Bigger, page-specific building blocks —
│   │                              e.g. the "Add/Remove Stock" popup dialog,
│   │                              the "Add Product" form
│   │
│   ├── server/                 ← Everything that talks to the database.
│   │   │                          Nothing in here ever runs in the browser.
│   │   ├── db/
│   │   │   ├── schema.ts       ← THE definition of every database table
│   │   │   ├── client.ts       ← Opens the actual database connection
│   │   │   └── bootstrap.ts    ← Installs roles/permissions on first run
│   │   ├── services/           ← The real business logic — one file per
│   │   │                          topic (inventory-service.ts is the most
│   │   │                          important one; see section 6)
│   │   ├── validation/         ← Rules for what counts as valid input
│   │   │                          (used by both the form on screen and the
│   │   │                          API, so they always agree)
│   │   ├── auth/               ← Password hashing, two-factor codes,
│   │   │                          session tokens, rate limiting
│   │   └── http/               ← Small helpers every API route uses: "who
│   │                              is logged in," "wrap this in error
│   │                              handling," "read the session cookie"
│   │
│   ├── lib/                    ← Small shared utilities used everywhere
│   │                              (formatting dates, the permission list,
│   │                              the error types)
│   │
│   └── hooks/                  ← Small reusable bits of frontend logic
│                                   (e.g. "who is currently logged in")
│
├── drizzle/                    ← The database's version history. Every
│                                   file here is one migration — a
│                                   permanent, numbered record of a change
│                                   made to the database structure. Never
│                                   edit an old one; only add new ones.
│
├── tests/
│   ├── unit/                   ← Fast tests with no real database
│   └── integration/            ← Tests that run against a real, temporary
│                                   PostgreSQL database — this is what
│                                   proves the stock engine can't go
│                                   negative even under real concurrent load
│
├── scripts/
│   ├── migrate.ts              ← Applies the drizzle/ migrations
│   └── bootstrap-admin.ts      ← Creates the very first login account
│
├── public/                     ← Static files served as-is (currently empty)
│
├── .env                        ← Your local secrets (never committed to git)
├── .env.example                ← A template showing what .env needs,
│                                   with no real values in it
├── package.json                ← The list of every dependency, and every
│                                   command you can run (npm run dev, etc.)
├── next.config.mjs             ← Framework-level settings (security headers)
└── drizzle.config.ts           ← Tells the migration tool where the
                                    schema and the database are
```

---

## 4. How a page actually works — one concrete example

Take the **Products** page as a worked example, since it's the one you'll
touch most:

1. You click "Products" in the sidebar → your browser loads
   `src/app/(app)/products/page.tsx`.
2. That page is marked `'use client'`, meaning it runs in your browser and
   is allowed to be interactive (search boxes, dropdowns, buttons).
3. As soon as it loads, it calls `fetch('/api/products')` — this hits
   `src/app/api/products/route.ts` on the server.
4. That API route checks you're logged in and have permission to view
   products, then calls a function in `src/server/services/product-service.ts`.
5. That service function builds and runs an actual SQL query against
   PostgreSQL, using Drizzle (the tool that lets TypeScript code build SQL
   queries safely, instead of writing raw SQL strings by hand).
6. The results come back up through the same chain and get displayed as
   the table you see.

Every other page in the app follows this exact same pattern: **page →
fetch → API route → service function → database → back up**. Once you
understand this one, you understand the shape of the whole application.

---

## 5. The database — what it actually stores (18 tables)

Grouped by what they're for:

**Who can log in and do what**
| Table | What it holds |
|---|---|
| `users` | Accounts — email, password (encrypted), which role they have |
| `roles` | The three roles: Administrator, Inventory Manager, Staff |
| `permissions` | The full list of specific things a role can be allowed to do |
| `role_permissions` | Which permissions each role actually has |
| `user_permissions` | Rare one-off exceptions for a specific person |
| `sessions` | Who is currently logged in, and until when |
| `mfa_credentials` | Two-factor authentication secrets (encrypted) |
| `mfa_recovery_codes` | Backup codes if someone loses their 2FA device |
| `rate_limit_counters` | Prevents someone from hammering the login form |

**The actual product catalogue**
| Table | What it holds |
|---|---|
| `products` | Every printer, toner, part, etc. — name, SKU, minimum stock, which printer models it's compatible with, and more |
| `categories` | Printers, Toners & Ink, Spare Parts, Paper, Accessories, Maintenance |
| `brands` | HP, Canon, Epson, Kyocera, and so on |

**Who you buy from and sell to**
| Table | What it holds |
|---|---|
| `suppliers` | Companies you purchase stock from |
| `customers` | People/businesses you sell stock to |

**Where stock physically sits**
| Table | What it holds |
|---|---|
| `locations` | Your warehouses/stores (e.g. "Main store") |

**Stock itself — this is the most important part of the whole app**
| Table | What it holds |
|---|---|
| `stock_levels` | The current quantity of one product at one location, right now |
| `stock_transactions` | Every single stock movement that has ever happened — a permanent, unchangeable log |

**Accountability**
| Table | What it holds |
|---|---|
| `audit_logs` | Every sensitive action anyone has ever taken — logins, role changes, product edits, every stock movement |

---

## 6. The most important design decision in the whole app: the stock ledger

This deserves its own section because it's genuinely the core of the
system, and it's worth understanding *why* it's built this way.

**`stock_levels` is not the source of truth.** It's a convenient snapshot —
"how much of product X is at location Y right now" — but it is only ever
updated as a side effect of something else: a row being added to
`stock_transactions`.

**`stock_transactions` is the real source of truth.** It is a permanent,
growing history — every Add, every Remove, every correction, forever. It
records: which product, which location, how much, why, who did it, when,
which supplier it came from (if any), which customer it went to (if any),
and any notes. **Nothing is ever deleted or edited in this table** — the
database itself physically refuses it (an update or delete attempt is
rejected automatically, no matter who tries it, even with direct database
access). If a mistake needs correcting, a *new* row gets added recording
the correction — the mistake stays visible in the history, it's just
followed by a fix.

This is why, when you asked earlier to delete some test data, the database
sometimes refused and I had to work around it carefully — that refusal is
the safety feature working exactly as designed, not a bug.

**Stock can never go negative**, even if two people try to remove the last
few units at the exact same moment. This is enforced by the database
itself locking the relevant row during the operation, so the second request
always sees the true, up-to-date number rather than a stale one. This is
tested directly — `tests/integration/concurrency.test.ts` fires many
simultaneous stock removals at the same product and proves the final count
is always mathematically correct, never negative.

---

## 7. Roles and what each one can do

| Role | Can do |
|---|---|
| **Administrator** | Everything — including creating/disabling user accounts and changing roles |
| **Inventory Manager** | Manage products, stock, suppliers, customers, categories, brands, locations, reports — but not user accounts |
| **Staff** | Day-to-day stock work — add/remove stock, look things up — but can't create products or manage suppliers/customers |

This is enforced on the **server**, not just by hiding buttons in the
interface — even if someone found a way to send a request directly to the
server bypassing the screen entirely, the server checks their role again
before doing anything.

---

## 8. Security, briefly

- Passwords are never stored as plain text — only a one-way scrambled
  version (`bcrypt`) that can be checked but never reversed
- Two-factor authentication (an extra 6-digit code from a phone app) is
  available per account, optional
- Every login, role change, and stock movement is permanently recorded in
  the audit log
- The site enforces HTTPS-only cookies in production and blocks a range of
  common web attacks via security headers

---

## 9. How to run it, in one line each

| Task | Command |
|---|---|
| Start it locally for development | `npm run dev` |
| Apply any new database changes | `npm run db:migrate` |
| Create the first login account | `npm run bootstrap:admin` |
| Run the automated tests | `npm run test:unit` and `npm run test:integration` |
| Build the real, optimized version | `npm run build` |
| Run that optimized version | `npm run start` |

---

## 10. If you want to change something later

- **Add a new page** → create a new folder under `src/app/(app)/`, add it
  to `src/components/layout/nav-items.ts` so it shows up in the sidebar
- **Add a new field to products** → change `src/server/db/schema.ts`, run
  `npx drizzle-kit generate` to create a migration file, then
  `npm run db:migrate` to apply it — then update the form
  (`src/features/products/product-form-dialog.tsx`) to actually let someone
  type it in
- **Change what a role can do** → `src/lib/permissions.ts`

This is genuinely the same pattern I used to build every feature in this
project — nothing here is a simplification for this document, it's exactly
how the real thing works.
