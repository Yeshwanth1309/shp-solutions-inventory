import { eq, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { rateLimitCounters } from '@/server/db/schema';
import { rateLimited } from '@/lib/errors';

/**
 * Fixed-window rate limiting backed by the database, so limits hold across
 * multiple app instances without needing Redis. Buckets are keyed by action
 * plus an identifier (IP, email or user id). For high traffic this should move
 * to Redis — see ARCHITECTURE.md.
 */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  mfa: { limit: 10, windowSeconds: 300 },
  passwordReset: { limit: 5, windowSeconds: 900 },
  stockMutation: { limit: 120, windowSeconds: 60 },
  report: { limit: 20, windowSeconds: 60 },
  api: { limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function consumeRateLimit(
  action: RateLimitAction,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[action];
  const windowMs = rule.windowSeconds * 1000;
  const windowEnd = new Date(Math.ceil(Date.now() / windowMs) * windowMs);
  const bucket = `${action}:${identifier}`;

  const [row] = await db
    .insert(rateLimitCounters)
    .values({ bucket, windowEnd, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucket, rateLimitCounters.windowEnd],
      set: { count: sql`${rateLimitCounters.count} + 1` },
    })
    .returning({ count: rateLimitCounters.count });

  const count = row?.count ?? 1;
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt: windowEnd };
}

/** Consumes a slot and throws a 429 if the caller is over the limit. */
export async function enforceRateLimit(action: RateLimitAction, identifier: string): Promise<void> {
  const result = await consumeRateLimit(action, identifier);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    throw rateLimited(`Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`);
  }
}

/** Clears a bucket, e.g. after a successful sign-in. */
export async function resetRateLimit(action: RateLimitAction, identifier: string): Promise<void> {
  await db.delete(rateLimitCounters).where(eq(rateLimitCounters.bucket, `${action}:${identifier}`));
}

/** Housekeeping: drop windows that have already elapsed. */
export async function pruneRateLimitCounters(): Promise<number> {
  const rows = await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowEnd, new Date()))
    .returning({ id: rateLimitCounters.id });
  return rows.length;
}
