import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '@/server/db/client';
import { ensureAccessControlSeed } from '@/server/db/bootstrap';

/**
 * Test database lifecycle. `resetDatabase` truncates business tables between
 * tests and reinstalls only access-control reference data — never product,
 * stock or supplier rows.
 */
const BUSINESS_TABLES = [
  'audit_logs',
  'stock_transactions',
  'stock_levels',
  'products',
  'suppliers',
  'brands',
  'categories',
  'locations',
  'mfa_recovery_codes',
  'mfa_credentials',
  'sessions',
  'user_permissions',
  'users',
  'rate_limit_counters',
];

export async function migrateTestDatabase(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
}

export async function resetDatabase(): Promise<void> {
  // The ledger has an append-only trigger that blocks DELETE. TRUNCATE is a
  // DDL-level operation and is not intercepted by row triggers, which lets
  // tests clean up without weakening the production guarantee.
  await db.execute(sql.raw(`TRUNCATE TABLE ${BUSINESS_TABLES.join(', ')} RESTART IDENTITY CASCADE`));
  await ensureAccessControlSeed(db);
}

export async function closeTestDatabase(): Promise<void> {
  await pool.end();
}

export { db, pool };
