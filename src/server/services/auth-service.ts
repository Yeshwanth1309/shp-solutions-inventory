import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { mfaCredentials, mfaRecoveryCodes, roles, users } from '@/server/db/schema';
import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  verifyPassword,
} from '@/server/auth/crypto';
import { buildOtpAuthUrl, buildQrDataUrl, generateTotpSecret, openTotpSecret, sealTotpSecret, verifyTotp } from '@/server/auth/mfa';
import { AppError, forbidden, notFound, unauthenticated } from '@/lib/errors';
import { enforceRateLimit, resetRateLimit } from '@/server/auth/rate-limit';
import { recordAudit } from './audit-service';
import { revokeAllUserSessions } from './session-service';
import type { RoleKey } from '@/lib/permissions';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
const RECOVERY_CODE_COUNT = 10;

export interface CredentialCheck {
  userId: string;
  email: string;
  name: string;
  roleKey: RoleKey;
  mfaEnabled: boolean;
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
      mfaEnabled: users.mfaEnabled,
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
    mfaEnabled: user.mfaEnabled,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Checks a TOTP code against the user's stored (encrypted) secret. */
export async function verifyUserTotp(userId: string, code: string): Promise<boolean> {
  await enforceRateLimit('mfa', userId);
  const rows = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, userId)).limit(1);
  const credential = rows[0];
  if (!credential?.confirmedAt) return false;

  const secret = openTotpSecret({
    ciphertext: credential.secretCiphertext,
    iv: credential.secretIv,
    authTag: credential.secretAuthTag,
  });
  return verifyTotp(code, secret);
}

/** Consumes a single-use recovery code. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  await enforceRateLimit('mfa', userId);
  const target = hashRecoveryCode(code);

  const updated = await db
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      sql`${mfaRecoveryCodes.userId} = ${userId} AND ${mfaRecoveryCodes.codeHash} = ${target} AND ${mfaRecoveryCodes.usedAt} IS NULL`,
    )
    .returning({ id: mfaRecoveryCodes.id });

  if (updated.length === 0) return false;

  await recordAudit({
    action: 'MFA_RECOVERY_USED',
    actorId: userId,
    entityType: 'user',
    entityId: userId,
    summary: 'Signed in with a recovery code',
  });
  return true;
}

export interface MfaEnrolment {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/**
 * Starts enrolment. The secret is stored immediately but left unconfirmed, so
 * it is inert until the user proves they can generate a valid code from it.
 */
export async function beginMfaEnrolment(userId: string, email: string): Promise<MfaEnrolment> {
  const secret = generateTotpSecret();
  const sealed = sealTotpSecret(secret);

  await db
    .insert(mfaCredentials)
    .values({
      userId,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretAuthTag: sealed.authTag,
      confirmedAt: null,
    })
    .onConflictDoUpdate({
      target: mfaCredentials.userId,
      set: {
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
        confirmedAt: null,
      },
    });

  const otpauthUrl = buildOtpAuthUrl(email, secret);
  return { secret, otpauthUrl, qrDataUrl: await buildQrDataUrl(otpauthUrl) };
}

/** Confirms enrolment and issues recovery codes (shown once). */
export async function confirmMfaEnrolment(userId: string, code: string): Promise<string[]> {
  const rows = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, userId)).limit(1);
  const credential = rows[0];
  if (!credential) throw notFound('Start setting up two-factor authentication first.');

  const secret = openTotpSecret({
    ciphertext: credential.secretCiphertext,
    iv: credential.secretIv,
    authTag: credential.secretAuthTag,
  });

  if (!verifyTotp(code, secret)) {
    throw new AppError('VALIDATION_ERROR', 'That code did not match. Check your authenticator app and try again.');
  }

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  await db.transaction(async (tx) => {
    await tx.update(mfaCredentials).set({ confirmedAt: new Date() }).where(eq(mfaCredentials.userId, userId));
    await tx.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })));
  });

  await recordAudit({
    action: 'MFA_ENROLLED',
    actorId: userId,
    entityType: 'user',
    entityId: userId,
    summary: 'Enabled two-factor authentication',
  });

  return codes;
}

/** Removing MFA is sensitive, so the current password is required again. */
export async function removeMfa(userId: string, currentPassword: string): Promise<void> {
  const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw notFound('That user no longer exists.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw forbidden('That password is not correct.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(mfaCredentials).where(eq(mfaCredentials.userId, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.update(users).set({ mfaEnabled: false }).where(eq(users.id, userId));
  });

  await recordAudit({
    action: 'MFA_REMOVED',
    actorId: userId,
    entityType: 'user',
    entityId: userId,
    summary: 'Removed two-factor authentication',
  });
}

export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(mfaRecoveryCodes)
    .where(sql`${mfaRecoveryCodes.userId} = ${userId} AND ${mfaRecoveryCodes.usedAt} IS NULL`);
  return rows[0]?.value ?? 0;
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
