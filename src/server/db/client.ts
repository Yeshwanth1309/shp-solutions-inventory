import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * A single pool per process. Next.js dev mode re-evaluates modules on hot
 * reload, so the pool is stashed on globalThis to avoid exhausting Postgres
 * connections during development.
 *
 * The cache is deliberately limited to development. Under test, each file gets
 * a fresh module registry but shares one process, so a globally cached pool
 * would be closed by the first file's teardown and then reused — already
 * ended — by the next one.
 */
const globalForDb = globalThis as unknown as { __shpPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = globalForDb.__shpPool ?? createPool();
if (process.env.NODE_ENV === 'development') globalForDb.__shpPool = pool;

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;
/** The type passed to callbacks inside `db.transaction(...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything you can run a query on: the pool-backed db or an open transaction. */
export type DbExecutor = Database | Transaction;

export { schema };
