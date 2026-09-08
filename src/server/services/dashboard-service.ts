import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { brands, locations, products, stockLevels, stockTransactions, suppliers, users } from '@/server/db/schema';

/**
 * Dashboard aggregates.
 *
 * Every figure below is computed by the database from live rows. Nothing here
 * is cached, estimated or hard-coded; the same expressions define "low stock"
 * as the products list and the reports do.
 */

export interface DashboardStats {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
  inactiveProducts: number;
}

/** coalesce(sum(stock_levels.quantity), 0) per product, as a scalar subquery. */
const STOCK_EXPR = sql<number>`coalesce((
  select sum(sl.quantity) from stock_levels sl where sl.product_id = products.id
), 0)`;

export async function getDashboardStats(locationId?: string): Promise<DashboardStats> {
  const stockExpr = locationId
    ? sql<number>`coalesce((
        select sum(sl.quantity) from stock_levels sl
        where sl.product_id = products.id and sl.location_id = ${locationId}
      ), 0)`
    : STOCK_EXPR;

  const rows = await db
    .select({
      totalProducts: sql<number>`count(*) filter (where ${products.isActive})::int`,
      inactiveProducts: sql<number>`count(*) filter (where not ${products.isActive})::int`,
      inStock: sql<number>`count(*) filter (where ${products.isActive} and ${stockExpr} > ${products.minimumStock})::int`,
      lowStock: sql<number>`count(*) filter (where ${products.isActive} and ${stockExpr} > 0 and ${stockExpr} <= ${products.minimumStock})::int`,
      outOfStock: sql<number>`count(*) filter (where ${products.isActive} and ${stockExpr} <= 0)::int`,
      totalUnits: sql<number>`coalesce(sum(${stockExpr}) filter (where ${products.isActive}), 0)::int`,
    })
    .from(products);

  return (
    rows[0] ?? {
      totalProducts: 0,
      inactiveProducts: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      totalUnits: 0,
    }
  );
}

export interface AttentionItem {
  id: string;
  sku: string;
  name: string;
  stock: number;
  minimumStock: number;
  unit: string;
  brandName: string | null;
  supplierName: string | null;
  locationName: string | null;
}

/**
 * Products at or below their minimum, or fully out. `mode` decides which.
 * Ordered by how far below the line they are, so the most urgent sits on top.
 */
export async function getAttentionList(
  mode: 'LOW_STOCK' | 'OUT_OF_STOCK',
  limit = 50,
): Promise<AttentionItem[]> {
  const condition =
    mode === 'OUT_OF_STOCK'
      ? sql`${STOCK_EXPR} <= 0`
      : sql`${STOCK_EXPR} > 0 and ${STOCK_EXPR} <= ${products.minimumStock}`;

  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      stock: sql<number>`${STOCK_EXPR}::int`,
      minimumStock: products.minimumStock,
      unit: products.unit,
      brandName: brands.name,
      supplierName: suppliers.name,
      locationName: sql<string | null>`(
        select l.name from stock_levels sl
        join locations l on l.id = sl.location_id
        where sl.product_id = products.id
        order by sl.quantity desc limit 1
      )`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(and(eq(products.isActive, true), condition))
    .orderBy(sql`(${products.minimumStock} - ${STOCK_EXPR}) desc`, products.name)
    .limit(limit);
}

/** Most recent movements, for the dashboard activity strip. */
export async function getRecentActivity(limit = 8) {
  return db
    .select({
      id: stockTransactions.id,
      type: stockTransactions.type,
      direction: stockTransactions.direction,
      quantity: stockTransactions.quantity,
      newStock: stockTransactions.newStock,
      createdAt: stockTransactions.createdAt,
      reason: stockTransactions.reason,
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      performedByName: users.name,
      locationName: locations.name,
    })
    .from(stockTransactions)
    .innerJoin(products, eq(products.id, stockTransactions.productId))
    .innerJoin(locations, eq(locations.id, stockTransactions.locationId))
    .leftJoin(users, eq(users.id, stockTransactions.performedById))
    .orderBy(desc(stockTransactions.createdAt))
    .limit(limit);
}

/** True while the catalogue is empty — drives the first-run empty state. */
export async function isCatalogueEmpty(): Promise<boolean> {
  const rows = await db.select({ id: products.id }).from(products).limit(1);
  return rows.length === 0;
}

export async function getLocationSummary() {
  return db
    .select({
      id: locations.id,
      code: locations.code,
      name: locations.name,
      isDefault: locations.isDefault,
      units: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::int`,
      products: sql<number>`count(distinct ${stockLevels.productId}) filter (where ${stockLevels.quantity} > 0)::int`,
    })
    .from(locations)
    .leftJoin(stockLevels, eq(stockLevels.locationId, locations.id))
    .where(eq(locations.isActive, true))
    .groupBy(locations.id, locations.code, locations.name, locations.isDefault)
    .orderBy(locations.name);
}
