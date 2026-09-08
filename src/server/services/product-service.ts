import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { brands, categories, products, stockLevels, suppliers } from '@/server/db/schema';
import { conflict, notFound } from '@/lib/errors';
import { recordAudit } from './audit-service';
import type { ProductInput, ProductUpdateInput } from '@/server/validation/product-schemas';

/**
 * Catalogue reads and writes.
 *
 * Every list query is paginated and executed in the database. The browser never
 * receives the whole catalogue, and stock totals are aggregated in SQL rather
 * than by loading rows and reducing them in JavaScript.
 */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export const SORTABLE_FIELDS = ['name', 'sku', 'stock', 'minimumStock', 'createdAt', 'updatedAt'] as const;
export type SortField = (typeof SORTABLE_FIELDS)[number];

export interface ProductListQuery {
  search?: string;
  status?: StockStatus | 'ALL';
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  locationId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: SortField;
  sortDir?: 'asc' | 'desc';
}

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  model: string | null;
  unit: string;
  minimumStock: number;
  maximumStock: number | null;
  isActive: boolean;
  brandName: string | null;
  categoryName: string;
  supplierName: string | null;
  stock: number;
  status: StockStatus;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Total stock per product, scoped to a location when one is chosen. Defined
 * once and reused by the list, dashboard and report queries so "stock" means
 * the same thing everywhere.
 */
function stockSubquery(locationId?: string) {
  return db
    .select({
      productId: stockLevels.productId,
      stock: sql<number>`sum(${stockLevels.quantity})::int`.as('stock'),
    })
    .from(stockLevels)
    .where(locationId ? eq(stockLevels.locationId, locationId) : undefined)
    .groupBy(stockLevels.productId)
    .as('stock_totals');
}

export function deriveStatus(stock: number, minimumStock: number): StockStatus {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minimumStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export async function listProducts(query: ProductListQuery = {}): Promise<Paginated<ProductListItem>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const totals = stockSubquery(query.locationId);
  const stockExpr = sql<number>`coalesce(${totals.stock}, 0)`;

  const filters: SQL[] = [];

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    const searchFilter = or(
      ilike(products.name, term),
      ilike(products.sku, term),
      ilike(products.barcode, term),
      ilike(products.model, term),
      ilike(products.partNumber, term),
      ilike(products.manufacturerPartNumber, term),
      ilike(brands.name, term),
      ilike(categories.name, term),
    );
    if (searchFilter) filters.push(searchFilter);
  }

  if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));
  if (query.brandId) filters.push(eq(products.brandId, query.brandId));
  if (query.supplierId) filters.push(eq(products.supplierId, query.supplierId));
  if (typeof query.isActive === 'boolean') filters.push(eq(products.isActive, query.isActive));

  if (query.status && query.status !== 'ALL') {
    if (query.status === 'OUT_OF_STOCK') {
      filters.push(sql`${stockExpr} <= 0`);
    } else if (query.status === 'LOW_STOCK') {
      filters.push(sql`${stockExpr} > 0 AND ${stockExpr} <= ${products.minimumStock}`);
    } else {
      filters.push(sql`${stockExpr} > ${products.minimumStock}`);
    }
  }

  const where = filters.length ? and(...filters) : undefined;

  const sortColumn = {
    name: products.name,
    sku: products.sku,
    stock: stockExpr,
    minimumStock: products.minimumStock,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  }[query.sortBy ?? 'name'];

  const direction = query.sortDir === 'desc' ? desc : asc;

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      barcode: products.barcode,
      name: products.name,
      model: products.model,
      unit: products.unit,
      minimumStock: products.minimumStock,
      maximumStock: products.maximumStock,
      isActive: products.isActive,
      brandName: brands.name,
      categoryName: categories.name,
      supplierName: suppliers.name,
      stock: sql<number>`coalesce(${totals.stock}, 0)::int`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(totals, eq(totals.productId, products.id))
    .where(where)
    .orderBy(direction(sortColumn), asc(products.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRows = await db
    .select({ value: count() })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(totals, eq(totals.productId, products.id))
    .where(where);

  const total = totalRows[0]?.value ?? 0;

  return {
    items: rows.map((row) => ({
      ...row,
      status: deriveStatus(row.stock, row.minimumStock),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getProductById(id: string) {
  const rows = await db
    .select({
      product: products,
      brandName: brands.name,
      categoryName: categories.name,
      supplierName: suppliers.name,
      supplierId: suppliers.id,
      stock: sql<number>`coalesce((
        select sum(sl.quantity)::int from stock_levels sl where sl.product_id = ${products.id}
      ), 0)`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(eq(products.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row.product,
    brandName: row.brandName,
    categoryName: row.categoryName,
    supplierName: row.supplierName,
    stock: row.stock,
    status: deriveStatus(row.stock, row.product.minimumStock),
  };
}

/** Typeahead source for the quick-search bar. Deliberately capped. */
export async function quickSearch(term: string, limit = 8) {
  if (!term.trim()) return [];
  const pattern = `%${term.trim()}%`;
  const totals = stockSubquery();

  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      minimumStock: products.minimumStock,
      stock: sql<number>`coalesce(${totals.stock}, 0)::int`,
    })
    .from(products)
    .leftJoin(totals, eq(totals.productId, products.id))
    .where(
      and(
        eq(products.isActive, true),
        or(
          ilike(products.name, pattern),
          ilike(products.sku, pattern),
          ilike(products.barcode, pattern),
          ilike(products.partNumber, pattern),
        ),
      ),
    )
    .orderBy(asc(products.name))
    .limit(Math.min(20, limit));
}

async function assertReferencesExist(input: { categoryId: string; brandId?: string | null; supplierId?: string | null }) {
  const categoryRows = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!categoryRows[0]) throw notFound('That category does not exist.');

  if (input.brandId) {
    const rows = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!rows[0]) throw notFound('That brand does not exist.');
  }
  if (input.supplierId) {
    const rows = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!rows[0]) throw notFound('That supplier does not exist.');
  }
}

export async function createProduct(input: ProductInput, actor: { id: string; email: string }) {
  await assertReferencesExist(input);

  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, input.sku))
    .limit(1);
  if (existing[0]) throw conflict(`SKU ${input.sku} is already used by another product.`);

  if (input.barcode) {
    const dupe = await db.select({ id: products.id }).from(products).where(eq(products.barcode, input.barcode)).limit(1);
    if (dupe[0]) throw conflict(`Barcode ${input.barcode} is already used by another product.`);
  }

  const inserted = await db
    .insert(products)
    .values({
      ...input,
      barcode: input.barcode || null,
      createdById: actor.id,
      updatedById: actor.id,
    })
    .returning();

  const product = inserted[0];
  if (!product) throw conflict('The product could not be created.');

  await recordAudit({
    action: 'PRODUCT_CREATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'product',
    entityId: product.id,
    summary: `Created product ${product.sku} — ${product.name}`,
  });

  return product;
}

export async function updateProduct(id: string, input: ProductUpdateInput, actor: { id: string; email: string }) {
  const current = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const existing = current[0];
  if (!existing) throw notFound('That product no longer exists.');

  if (input.categoryId || input.brandId || input.supplierId) {
    await assertReferencesExist({
      categoryId: input.categoryId ?? existing.categoryId,
      brandId: input.brandId,
      supplierId: input.supplierId,
    });
  }

  if (input.sku && input.sku !== existing.sku) {
    const dupe = await db.select({ id: products.id }).from(products).where(eq(products.sku, input.sku)).limit(1);
    if (dupe[0]) throw conflict(`SKU ${input.sku} is already used by another product.`);
  }

  if (input.barcode && input.barcode !== existing.barcode) {
    const dupe = await db.select({ id: products.id }).from(products).where(eq(products.barcode, input.barcode)).limit(1);
    if (dupe[0]) throw conflict(`Barcode ${input.barcode} is already used by another product.`);
  }

  const updated = await db
    .update(products)
    .set({ ...input, barcode: input.barcode === '' ? null : input.barcode, updatedById: actor.id })
    .where(eq(products.id, id))
    .returning();

  const product = updated[0];
  if (!product) throw notFound('That product no longer exists.');

  await recordAudit({
    action: input.isActive === false ? 'PRODUCT_DEACTIVATED' : 'PRODUCT_UPDATED',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'product',
    entityId: product.id,
    summary:
      input.isActive === false
        ? `Deactivated product ${product.sku}`
        : `Updated product ${product.sku} — ${product.name}`,
    metadata: { fields: Object.keys(input) },
  });

  return product;
}

/** Reference data for the product form and filter bar. */
export async function getCatalogueOptions() {
  const [categoryRows, brandRows, supplierRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.name)),
    db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)),
  ]);
  return { categories: categoryRows, brands: brandRows, suppliers: supplierRows };
}

export async function getProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(products).where(inArray(products.id, ids));
}
