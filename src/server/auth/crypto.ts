import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Cryptographic helpers. Every primitive here comes from Node's audited
 * `crypto` module or from bcrypt — nothing is hand-rolled.
 */

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Opaque session token. Returned to the client once; only the hash is stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Session tokens are high-entropy random values, so a fast hash is the correct
 * choice here — it is a lookup key, not a password.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** CSRF double-submit token. */
export function generateCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}
