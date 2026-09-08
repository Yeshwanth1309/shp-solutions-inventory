import { defineWorkspace } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, './src') };

/**
 * Two projects, deliberately separated:
 *  - unit        pure logic, no database, fast
 *  - integration real PostgreSQL, runs serially against TEST_DATABASE_URL
 *
 * The integration setup refuses to start unless TEST_DATABASE_URL is set and
 * differs from DATABASE_URL, so tests can never truncate a real database.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['tests/unit/setup.ts'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['tests/integration/setup.ts'],
      // One forked process, one file at a time. Integration tests truncate the
      // test database between cases, so they must never run in parallel.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  },
]);
