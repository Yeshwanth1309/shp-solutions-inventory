import { and, desc, eq, isNull, lt, ne } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sessions, users, roles, userPermissions, permissions } from '@/server/db/schema';
import { generateSessionToken, hashSessionToken } from '@/server/auth/crypto';
import { resolvePermissions, type RoleKey } from '@/lib/permissions';
import { getEnv } from '@/lib/env';

/**
 * Server-side session store.
 *
 * Sessions carry two independent deadlines: an absolute lifetime and an idle
 * timeout. Both are checked on every lookup, and a session that fails either is
 * treated as absent.
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roleKey: RoleKey;
  roleName: string;
  isActive: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  permissions: Set<string>;
}

export interface AuthenticatedSession {
  id: string;
  user: AuthenticatedUser;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  mfaVerifiedAt: Date | null;
}

export interface CreatedSession {
  /** Plaintext token — returned once, set as a cookie, never stored. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

function absoluteExpiry(): Date {
  return new Date(Date.now() + getEnv().SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000);
}

function idleCutoff(): Date {
  return new Date(Date.now() - getEnv().SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000);
}

/**
 * Issues a brand-new session. Called only after credentials are verified, which
 * is what prevents session fixation: the pre-login token is never reused.
 */
export async function createSession(params: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  mfaVerified: boolean;
}): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = absoluteExpiry();

  const [row] = await db
    .insert(sessions)
    .values({
      userId: params.userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      mfaVerifiedAt: params.mfaVerified ? new Date() : null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('Failed to create session');
  return { token, sessionId: row.id, expiresAt };
}

/**
 * Resolves a raw cookie token to a live session, or null. Also refreshes
 * `lastActiveAt` so the idle window slides while the user is working.
 */
export async function resolveSession(token: string | undefined): Promise<AuthenticatedSession | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      createdAt: sessions.createdAt,
      lastActiveAt: sessions.lastActiveAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      mfaVerifiedAt: sessions.mfaVerifiedAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      mfaEnabled: users.mfaEnabled,
      mustChangePassword: users.mustChangePassword,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt <= now) return null;
  if (row.lastActiveAt < idleCutoff()) return null;
  if (!row.isActive) return null;

  const overrides = await db
    .select({ key: permissions.key, granted: userPermissions.granted })
    .from(userPermissions)
    .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
    .where(eq(userPermissions.userId, row.userId));

  await db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, row.sessionId));

  return {
    id: row.sessionId,
    createdAt: row.createdAt,
    lastActiveAt: now,
    expiresAt: row.expiresAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      roleKey: row.roleKey as RoleKey,
      roleName: row.roleName,
      isActive: row.isActive,
      mfaEnabled: row.mfaEnabled,
      mustChangePassword: row.mustChangePassword,
      permissions: resolvePermissions(row.roleKey as RoleKey, overrides),
    },
  };
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

export async function listUserSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastActiveAt: sessions.lastActiveAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastActiveAt))
    .limit(50);
}

/** Deletes sessions that expired more than a day ago. */
export async function pruneExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, cutoff)).returning({ id: sessions.id });
  return rows.length;
}

/**
 * True when the session authenticated recently enough to permit a sensitive
 * change (password, MFA, role assignment).
 */
export function hasRecentAuth(session: AuthenticatedSession, withinMinutes = 15): boolean {
  const reference = session.mfaVerifiedAt ?? session.createdAt;
  return Date.now() - reference.getTime() <= withinMinutes * 60 * 1000;
}
