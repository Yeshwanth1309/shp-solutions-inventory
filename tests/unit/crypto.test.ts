import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'unit-test-secret-that-is-definitely-long-enough-0123456789';
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/shp_dev';
});

describe('password hashing', () => {
  it('produces a hash that verifies against the original password', async () => {
    const { hashPassword, verifyPassword } = await import('@/server/auth/crypto');
    const hash = await hashPassword('CorrectHorse123Battery');
    expect(await verifyPassword('CorrectHorse123Battery', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const { hashPassword, verifyPassword } = await import('@/server/auth/crypto');
    const hash = await hashPassword('CorrectHorse123Battery');
    expect(await verifyPassword('WrongPassword123', hash)).toBe(false);
  });

  it('never stores the password in plaintext', async () => {
    const { hashPassword } = await import('@/server/auth/crypto');
    const hash = await hashPassword('CorrectHorse123Battery');
    expect(hash).not.toContain('CorrectHorse123Battery');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt
  });
});

describe('AES-256-GCM secret sealing (MFA secrets)', () => {
  it('round-trips a TOTP secret', async () => {
    const { encryptSecret, decryptSecret } = await import('@/server/auth/crypto');
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces ciphertext that does not contain the plaintext', async () => {
    const { encryptSecret } = await import('@/server/auth/crypto');
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(sealed.ciphertext).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('fails to decrypt if the auth tag has been tampered with', async () => {
    const { encryptSecret, decryptSecret } = await import('@/server/auth/crypto');
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP');
    const tampered = { ...sealed, authTag: Buffer.from('0'.repeat(24), 'base64').toString('base64') };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('session tokens', () => {
  it('generates a high-entropy, URL-safe token', async () => {
    const { generateSessionToken } = await import('@/server/auth/crypto');
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(32);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it('hashes the same token deterministically', async () => {
    const { hashSessionToken } = await import('@/server/auth/crypto');
    const token = 'fixed-token-for-this-test';
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('produces different hashes for different tokens', async () => {
    const { hashSessionToken } = await import('@/server/auth/crypto');
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});

describe('recovery codes', () => {
  it('generates codes in the expected XXXX-XXXX-XXXX shape', async () => {
    const { generateRecoveryCode } = await import('@/server/auth/crypto');
    const code = generateRecoveryCode();
    expect(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)).toBe(true);
  });

  it('hashes a recovery code case- and whitespace-insensitively', async () => {
    const { hashRecoveryCode } = await import('@/server/auth/crypto');
    expect(hashRecoveryCode('abcd-efgh-1234')).toBe(hashRecoveryCode(' ABCD-EFGH-1234 '));
  });
});
