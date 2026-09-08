import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from './client';
import { permissions, rolePermissions, roles } from './schema';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DESCRIPTIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  type Permission,
} from '@/lib/permissions';

/**
 * Installs the access-control reference data: the permission catalogue, the
 * three system roles, and the mapping between them.
 *
 * This is configuration, not business data. It contains no products, stock,
 * suppliers or customers, so it is safe to run against any environment, and it
 * is idempotent — running it twice changes nothing.
 */
export async function ensureAccessControlSeed(executor: DbExecutor): Promise<void> {
  const permissionKeys = Object.values(PERMISSIONS) as Permission[];

  await executor
    .insert(permissions)
    .values(permissionKeys.map((key) => ({ key, description: PERMISSION_DESCRIPTIONS[key] })))
    .onConflictDoNothing({ target: permissions.key });

  await executor
    .insert(roles)
    .values(
      ROLE_KEYS.map((key) => ({
        key,
        name: ROLE_DESCRIPTIONS[key].name,
        description: ROLE_DESCRIPTIONS[key].description,
        isSystem: true,
      })),
    )
    .onConflictDoNothing({ target: roles.key });

  const permissionRows = await executor.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

  const roleRows = await executor.select({ id: roles.id, key: roles.key }).from(roles);

  for (const role of roleRows) {
    const granted = ROLE_PERMISSIONS[role.key];
    const values = granted
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    if (values.length > 0) {
      await executor.insert(rolePermissions).values(values).onConflictDoNothing();
    }

    // Drop grants that are no longer part of the role definition.
    const keepIds = values.map((v) => v.permissionId);
    if (keepIds.length > 0) {
      await executor
        .delete(rolePermissions)
        .where(
          sql`${rolePermissions.roleId} = ${role.id} AND ${rolePermissions.permissionId} NOT IN (${sql.join(
            keepIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
    }
  }
}

export async function roleIdByKey(executor: DbExecutor, key: (typeof ROLE_KEYS)[number]): Promise<string> {
  const rows = await executor.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Role ${key} is missing. Run the access-control seed first.`);
  return row.id;
}
