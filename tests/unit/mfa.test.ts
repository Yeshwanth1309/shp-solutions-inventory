import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'unit-test-secret-that-is-definitely-long-enough-0123456789';
});

describe('TOTP verification', () => {
  it('accepts the correct current code', async () => {
    const { generateTotpSecret, verifyTotp } = await import('@/server/auth/mfa');
    const { authenticator } = await import('otplib');
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
  });

  it('rejects a code generated from a different secret', async () => {
    const { generateTotpSecret, verifyTotp } = await import('@/server/auth/mfa');
    const { authenticator } = await import('otplib');
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = authenticator.generate(secretB);
    expect(verifyTotp(codeForB, secretA)).toBe(false);
  });

  it('rejects malformed input without throwing', async () => {
    const { generateTotpSecret, verifyTotp } = await import('@/server/auth/mfa');
    const secret = generateTotpSecret();
    expect(verifyTotp('not-a-code', secret)).toBe(false);
    expect(verifyTotp('12345', secret)).toBe(false);
    expect(verifyTotp('', secret)).toBe(false);
  });

  it('builds a well-formed otpauth URL', async () => {
    const { generateTotpSecret, buildOtpAuthUrl } = await import('@/server/auth/mfa');
    const secret = generateTotpSecret();
    const url = buildOtpAuthUrl('owner@shpsolutions.in', secret);
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('SHP%20Solutions');
  });
});
