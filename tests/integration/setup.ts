import 'dotenv/config';
import { beforeAll, afterAll } from 'vitest';

/**
 * Integration test guard rails.
 *
 * Nothing here runs unless TEST_DATABASE_URL is set and points at a different
 * database from DATABASE_URL. That check is what keeps a stray
 * `npm run test:integration` from truncating development or production data.
 */
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Integration tests require a dedicated database — see README.');
}

/**
 * The application URL is redirected below, and several test files share one
 * worker process. Remember the original so the comparison stays meaningful on
 * the second and subsequent files instead of comparing the test URL to itself.
 */
const originalAppUrl = process.env.SHP_ORIGINAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (originalAppUrl) process.env.SHP_ORIGINAL_DATABASE_URL = originalAppUrl;

if (originalAppUrl && new URL(testUrl).pathname === new URL(originalAppUrl).pathname) {
  throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL. Refusing to run destructive tests.');
}

if (!/test/i.test(new URL(testUrl).pathname)) {
  throw new Error(`Refusing to run: the test database name (${new URL(testUrl).pathname}) does not contain "test".`);
}

// Application modules read DATABASE_URL; point them at the test database for
// the lifetime of this process only.
process.env.DATABASE_URL = testUrl;
// NODE_ENV is typed read-only by @types/node (Next.js declares it that way);
// it is still a plain, writable process.env entry at runtime.
(process.env as { NODE_ENV: string }).NODE_ENV = 'test';
process.env.AUTH_SECRET ??= 'test-secret-value-that-is-long-enough-for-validation-0123456789';

beforeAll(async () => {
  const { migrateTestDatabase } = await import('./helpers/database');
  await migrateTestDatabase();
});

afterAll(async () => {
  const { closeTestDatabase } = await import('./helpers/database');
  await closeTestDatabase();
});
