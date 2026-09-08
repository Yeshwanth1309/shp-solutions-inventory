import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';

export const SESSION_COOKIE = '__Host-shp_session';
export const CSRF_COOKIE = 'shp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * `__Host-` prefixed cookies are accepted by browsers only when Secure, path=/
 * and no Domain attribute are all set, which prevents a subdomain from writing
 * a session cookie for the app. Over plain HTTP in local development the prefix
 * cannot be used, so the name falls back automatically.
 */
export function sessionCookieName(): string {
  return isSecureContext() ? SESSION_COOKIE : 'shp_session';
}

export function isSecureContext(): boolean {
  try {
    return getEnv().APP_URL.startsWith('https://');
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value;
}

export async function writeSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), '', {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * CSRF uses the double-submit pattern: this cookie is readable by scripts so
 * the client can echo it in a header, which a cross-site attacker cannot do.
 * It is not a session credential.
 */
export async function issueCsrfCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function readCsrfCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CSRF_COOKIE)?.value;
}
