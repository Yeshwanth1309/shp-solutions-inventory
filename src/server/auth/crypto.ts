import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getEnv } from '@/lib/env';

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

/** Derives a stable 32-byte AES key from AUTH_SECRET. */
function encryptionKey(): Buffer {
  return scryptSync(getEnv().AUTH_SECRET, 'shp-mfa-secret-v1', 32);
}

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** AES-256-GCM. Used so TOTP seeds are not readable from a database dump. */
export function encryptSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Human-friendly recovery code, e.g. "7K4M-QP2X-9DTR". */
export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]!);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/** CSRF double-submit token. */
export function generateCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}
