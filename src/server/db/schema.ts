/**
 * SHP Solutions — database schema (PostgreSQL via Drizzle ORM).
 *
 * Design notes:
 *  - Stock is never stored as a bare editable number. `stock_levels` holds the
 *    current quantity, but it may only be mutated inside the same SQL
 *    transaction that appends an immutable `stock_transactions` row.
 *  - A CHECK constraint on `stock_levels.quantity >= 0` is the last line of
 *    defence against negative inventory, below the service-layer guard.
 *  - `stock_transactions.request_id` is UNIQUE, which makes stock mutations
 *    idempotent: a retried request collides and returns the original result.
 *
 * See DATABASE.md for the narrative version.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

const id = () => text('id').primaryKey().$defaultFn(createId);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleKeyEnum = pgEnum('role_key', ['ADMIN', 'INVENTORY_MANAGER', 'STAFF']);

export const stockTransactionTypeEnum = pgEnum('stock_transaction_type', [
  'ADD',
  'REMOVE',
  'ADJUSTMENT',
  'RETURN',
  'DAMAGE',
  'PURCHASE',
  'SALE',
]);

export const stockDirectionEnum = pgEnum('stock_direction', ['IN', 'OUT']);

export const productUnitEnum = pgEnum('product_unit', [
  'PIECE',
  'BOX',
  'PACK',
  'SET',
  'REAM',
  'BOTTLE',
  'KIT',
  'METRE',
]);

export const printerTypeEnum = pgEnum('printer_type', [
  'LASER',
  'INKJET',
  'MULTIFUNCTION',
  'DOT_MATRIX',
  'PHOTO',
  'THERMAL',
]);

export const colorTypeEnum = pgEnum('color_type', [
  'MONO',
  'COLOUR',
  'BLACK',
  'CYAN',
  'MAGENTA',
  'YELLOW',
  'TRICOLOUR',
]);

export const consumableTypeEnum = pgEnum('consumable_type', [
  'TONER_CARTRIDGE',
  'INK_CARTRIDGE',
  'INK_BOTTLE',
  'DRUM_UNIT',
  'WASTE_TONER',
  'PRINT_HEAD',
  'MAINTENANCE_KIT',
  'FUSER',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'SESSION_REVOKED',
  'MFA_ENROLLED',
  'MFA_REMOVED',
  'MFA_RECOVERY_USED',
  'PASSWORD_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DISABLED',
  'USER_ENABLED',
  'ROLE_CHANGED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DEACTIVATED',
  'STOCK_ADDED',
  'STOCK_REMOVED',
  'STOCK_ADJUSTED',
  'SUPPLIER_CREATED',
  'SUPPLIER_UPDATED',
  'LOCATION_CREATED',
  'LOCATION_UPDATED',
  'SETTINGS_CHANGED',
]);

// ---------------------------------------------------------------------------
// Identity and access control
// ---------------------------------------------------------------------------

export const permissions = pgTable('permissions', {
  id: id(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
  createdAt: createdAt(),
});

export const roles = pgTable('roles', {
  id: id(),
  key: roleKeyEnum('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_permissions_permission_idx').on(t.permissionId),
  ],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').notNull().default(true),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    index('users_role_idx').on(t.roleId),
    index('users_active_idx').on(t.isActive),
    check('users_failed_attempts_non_negative', sql`${t.failedLoginAttempts} >= 0`),
  ],
);

/** Per-user grant/deny layered on top of the role. Mainly used to tune STAFF. */
export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    granted: boolean('granted').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permissionId] }),
    index('user_permissions_permission_idx').on(t.permissionId),
  ],
);

/**
 * Server-side session. The cookie carries an opaque 32-byte random token;
 * only its SHA-256 hash is persisted, so a database leak yields no usable
 * sessions.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAt(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

/** TOTP secret, encrypted at the application layer with AES-256-GCM. */
export const mfaCredentials = pgTable('mfa_credentials', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretCiphertext: text('secret_ciphertext').notNull(),
  secretIv: text('secret_iv').notNull(),
  secretAuthTag: text('secret_auth_tag').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('mfa_recovery_codes_user_idx').on(t.userId)],
);

/** Fixed-window counters backing the rate limiter. */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    id: id(),
    bucket: text('bucket').notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('rate_limit_bucket_window_idx').on(t.bucket, t.windowEnd),
    index('rate_limit_window_idx').on(t.windowEnd),
  ],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const categories = pgTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    parentId: text('parent_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('categories_parent_idx').on(t.parentId)],
);

export const brands = pgTable('brands', {
  id: id(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const suppliers = pgTable('suppliers', {
  id: id(),
  name: text('name').notNull().unique(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locations = pgTable('locations', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text('sku').notNull().unique(),
    barcode: text('barcode').unique(),
    name: text('name').notNull(),
    model: text('model'),
    description: text('description'),
    unit: productUnitEnum('unit').notNull().default('PIECE'),
    minimumStock: integer('minimum_stock').notNull().default(0),
    maximumStock: integer('maximum_stock'),
    isActive: boolean('is_active').notNull().default(true),

    brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    // Printer-domain attributes. All optional — a ream of A4 paper has none.
    printerType: printerTypeEnum('printer_type'),
    colorType: colorTypeEnum('color_type'),
    consumableType: consumableTypeEnum('consumable_type'),
    compatibility: text('compatibility').array().notNull().default(sql`ARRAY[]::text[]`),
    partNumber: text('part_number'),
    manufacturerPartNumber: text('manufacturer_part_number'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('products_category_idx').on(t.categoryId),
    index('products_brand_idx').on(t.brandId),
    index('products_supplier_idx').on(t.supplierId),
    index('products_active_idx').on(t.isActive),
    index('products_name_idx').on(t.name),
    index('products_part_number_idx').on(t.partNumber),
    index('products_model_idx').on(t.model),
    check('products_minimum_stock_non_negative', sql`${t.minimumStock} >= 0`),
    check(
      'products_maximum_stock_valid',
      sql`${t.maximumStock} IS NULL OR ${t.maximumStock} >= ${t.minimumStock}`,
    ),
    check('products_sku_not_blank', sql`length(btrim(${t.sku})) > 0`),
    check('products_name_not_blank', sql`length(btrim(${t.name})) > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/**
 * Current quantity of one product at one location. Mutated only inside the
 * transaction that appends the matching stock_transactions row.
 */
export const stockLevels = pgTable(
  'stock_levels',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('stock_levels_product_location_idx').on(t.productId, t.locationId),
    index('stock_levels_location_idx').on(t.locationId),
    index('stock_levels_quantity_idx').on(t.quantity),
    check('stock_levels_quantity_non_negative', sql`${t.quantity} >= 0`),
  ],
);

/** Immutable ledger. Nothing overwrites history; corrections append. */
export const stockTransactions = pgTable(
  'stock_transactions',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    type: stockTransactionTypeEnum('type').notNull(),
    direction: stockDirectionEnum('direction').notNull(),
    quantity: integer('quantity').notNull(),
    previousStock: integer('previous_stock').notNull(),
    newStock: integer('new_stock').notNull(),
    reason: text('reason').notNull(),
    notes: text('notes'),
    performedById: text('performed_by_id').references(() => users.id, { onDelete: 'set null' }),
    requestId: text('request_id').notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_transactions_product_created_idx').on(t.productId, t.createdAt),
    index('stock_transactions_created_idx').on(t.createdAt),
    index('stock_transactions_location_idx').on(t.locationId),
    index('stock_transactions_performed_by_idx').on(t.performedById),
    index('stock_transactions_type_idx').on(t.type),
    check('stock_transactions_quantity_positive', sql`${t.quantity} > 0`),
    check('stock_transactions_previous_non_negative', sql`${t.previousStock} >= 0`),
    check('stock_transactions_new_non_negative', sql`${t.newStock} >= 0`),
    check(
      'stock_transactions_arithmetic',
      sql`(${t.direction} = 'IN' AND ${t.newStock} = ${t.previousStock} + ${t.quantity})
          OR (${t.direction} = 'OUT' AND ${t.newStock} = ${t.previousStock} - ${t.quantity})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    action: auditActionEnum('action').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userPermissions: many(userPermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  sessions: many(sessions),
  userPermissions: many(userPermissions),
  mfaCredential: one(mfaCredentials, {
    fields: [users.id],
    references: [mfaCredentials.userId],
  }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
  permission: one(permissions, {
    fields: [userPermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const mfaCredentialsRelations = relations(mfaCredentials, ({ one }) => ({
  user: one(users, { fields: [mfaCredentials.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_tree',
  }),
  children: many(categories, { relationName: 'category_tree' }),
  products: many(products),
}));

export const brandsRelations = relations(brands, ({ many }) => ({ products: many(products) }));
export const suppliersRelations = relations(suppliers, ({ many }) => ({ products: many(products) }));
export const locationsRelations = relations(locations, ({ many }) => ({
  stockLevels: many(stockLevels),
  transactions: many(stockTransactions),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  stockLevels: many(stockLevels),
  transactions: many(stockTransactions),
}));

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  product: one(products, { fields: [stockLevels.productId], references: [products.id] }),
  location: one(locations, { fields: [stockLevels.locationId], references: [locations.id] }),
}));

export const stockTransactionsRelations = relations(stockTransactions, ({ one }) => ({
  product: one(products, { fields: [stockTransactions.productId], references: [products.id] }),
  location: one(locations, { fields: [stockTransactions.locationId], references: [locations.id] }),
  performedBy: one(users, { fields: [stockTransactions.performedById], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type StockLevel = typeof stockLevels.$inferSelect;
export type StockTransaction = typeof stockTransactions.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
