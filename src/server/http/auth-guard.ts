import { headers } from 'next/headers';
import { forbidden, unauthenticated, AppError } from '@/lib/errors';
import { resolveSession, type AuthenticatedSession } from '@/server/services/session-service';
import { readSessionToken } from './session-cookie';
import type { Permission } from '@/lib/permissions';

/**
 * Server-side authorization.
 *
 * These helpers are the only sanctioned way for a route or page to learn who
 * the caller is. Hiding a button in the UI is a convenience; this is the
 * control. Every mutating route calls `requirePermission`.
 */

export async function getSession(): Promise<AuthenticatedSession | null> {
  return resolveSession(await readSessionToken());
}

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  return session;
}

/**
 * A user with MFA enabled must have completed the second factor for this
 * session; otherwise the session is only half-authenticated.
 */
export async function requireVerifiedSession(): Promise<AuthenticatedSession> {
  const session = await requireSession();
  if (session.user.mfaEnabled && !session.mfaVerifiedAt) {
    throw new AppError('MFA_REQUIRED', 'Finish signing in with your authentication code.');
  }
  return session;
}

export async function requirePermission(permission: Permission): Promise<AuthenticatedSession> {
  const session = await requireVerifiedSession();
  if (!session.user.permissions.has(permission)) {
    throw forbidden('You do not have access to this action.');
  }
  return session;
}

export async function requireAnyPermission(...permissions: Permission[]): Promise<AuthenticatedSession> {
  const session = await requireVerifiedSession();
  if (!permissions.some((p) => session.user.permissions.has(p))) {
    throw forbidden('You do not have access to this action.');
  }
  return session;
}

/** Sensitive changes need proof the user authenticated recently. */
export async function requireRecentAuth(withinMinutes = 15): Promise<AuthenticatedSession> {
  const session = await requireVerifiedSession();
  const reference = session.mfaVerifiedAt ?? session.createdAt;
  if (Date.now() - reference.getTime() > withinMinutes * 60 * 1000) {
    throw new AppError('REAUTH_REQUIRED', 'Confirm your password again to make this change.');
  }
  return session;
}

export async function getClientContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null;
  return { ipAddress, userAgent: headerList.get('user-agent') };
}
