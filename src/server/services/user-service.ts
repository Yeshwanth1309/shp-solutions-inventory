import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { roles, users } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/crypto';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { recordAudit } from './audit-service';
import { revokeAllUserSessions } from './session-service';
import type { CreateUserInput, UpdateUserInput } from '@/server/validation/auth-schemas';
import type { RoleKey } from '@/lib/permissions';

export async function listUsers() {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      mfaEnabled: users.mfaEnabled,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .orderBy(asc(users.name));
}

async function roleIdFor(roleKey: RoleKey): Promise<string> {
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1);
  const role = rows[0];
  if (!role) throw notFound(`Role ${roleKey} is not configured. Run the bootstrap script.`);
  return role.id;
}

export async function createUser(input: CreateUserInput, actor: { id: string; email: string }) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  if (existing[0]) throw conflict('An account with that email already exists.');

  const inserted = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      roleId: await roleIdFor(input.roleKey),
      mustChangePassword: input.mustChangePassword,
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  const user = inserted[0];
  if (!user) throw conflict('The account could not be created.');

  await recordAudit({
    action: 'USER_CREATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'user',
    entityId: user.id,
    summary: `Created ${input.roleKey} account for ${user.email}`,
  });

  return user;
}

/**
 * Updates a user. Two guards matter here: an admin cannot strip their own admin
 * role or disable themselves, which would otherwise be an easy way to lock the
 * business out of its own system.
 */
export async function updateUser(
  targetId: string,
  input: UpdateUserInput,
  actor: { id: string; email: string },
) {
  const rows = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive, roleKey: roles.key })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, targetId))
    .limit(1);
  const target = rows[0];
  if (!target) throw notFound('That user no longer exists.');

  if (targetId === actor.id) {
    if (input.isActive === false) throw forbidden('You cannot disable your own account.');
    if (input.roleKey && input.roleKey !== target.roleKey) {
      throw forbidden('You cannot change your own role. Ask another administrator.');
    }
  }

  if (target.roleKey === 'ADMIN' && (input.roleKey && input.roleKey !== 'ADMIN' || input.isActive === false)) {
    const remaining = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(sql`${roles.key} = 'ADMIN' AND ${users.isActive} = true AND ${users.id} <> ${targetId}`);
    if ((remaining[0]?.value ?? 0) === 0) {
      throw forbidden('This is the last active administrator. Promote someone else first.');
    }
  }

  const updated = await db
    .update(users)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(input.roleKey ? { roleId: await roleIdFor(input.roleKey) } : {}),
    })
    .where(eq(users.id, targetId))
    .returning({ id: users.id, email: users.email });

  const user = updated[0];
  if (!user) throw notFound('That user no longer exists.');

  // A disabled account must not keep working sessions.
  if (input.isActive === false) await revokeAllUserSessions(targetId);

  if (input.roleKey && input.roleKey !== target.roleKey) {
    await recordAudit({
      action: 'ROLE_CHANGED',
      actorId: actor.id,
      actorEmail: actor.email,
      entityType: 'user',
      entityId: targetId,
      summary: `Changed ${target.email} from ${target.roleKey} to ${input.roleKey}`,
    });
  }

  await recordAudit({
    action: input.isActive === false ? 'USER_DISABLED' : input.isActive === true ? 'USER_ENABLED' : 'USER_UPDATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'user',
    entityId: targetId,
    summary: `Updated account ${target.email}`,
    metadata: { fields: Object.keys(input) },
  });

  return user;
}

export async function revokeUserSessions(targetId: string, actor: { id: string; email: string }) {
  const revoked = await revokeAllUserSessions(targetId);
  await recordAudit({
    action: 'SESSION_REVOKED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'user',
    entityId: targetId,
    summary: `Signed out ${revoked} session${revoked === 1 ? '' : 's'}`,
  });
  return revoked;
}

export async function listRoles() {
  return db.select({ id: roles.id, key: roles.key, name: roles.name, description: roles.description }).from(roles);
}
