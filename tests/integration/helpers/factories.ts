import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { brands, categories, locations, products, suppliers, users, roles } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/crypto';
import type { RoleKey } from '@/lib/permissions';

/**
 * Test fixtures.
 *
 * These live only under tests/ and are never imported by application code, so
 * they cannot reach development, staging or production. Nothing in the app
 * bundle references this file.
 */

let counter = 0;
const nextSuffix = () => `${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export async function createTestUser(
  overrides: { email?: string; name?: string; password?: string; roleKey?: RoleKey; isActive?: boolean } = {},
) {
  const roleKey = overrides.roleKey ?? 'ADMIN';
  const roleRows = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1);
  const role = roleRows[0];
  if (!role) throw new Error(`Role ${roleKey} missing — did resetDatabase() run?`);

  const password = overrides.password ?? 'TestPassword123';
  const inserted = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${nextSuffix()}@test.local`,
      name: overrides.name ?? 'Test User',
      passwordHash: await hashPassword(password),
      roleId: role.id,
      isActive: overrides.isActive ?? true,
    })
    .returning();

  const user = inserted[0];
  if (!user) throw new Error('Failed to create test user');
  return { ...user, plainPassword: password };
}

export async function createTestLocation(overrides: { code?: string; name?: string; isDefault?: boolean } = {}) {
  const inserted = await db
    .insert(locations)
    .values({
      code: overrides.code ?? `LOC${nextSuffix()}`.toUpperCase().slice(0, 20),
      name: overrides.name ?? 'Test Location',
      isDefault: overrides.isDefault ?? false,
    })
    .returning();
  const location = inserted[0];
  if (!location) throw new Error('Failed to create test location');
  return location;
}

export async function createTestCategory(name = 'Test Category') {
  const inserted = await db
    .insert(categories)
    .values({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nextSuffix()}` })
    .returning();
  const category = inserted[0];
  if (!category) throw new Error('Failed to create test category');
  return category;
}

export async function createTestBrand(name?: string) {
  const inserted = await db.insert(brands).values({ name: name ?? `Brand ${nextSuffix()}` }).returning();
  const brand = inserted[0];
  if (!brand) throw new Error('Failed to create test brand');
  return brand;
}

export async function createTestSupplier(name?: string) {
  const inserted = await db.insert(suppliers).values({ name: name ?? `Supplier ${nextSuffix()}` }).returning();
  const supplier = inserted[0];
  if (!supplier) throw new Error('Failed to create test supplier');
  return supplier;
}

export async function createTestProduct(
  overrides: { sku?: string; name?: string; minimumStock?: number; categoryId?: string; isActive?: boolean } = {},
) {
  const categoryId = overrides.categoryId ?? (await createTestCategory()).id;
  const inserted = await db
    .insert(products)
    .values({
      sku: overrides.sku ?? `SKU-${nextSuffix()}`.toUpperCase(),
      name: overrides.name ?? 'Test Product',
      minimumStock: overrides.minimumStock ?? 5,
      categoryId,
      isActive: overrides.isActive ?? true,
    })
    .returning();
  const product = inserted[0];
  if (!product) throw new Error('Failed to create test product');
  return product;
}

/** A minimal working world: default location, category, admin user, product. */
export async function createBaseWorld() {
  const location = await createTestLocation({ code: 'MAIN', name: 'Main store', isDefault: true });
  const category = await createTestCategory('Toners');
  const user = await createTestUser({ roleKey: 'ADMIN' });
  const product = await createTestProduct({ categoryId: category.id, minimumStock: 10 });
  return { location, category, user, product };
}

export const requestId = () => `req-${nextSuffix()}-${Math.random().toString(36).slice(2, 10)}`;
