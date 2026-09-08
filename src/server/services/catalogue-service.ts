import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { brands, categories, locations, products, suppliers } from '@/server/db/schema';
import { conflict, notFound } from '@/lib/errors';
import { recordAudit } from './audit-service';
import type { BrandInput, CategoryInput, LocationInput, SupplierInput } from '@/server/validation/catalogue-schemas';

type Actor = { id: string; email: string };

// --- Suppliers -------------------------------------------------------------

export async function listSuppliers(includeInactive = true) {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactPerson: suppliers.contactPerson,
      phone: suppliers.phone,
      email: suppliers.email,
      address: suppliers.address,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      productCount: sql<number>`(select count(*) from products p where p.supplier_id = suppliers.id)::int`,
    })
    .from(suppliers)
    .where(includeInactive ? undefined : eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.name));
}

export async function createSupplier(input: SupplierInput, actor: Actor) {
  const existing = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, input.name)).limit(1);
  if (existing[0]) throw conflict('A supplier with that name already exists.');

  const inserted = await db
    .insert(suppliers)
    .values({ ...input, email: input.email || null })
    .returning();
  const supplier = inserted[0];
  if (!supplier) throw conflict('The supplier could not be created.');

  await recordAudit({
    action: 'SUPPLIER_CREATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'supplier',
    entityId: supplier.id,
    summary: `Added supplier ${supplier.name}`,
  });
  return supplier;
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>, actor: Actor) {
  const updated = await db
    .update(suppliers)
    .set({ ...input, email: input.email === '' ? null : input.email })
    .where(eq(suppliers.id, id))
    .returning();
  const supplier = updated[0];
  if (!supplier) throw notFound('That supplier no longer exists.');

  await recordAudit({
    action: 'SUPPLIER_UPDATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'supplier',
    entityId: id,
    summary: `Updated supplier ${supplier.name}`,
  });
  return supplier;
}

// --- Locations -------------------------------------------------------------

export async function listLocations(includeInactive = true) {
  return db
    .select()
    .from(locations)
    .where(includeInactive ? undefined : eq(locations.isActive, true))
    .orderBy(asc(locations.name));
}

/**
 * Creating a location that claims the default flag clears it elsewhere first,
 * because a partial unique index permits only one default row.
 */
export async function createLocation(input: LocationInput, actor: Actor) {
  const existing = await db.select({ id: locations.id }).from(locations).where(eq(locations.code, input.code)).limit(1);
  if (existing[0]) throw conflict(`Location code ${input.code} is already in use.`);

  const location = await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(locations).set({ isDefault: false }).where(eq(locations.isDefault, true));
    }
    const inserted = await tx.insert(locations).values(input).returning();
    return inserted[0];
  });

  if (!location) throw conflict('The location could not be created.');

  await recordAudit({
    action: 'LOCATION_CREATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'location',
    entityId: location.id,
    summary: `Added location ${location.code} — ${location.name}`,
  });
  return location;
}

export async function updateLocation(id: string, input: Partial<LocationInput>, actor: Actor) {
  const location = await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(locations).set({ isDefault: false }).where(eq(locations.isDefault, true));
    }
    const updated = await tx.update(locations).set(input).where(eq(locations.id, id)).returning();
    return updated[0];
  });

  if (!location) throw notFound('That location no longer exists.');

  await recordAudit({
    action: 'LOCATION_UPDATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'location',
    entityId: id,
    summary: `Updated location ${location.code}`,
  });
  return location;
}

// --- Categories and brands -------------------------------------------------

export async function listCategories() {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      isActive: categories.isActive,
      productCount: sql<number>`(select count(*) from products p where p.category_id = categories.id)::int`,
    })
    .from(categories)
    .orderBy(asc(categories.name));
}

export async function createCategory(input: CategoryInput) {
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, input.slug)).limit(1);
  if (existing[0]) throw conflict('A category with that slug already exists.');
  const inserted = await db.insert(categories).values(input).returning();
  return inserted[0];
}

export async function listBrands() {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      isActive: brands.isActive,
      productCount: sql<number>`(select count(*) from products p where p.brand_id = brands.id)::int`,
    })
    .from(brands)
    .orderBy(asc(brands.name));
}

export async function createBrand(input: BrandInput) {
  const existing = await db.select({ id: brands.id }).from(brands).where(eq(brands.name, input.name)).limit(1);
  if (existing[0]) throw conflict('That brand already exists.');
  const inserted = await db.insert(brands).values(input).returning();
  return inserted[0];
}

/** Used by the first-run banner to tell the user what still needs setting up. */
export async function getSetupState() {
  const [categoryRows, locationRows, productRows] = await Promise.all([
    db.select({ id: categories.id }).from(categories).limit(1),
    db.select({ id: locations.id }).from(locations).where(eq(locations.isDefault, true)).limit(1),
    db.select({ id: products.id }).from(products).limit(1),
  ]);
  return {
    hasCategories: categoryRows.length > 0,
    hasDefaultLocation: locationRows.length > 0,
    hasProducts: productRows.length > 0,
  };
}
