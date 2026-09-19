import { headers } from 'next/headers';
import { forbidden, unauthenticated } from '@/lib/errors';
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

export async function requirePermission(permission: Permission): Promise<AuthenticatedSession> {
  const session = await requireSession();
  if (!session.user.permissions.has(permission)) {
    throw forbidden('You do not have access to this action.');
  }
  return session;
}

export async function requireAnyPermission(...permissions: Permission[]): Promise<AuthenticatedSession> {
  const session = await requireSession();
  if (!permissions.some((p) => session.user.permissions.has(p))) {
    throw forbidden('You do not have access to this action.');
  }
  return session;
}

export async function getClientContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null;
  return { ipAddress, userAgent: headerList.get('user-agent') };
}
