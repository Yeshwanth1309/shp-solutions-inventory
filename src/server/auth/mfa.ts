import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { decryptSecret, encryptSecret, type SealedSecret } from './crypto';

/**
 * TOTP (RFC 6238) via otplib. A one-step window either side absorbs clock
 * drift between the server and the user's phone.
 */
authenticator.options = { window: 1, step: 30 };

const ISSUER = 'SHP Solutions Inventory';

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function sealTotpSecret(secret: string): SealedSecret {
  return encryptSecret(secret);
}

export function openTotpSecret(sealed: SealedSecret): string {
  return decryptSecret(sealed);
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function buildQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
}

export function verifyTotp(token: string, secret: string): boolean {
  const normalised = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalised)) return false;
  try {
    return authenticator.verify({ token: normalised, secret });
  } catch {
    return false;
  }
}
