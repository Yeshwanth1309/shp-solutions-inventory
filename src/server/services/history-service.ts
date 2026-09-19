import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { customers, locations, products, stockTransactions, suppliers, users } from '@/server/db/schema';
import type { HistoryQueryInput } from '@/server/validation/inventory-schemas';
import type { Paginated } from './product-service';

export interface HistoryRow {
  id: string;
  createdAt: Date;
  productId: string;
  productName: string;
  sku: string;
  type: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  notes: string | null;
  performedByName: string | null;
  performedByEmail: string | null;
  locationName: string;
  /** Which supplier this batch came from — set on IN movements only, when recorded. */
  supplierName: string | null;
  /** Which customer this went to — set on OUT movements only, when recorded. */
  customerName: string | null;
}

/**
 * Reads the stock ledger. The table is append-only (enforced by a database
 * trigger), so this is a pure read path — corrections appear as their own
 * ADJUSTMENT rows rather than as edits to earlier ones.
 */
export async function listHistory(query: Partial<HistoryQueryInput> = {}): Promise<Paginated<HistoryRow>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  const filters: SQL[] = [];
  if (query.productId) filters.push(eq(stockTransactions.productId, query.productId));
  if (query.sku) filters.push(ilike(products.sku, `%${query.sku}%`));
  if (query.type) filters.push(eq(stockTransactions.type, query.type));
  if (query.performedById) filters.push(eq(stockTransactions.performedById, query.performedById));
  if (query.supplierId) filters.push(eq(stockTransactions.supplierId, query.supplierId));
  if (query.customerId) filters.push(eq(stockTransactions.customerId, query.customerId));
  if (query.locationId) filters.push(eq(stockTransactions.locationId, query.locationId));
  if (query.reason) filters.push(ilike(stockTransactions.reason, `%${query.reason}%`));
  if (query.from) filters.push(gte(stockTransactions.createdAt, query.from));
  if (query.to) filters.push(lte(stockTransactions.createdAt, query.to));

  const where = filters.length ? and(...filters) : undefined;
  const direction = query.sortDir === 'asc' ? asc : desc;

  const rows = await db
    .select({
      id: stockTransactions.id,
      createdAt: stockTransactions.createdAt,
      productId: stockTransactions.productId,
      productName: products.name,
      sku: products.sku,
      type: stockTransactions.type,
      direction: stockTransactions.direction,
      quantity: stockTransactions.quantity,
      previousStock: stockTransactions.previousStock,
      newStock: stockTransactions.newStock,
      reason: stockTransactions.reason,
      notes: stockTransactions.notes,
      performedByName: users.name,
      performedByEmail: users.email,
      locationName: locations.name,
      supplierName: suppliers.name,
      customerName: customers.name,
    })
    .from(stockTransactions)
    .innerJoin(products, eq(products.id, stockTransactions.productId))
    .innerJoin(locations, eq(locations.id, stockTransactions.locationId))
    .leftJoin(users, eq(users.id, stockTransactions.performedById))
    .leftJoin(suppliers, eq(suppliers.id, stockTransactions.supplierId))
    .leftJoin(customers, eq(customers.id, stockTransactions.customerId))
    .where(where)
    .orderBy(direction(stockTransactions.createdAt), direction(stockTransactions.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRows = await db
    .select({ value: count() })
    .from(stockTransactions)
    .innerJoin(products, eq(products.id, stockTransactions.productId))
    .where(where);

  const total = totalRows[0]?.value ?? 0;

  return {
    items: rows as HistoryRow[],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Distinct users who have recorded movements — populates the history filter. */
export async function getHistoryActors() {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(stockTransactions)
    .innerJoin(users, eq(users.id, stockTransactions.performedById))
    .orderBy(users.name);
}

/**
 * Full inbound/outbound movement history for a single product — "where it
 * came from, where it went" (section requested explicitly). Reuses
 * listHistory scoped to one product; kept as a thin named wrapper so the
 * product detail page's intent is clear at the call site.
 */
export async function getProductMovementHistory(productId: string, limit = 20) {
  const page = await listHistory({ productId, pageSize: limit, sortDir: 'desc' });
  return page.items;
}
