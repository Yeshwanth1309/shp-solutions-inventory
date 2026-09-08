import { and, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { stockTransactions } from '@/server/db/schema';
import { getAttentionList, getDashboardStats } from './dashboard-service';
import { listProducts } from './product-service';

/**
 * Reports read the same live tables as everything else; there is no separate
 * reporting store and no precomputed figures.
 */

export interface InventorySummaryReport {
  generatedAt: string;
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
  inactiveProducts: number;
}

export async function getInventorySummary(locationId?: string): Promise<InventorySummaryReport> {
  const stats = await getDashboardStats(locationId);
  return { generatedAt: new Date().toISOString(), ...stats };
}

export interface StockMovementReport {
  from: string | null;
  to: string | null;
  unitsAdded: number;
  unitsRemoved: number;
  netMovement: number;
  transactionCount: number;
  byType: Array<{ type: string; transactions: number; units: number }>;
}

export async function getStockMovement(range: { from?: Date; to?: Date } = {}): Promise<StockMovementReport> {
  const filters: SQL[] = [];
  if (range.from) filters.push(gte(stockTransactions.createdAt, range.from));
  if (range.to) filters.push(lte(stockTransactions.createdAt, range.to));
  const where = filters.length ? and(...filters) : undefined;

  const totalsRows = await db
    .select({
      unitsAdded: sql<number>`coalesce(sum(${stockTransactions.quantity}) filter (where ${stockTransactions.direction} = 'IN'), 0)::int`,
      unitsRemoved: sql<number>`coalesce(sum(${stockTransactions.quantity}) filter (where ${stockTransactions.direction} = 'OUT'), 0)::int`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(stockTransactions)
    .where(where);

  const byType = await db
    .select({
      type: stockTransactions.type,
      transactions: sql<number>`count(*)::int`,
      units: sql<number>`coalesce(sum(${stockTransactions.quantity}), 0)::int`,
    })
    .from(stockTransactions)
    .where(where)
    .groupBy(stockTransactions.type)
    .orderBy(stockTransactions.type);

  const totals = totalsRows[0] ?? { unitsAdded: 0, unitsRemoved: 0, transactionCount: 0 };

  return {
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    unitsAdded: totals.unitsAdded,
    unitsRemoved: totals.unitsRemoved,
    netMovement: totals.unitsAdded - totals.unitsRemoved,
    transactionCount: totals.transactionCount,
    byType,
  };
}

export async function getLowStockReport() {
  return getAttentionList('LOW_STOCK', 500);
}

export async function getOutOfStockReport() {
  return getAttentionList('OUT_OF_STOCK', 500);
}

/** RFC 4180-ish escaping, with a guard against spreadsheet formula injection. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

export const INVENTORY_CSV_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Product' },
  { key: 'brandName', label: 'Brand' },
  { key: 'categoryName', label: 'Category' },
  { key: 'supplierName', label: 'Supplier' },
  { key: 'stock', label: 'Stock' },
  { key: 'minimumStock', label: 'Minimum stock' },
  { key: 'status', label: 'Status' },
  { key: 'unit', label: 'Unit' },
];

/**
 * Full inventory export. Paged internally so a large catalogue does not have to
 * be materialised in one query.
 */
export async function buildInventoryCsv(filters: Parameters<typeof listProducts>[0] = {}): Promise<string> {
  const pageSize = 500;
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  let pageCount = 1;

  do {
    const result = await listProducts({ ...filters, page, pageSize });
    rows.push(...(result.items as unknown as Array<Record<string, unknown>>));
    pageCount = result.pageCount;
    page += 1;
  } while (page <= pageCount && page <= 200);

  return toCsv(rows, INVENTORY_CSV_COLUMNS);
}
