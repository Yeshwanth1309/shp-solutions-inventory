import { and, eq, sql } from 'drizzle-orm';
import { db, type Transaction } from '@/server/db/client';
import {
  locations,
  products,
  stockLevels,
  stockTransactions,
  type StockTransaction,
} from '@/server/db/schema';
import { AppError, InsufficientStockError, notFound } from '@/lib/errors';
import { isPgErrorCode, PG_ERROR } from '@/lib/pg-error';
import { recordAudit } from './audit-service';

/**
 * The inventory engine.
 *
 * Three guarantees, in order of importance:
 *
 *  1. ATOMICITY — the stock level and its ledger row are written in one SQL
 *     transaction. There is no window in which one exists without the other.
 *
 *  2. NO NEGATIVE STOCK — a removal reads the current level with `FOR UPDATE`,
 *     which serialises concurrent writers on that row. Two simultaneous
 *     removals queue rather than interleave, so both cannot read the same
 *     "before" value. A CHECK constraint in the database backs this up.
 *
 *  3. IDEMPOTENCY — every mutation carries a caller-supplied `requestId`, which
 *     is UNIQUE on the ledger. A retried request loses the insert race and we
 *     return the transaction the first attempt committed, rather than moving
 *     stock twice.
 */

export type StockTransactionType =
  (typeof stockTransactions.type.enumValues)[number];

const DIRECTION: Record<StockTransactionType, 'IN' | 'OUT'> = {
  ADD: 'IN',
  PURCHASE: 'IN',
  RETURN: 'IN',
  REMOVE: 'OUT',
  SALE: 'OUT',
  DAMAGE: 'OUT',
  // ADJUSTMENT is resolved from the target quantity at call time.
  ADJUSTMENT: 'IN',
};

export const ADD_REASONS = [
  'Purchase',
  'Restock',
  'Customer Return',
  'Stock Correction',
  'Other',
] as const;

export const REMOVE_REASONS = [
  'Sale',
  'Damaged',
  'Returned to Supplier',
  'Stock Correction',
  'Other',
] as const;

export interface StockMutationInput {
  productId: string;
  locationId?: string;
  quantity: number;
  reason: string;
  notes?: string | null;
  /** Idempotency key. Same key + same product = same single movement. */
  requestId: string;
  performedById: string;
  performedByEmail?: string;
}

export interface StockMutationResult {
  transaction: StockTransaction;
  previousStock: number;
  newStock: number;
  /** True when this request had already been applied and was replayed. */
  replayed: boolean;
}



/** Resolves the location to act on: the caller's choice, or the default one. */
export async function resolveLocationId(
  executor: Transaction | typeof db,
  locationId?: string,
): Promise<string> {
  if (locationId) {
    const rows = await executor
      .select({ id: locations.id, isActive: locations.isActive })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw notFound('That location no longer exists.');
    if (!row.isActive) throw new AppError('VALIDATION_ERROR', 'That location is not active.');
    return row.id;
  }

  const rows = await executor
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.isDefault, true), eq(locations.isActive, true)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No default location is set. Create a location before recording stock.',
    );
  }
  return row.id;
}

/**
 * Locks and returns the current quantity for a product/location pair, creating
 * the row at zero if this is the first movement.
 *
 * `FOR UPDATE` is what makes concurrent mutations safe: the second transaction
 * blocks here until the first commits, then reads the committed value.
 */
async function lockStockLevel(
  tx: Transaction,
  productId: string,
  locationId: string,
): Promise<{ id: string; quantity: number }> {
  const locked = await tx
    .select({ id: stockLevels.id, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.locationId, locationId)))
    .for('update')
    .limit(1);

  const existing = locked[0];
  if (existing) return existing;

  // First movement for this pair. ON CONFLICT covers the race where two
  // requests both find nothing and both try to create the row.
  await tx
    .insert(stockLevels)
    .values({ productId, locationId, quantity: 0 })
    .onConflictDoNothing({ target: [stockLevels.productId, stockLevels.locationId] });

  const created = await tx
    .select({ id: stockLevels.id, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.locationId, locationId)))
    .for('update')
    .limit(1);

  const row = created[0];
  if (!row) throw new AppError('INTERNAL_ERROR', 'Could not open a stock record for this product.');
  return row;
}

async function findByRequestId(requestId: string): Promise<StockTransaction | undefined> {
  const rows = await db
    .select()
    .from(stockTransactions)
    .where(eq(stockTransactions.requestId, requestId))
    .limit(1);
  return rows[0];
}

/**
 * Core mutation. All public operations funnel through here so the locking,
 * validation and ledger-writing rules exist in exactly one place.
 */
async function applyMutation(
  input: StockMutationInput & { type: StockTransactionType; direction: 'IN' | 'OUT' },
): Promise<StockMutationResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Quantity must be a whole number greater than zero.');
  }

  // Fast path: a replay we can detect before touching any locks.
  const replay = await findByRequestId(input.requestId);
  if (replay) {
    return {
      transaction: replay,
      previousStock: replay.previousStock,
      newStock: replay.newStock,
      replayed: true,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const productRows = await tx
        .select({ id: products.id, name: products.name, sku: products.sku, isActive: products.isActive })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);
      const product = productRows[0];
      if (!product) throw notFound('That product no longer exists.');
      if (!product.isActive && input.direction === 'IN') {
        throw new AppError('VALIDATION_ERROR', 'This product is inactive. Reactivate it before adding stock.');
      }

      const locationId = await resolveLocationId(tx, input.locationId);
      const level = await lockStockLevel(tx, input.productId, locationId);

      const previousStock = level.quantity;
      const newStock =
        input.direction === 'IN' ? previousStock + input.quantity : previousStock - input.quantity;

      if (newStock < 0) {
        throw new InsufficientStockError(previousStock, input.quantity);
      }

      await tx.update(stockLevels).set({ quantity: newStock }).where(eq(stockLevels.id, level.id));

      const inserted = await tx
        .insert(stockTransactions)
        .values({
          productId: input.productId,
          locationId,
          type: input.type,
          direction: input.direction,
          quantity: input.quantity,
          previousStock,
          newStock,
          reason: input.reason,
          notes: input.notes ?? null,
          performedById: input.performedById,
          requestId: input.requestId,
        })
        .returning();

      const transaction = inserted[0];
      if (!transaction) throw new AppError('INTERNAL_ERROR', 'Stock movement could not be recorded.');

      await recordAudit(
        {
          action:
            input.type === 'ADJUSTMENT'
              ? 'STOCK_ADJUSTED'
              : input.direction === 'IN'
                ? 'STOCK_ADDED'
                : 'STOCK_REMOVED',
          actorId: input.performedById,
          actorEmail: input.performedByEmail ?? null,
          entityType: 'product',
          entityId: input.productId,
          summary: `${input.direction === 'IN' ? 'Added' : 'Removed'} ${input.quantity} × ${product.sku} (${previousStock} → ${newStock})`,
          metadata: { type: input.type, reason: input.reason, locationId, previousStock, newStock },
          requestId: input.requestId,
        },
        tx,
      );

      return { transaction, previousStock, newStock, replayed: false };
    });
  } catch (error) {
    // Two identical requests raced past the fast path. The loser reports the
    // winner's result instead of applying a second movement.
    if (isPgErrorCode(error, PG_ERROR.UNIQUE_VIOLATION)) {
      const existing = await findByRequestId(input.requestId);
      if (existing) {
        return {
          transaction: existing,
          previousStock: existing.previousStock,
          newStock: existing.newStock,
          replayed: true,
        };
      }
    }
    // The database CHECK caught something the service layer should have. Report
    // it as a stock problem rather than leaking a constraint name.
    if (isPgErrorCode(error, PG_ERROR.CHECK_VIOLATION)) {
      throw new AppError('CONFLICT', 'That change would leave stock in an invalid state.');
    }
    throw error;
  }
}

export async function addStock(
  input: StockMutationInput & { type?: Extract<StockTransactionType, 'ADD' | 'PURCHASE' | 'RETURN'> },
): Promise<StockMutationResult> {
  const type = input.type ?? 'ADD';
  return applyMutation({ ...input, type, direction: DIRECTION[type] });
}

export async function removeStock(
  input: StockMutationInput & { type?: Extract<StockTransactionType, 'REMOVE' | 'SALE' | 'DAMAGE'> },
): Promise<StockMutationResult> {
  const type = input.type ?? 'REMOVE';
  return applyMutation({ ...input, type, direction: DIRECTION[type] });
}

/**
 * Sets stock to an exact figure by appending a correcting movement. History is
 * never rewritten — the difference is recorded as an ADJUSTMENT.
 */
export async function adjustStock(
  input: Omit<StockMutationInput, 'quantity'> & { targetQuantity: number },
): Promise<StockMutationResult> {
  if (!Number.isInteger(input.targetQuantity) || input.targetQuantity < 0) {
    throw new AppError('VALIDATION_ERROR', 'The corrected stock figure must be zero or more.');
  }

  const replay = await findByRequestId(input.requestId);
  if (replay) {
    return { transaction: replay, previousStock: replay.previousStock, newStock: replay.newStock, replayed: true };
  }

  const locationId = await resolveLocationId(db, input.locationId);
  const current = await getStockLevel(input.productId, locationId);
  const delta = input.targetQuantity - current;

  if (delta === 0) {
    throw new AppError('VALIDATION_ERROR', `Stock is already ${current}. Nothing to correct.`);
  }

  return applyMutation({
    ...input,
    locationId,
    type: 'ADJUSTMENT',
    direction: delta > 0 ? 'IN' : 'OUT',
    quantity: Math.abs(delta),
  });
}

/** Current quantity at one location, or summed across all of them. */
export async function getStockLevel(productId: string, locationId?: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::int` })
    .from(stockLevels)
    .where(
      locationId
        ? and(eq(stockLevels.productId, productId), eq(stockLevels.locationId, locationId))
        : eq(stockLevels.productId, productId),
    );
  return rows[0]?.total ?? 0;
}

/** Per-location breakdown for the product detail page. */
export async function getStockByLocation(productId: string) {
  return db
    .select({
      locationId: locations.id,
      locationCode: locations.code,
      locationName: locations.name,
      quantity: sql<number>`coalesce(${stockLevels.quantity}, 0)::int`,
      updatedAt: stockLevels.updatedAt,
    })
    .from(stockLevels)
    .innerJoin(locations, eq(locations.id, stockLevels.locationId))
    .where(eq(stockLevels.productId, productId))
    .orderBy(locations.name);
}
