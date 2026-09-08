/**
 * Drizzle wraps the underlying driver error in a DrizzleQueryError; the actual
 * PostgreSQL error (code, message) lives on `.cause`, not on the wrapper
 * itself. Anything that needs to branch on a Postgres error code or read its
 * real message should go through these helpers rather than inspecting the
 * top-level error directly.
 */

export function isPgErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === code) return true;
    current = candidate.cause;
  }
  return false;
}

export function pgErrorMessage(error: unknown): string {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === 'string' && !candidate.message.startsWith('Failed query')) {
      return candidate.message;
    }
    current = candidate.cause;
  }
  return error instanceof Error ? error.message : String(error);
}

export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
} as const;
