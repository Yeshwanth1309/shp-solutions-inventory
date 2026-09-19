import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { roles, users } from '@/server/db/schema';
import { hashPassword, verifyPassword } from '@/server/auth/crypto';
import { AppError, forbidden, notFound, unauthenticated } from '@/lib/errors';
import { enforceRateLimit, resetRateLimit } from '@/server/auth/rate-limit';
import { recordAudit } from './audit-service';
import { revokeAllUserSessions } from './session-service';
import type { RoleKey } from '@/lib/permissions';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

export interface CredentialCheck {
  userId: string;
  email: string;
  name: string;
  roleKey: RoleKey;
  mustChangePassword: boolean;
}

export interface LoginContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Verifies email + password.
 *
 * The failure path is deliberately uniform: unknown account, wrong password and
 * disabled account all produce the same message and comparable timing, so the
 * endpoint cannot be used to enumerate who has an account here.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  context: LoginContext = {},
): Promise<CredentialCheck> {
  const normalised = email.trim().toLowerCase();
  await enforceRateLimit('login', normalised);
  if (context.ipAddress) await enforceRateLimit('login', context.ipAddress);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      roleKey: roles.key,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);

  const user = rows[0];
  const genericFailure = unauthenticated('That email and password combination is not recognised.');

  if (!user) {
    // Spend comparable time so a missing account is not measurably faster.
    await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    await recordAudit({
      action: 'LOGIN_FAILED',
      actorEmail: normalised,
      summary: `Failed sign-in for ${normalised}`,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      'RATE_LIMITED',
      'This account is temporarily locked after repeated failed attempts. Try again shortly.',
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      })
      .where(eq(users.id, user.id));

    await recordAudit({
      action: 'LOGIN_FAILED',
      actorId: user.id,
      actorEmail: user.email,
      summary: `Failed sign-in for ${user.email} (attempt ${attempts})`,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    throw genericFailure;
  }

  if (!user.isActive) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      actorId: user.id,
      actorEmail: user.email,
      summary: `Sign-in blocked: account disabled (${user.email})`,
      ipAddress: context.ipAddress ?? null,
    });
    throw genericFailure;
  }

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await resetRateLimit('login', normalised);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roleKey: user.roleKey as RoleKey,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Changing a password revokes every other session for that user. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId?: string,
): Promise<void> {
  const rows = await db.select({ passwordHash: users.passwordHash, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw notFound('That user no longer exists.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw forbidden('Your current password is not correct.');
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    })
    .where(eq(users.id, userId));

  await revokeAllUserSessions(userId, keepSessionId);
  await recordAudit({
    action: 'PASSWORD_CHANGED',
    actorId: userId,
    actorEmail: user.email,
    entityType: 'user',
    entityId: userId,
    summary: 'Changed their password',
  });
}
