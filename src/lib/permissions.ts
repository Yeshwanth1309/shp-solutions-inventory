/**
 * Permission catalogue and the role -> permission mapping.
 *
 * Authorization is always evaluated on the server from these values. Hiding a
 * button in the UI is a convenience, never a control.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',

  PRODUCT_VIEW: 'product:view',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DEACTIVATE: 'product:deactivate',

  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_ADD: 'inventory:add',
  INVENTORY_REMOVE: 'inventory:remove',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_HISTORY_VIEW: 'inventory:history:view',

  SUPPLIER_VIEW: 'supplier:view',
  SUPPLIER_MANAGE: 'supplier:manage',

  LOCATION_VIEW: 'location:view',
  LOCATION_MANAGE: 'location:manage',

  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',

  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  SESSION_REVOKE: 'session:revoke',
  AUDIT_VIEW: 'audit:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: 'See the dashboard and stock summary',
  [PERMISSIONS.PRODUCT_VIEW]: 'Browse and search products',
  [PERMISSIONS.PRODUCT_CREATE]: 'Add new products to the catalogue',
  [PERMISSIONS.PRODUCT_UPDATE]: 'Edit product details',
  [PERMISSIONS.PRODUCT_DEACTIVATE]: 'Deactivate products',
  [PERMISSIONS.INVENTORY_VIEW]: 'See current stock levels',
  [PERMISSIONS.INVENTORY_ADD]: 'Add stock',
  [PERMISSIONS.INVENTORY_REMOVE]: 'Remove stock',
  [PERMISSIONS.INVENTORY_ADJUST]: 'Record stock corrections',
  [PERMISSIONS.INVENTORY_HISTORY_VIEW]: 'See stock history',
  [PERMISSIONS.SUPPLIER_VIEW]: 'See suppliers',
  [PERMISSIONS.SUPPLIER_MANAGE]: 'Add and edit suppliers',
  [PERMISSIONS.LOCATION_VIEW]: 'See locations',
  [PERMISSIONS.LOCATION_MANAGE]: 'Add and edit locations',
  [PERMISSIONS.REPORT_VIEW]: 'See reports',
  [PERMISSIONS.REPORT_EXPORT]: 'Export reports to CSV',
  [PERMISSIONS.USER_VIEW]: 'See the user list',
  [PERMISSIONS.USER_MANAGE]: 'Create, disable and edit users',
  [PERMISSIONS.ROLE_MANAGE]: 'Change what roles users hold',
  [PERMISSIONS.SESSION_REVOKE]: 'Sign other users out',
  [PERMISSIONS.AUDIT_VIEW]: 'Read the audit log',
};

export const ROLE_KEYS = ['ADMIN', 'INVENTORY_MANAGER', 'STAFF'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const ALL = Object.values(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  ADMIN: ALL,
  INVENTORY_MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.PRODUCT_DEACTIVATE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADD,
    PERMISSIONS.INVENTORY_REMOVE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.SUPPLIER_MANAGE,
    PERMISSIONS.LOCATION_VIEW,
    PERMISSIONS.LOCATION_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  ],
  STAFF: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADD,
    PERMISSIONS.INVENTORY_REMOVE,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.LOCATION_VIEW,
  ],
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, { name: string; description: string }> = {
  ADMIN: { name: 'Administrator', description: 'Full access, including users and settings' },
  INVENTORY_MANAGER: {
    name: 'Inventory manager',
    description: 'Manages the catalogue, stock, suppliers and reports',
  },
  STAFF: { name: 'Staff', description: 'Day-to-day stock operations and lookups' },
};

/**
 * Resolves an effective permission set: role grants, then per-user overrides.
 * An explicit deny always wins over a role grant.
 */
export function resolvePermissions(
  roleKey: RoleKey,
  overrides: ReadonlyArray<{ key: string; granted: boolean }> = [],
): Set<string> {
  const effective = new Set<string>(ROLE_PERMISSIONS[roleKey]);
  for (const override of overrides) {
    if (override.granted) effective.add(override.key);
    else effective.delete(override.key);
  }
  return effective;
}
