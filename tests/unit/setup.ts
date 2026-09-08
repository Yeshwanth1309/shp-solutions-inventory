/**
 * Environment for the unit project. Unit tests must never touch a real
 * database, but a few modules under test (validation schemas, deriveStatus)
 * live alongside service files that open a connection pool at import time.
 * Setting DATABASE_URL here satisfies that import without a real connection
 * ever being used — no query is issued by any unit test.
 */
process.env.DATABASE_URL ??= 'postgresql://unit-tests-do-not-connect/unused';
process.env.AUTH_SECRET ??= 'unit-test-secret-that-is-definitely-long-enough-0123456789';
