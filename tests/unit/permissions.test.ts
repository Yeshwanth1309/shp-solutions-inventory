import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS, resolvePermissions } from '@/lib/permissions';

describe('permissions', () => {
  it('grants ADMIN every defined permission', () => {
    const all = Object.values(PERMISSIONS);
    const admin = resolvePermissions('ADMIN');
    for (const permission of all) expect(admin.has(permission)).toBe(true);
  });

  it('does not let STAFF manage users or approve product creation', () => {
    const staff = resolvePermissions('STAFF');
    expect(staff.has(PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(staff.has(PERMISSIONS.PRODUCT_CREATE)).toBe(false);
    expect(staff.has(PERMISSIONS.INVENTORY_ADD)).toBe(true);
  });

  it('lets INVENTORY_MANAGER manage the catalogue but not users', () => {
    const manager = resolvePermissions('INVENTORY_MANAGER');
    expect(manager.has(PERMISSIONS.PRODUCT_CREATE)).toBe(true);
    expect(manager.has(PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(manager.has(PERMISSIONS.ROLE_MANAGE)).toBe(false);
  });

  it('lets a per-user grant widen STAFF beyond its role', () => {
    const widened = resolvePermissions('STAFF', [{ key: PERMISSIONS.PRODUCT_CREATE, granted: true }]);
    expect(widened.has(PERMISSIONS.PRODUCT_CREATE)).toBe(true);
  });

  it('lets a per-user deny narrow a role below its default grant', () => {
    const narrowed = resolvePermissions('STAFF', [{ key: PERMISSIONS.INVENTORY_REMOVE, granted: false }]);
    expect(narrowed.has(PERMISSIONS.INVENTORY_REMOVE)).toBe(false);
    expect(narrowed.has(PERMISSIONS.INVENTORY_ADD)).toBe(true);
  });

  it('every role permission set is a subset of ADMIN', () => {
    const adminSet = new Set(ROLE_PERMISSIONS.ADMIN);
    for (const key of ['INVENTORY_MANAGER', 'STAFF'] as const) {
      for (const permission of ROLE_PERMISSIONS[key]) {
        expect(adminSet.has(permission)).toBe(true);
      }
    }
  });
});
