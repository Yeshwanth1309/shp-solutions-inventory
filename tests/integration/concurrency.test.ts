import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { stockTransactions } from '@/server/db/schema';
import { addStock, getStockLevel, removeStock } from '@/server/services/inventory-service';
import { InsufficientStockError } from '@/lib/errors';
import { resetDatabase } from './helpers/database';
import { createBaseWorld, createTestProduct, requestId } from './helpers/factories';

/**
 * The test the whole design exists to pass.
 *
 * Concurrent stock operations must not corrupt inventory. Without row-level
 * locking, two simultaneous removals both read the same "before" value, both
 * compute a valid-looking result, and the second write silently destroys the
 * first — the classic lost update. The engine takes `SELECT ... FOR UPDATE` on
 * the stock level, so the second transaction blocks until the first commits and
 * then sees the true remaining quantity.
 */
describe('concurrent stock operations', () => {
  let world: Awaited<ReturnType<typeof createBaseWorld>>;

  beforeEach(async () => {
    await resetDatabase();
    world = await createBaseWorld();
  });

  it('lets only one of two simultaneous 7-unit removals succeed against 10 in stock', async () => {
    const product = await createTestProduct({ categoryId: world.category.id });
    await addStock({
      productId: product.id,
      quantity: 10,
      reason: 'Purchase',
      requestId: requestId(),
      performedById: world.user.id,
    });

    const [resultA, resultB] = await Promise.allSettled([
      removeStock({ productId: product.id, quantity: 7, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
      removeStock({ productId: product.id, quantity: 7, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
    ]);

    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(InsufficientStockError);

    // The whole point: 3, never -4.
    expect(await getStockLevel(product.id)).toBe(3);
  });

  it('keeps the ledger consistent when many removals race', async () => {
    const product = await createTestProduct({ categoryId: world.category.id });
    await addStock({
      productId: product.id,
      quantity: 100,
      reason: 'Purchase',
      requestId: requestId(),
      performedById: world.user.id,
    });

    // 20 concurrent removals of 8 units against 100 on hand: at most 12 can win.
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        removeStock({ productId: product.id, quantity: 8, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
      ),
    );

    const succeeded = outcomes.filter((o) => o.status === 'fulfilled').length;
    const finalStock = await getStockLevel(product.id);

    expect(succeeded).toBe(12);
    expect(finalStock).toBe(100 - succeeded * 8);
    expect(finalStock).toBeGreaterThanOrEqual(0);

    // Every committed movement must chain: the rows form a single unbroken
    // path from 0 to the final stock, with no gaps and no overlaps.
    //
    // They cannot simply be sorted by created_at — inside a transaction that
    // timestamp is the transaction's start time, not its commit time, so
    // racing rows tie. Instead we walk the chain by linking each row's
    // previousStock to the running total.
    const ledger = await db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.productId, product.id));

    const remaining = new Map<number, (typeof ledger)[number]>();
    for (const row of ledger) {
      expect(remaining.has(row.previousStock)).toBe(false); // no two rows start from the same level
      remaining.set(row.previousStock, row);
    }

    let running = 0;
    for (let step = 0; step < ledger.length; step += 1) {
      const row = remaining.get(running);
      expect(row, `no ledger row continues from stock level ${running}`).toBeDefined();
      if (!row) break;
      remaining.delete(running);
      running = row.direction === 'IN' ? running + row.quantity : running - row.quantity;
      expect(row.newStock).toBe(running);
      expect(row.newStock).toBeGreaterThanOrEqual(0);
    }

    expect(remaining.size).toBe(0); // every row was reachable
    expect(running).toBe(finalStock);
  });

  it('does not lose additions when many run at once', async () => {
    const product = await createTestProduct({ categoryId: world.category.id });

    await Promise.all(
      Array.from({ length: 25 }, () =>
        addStock({ productId: product.id, quantity: 4, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ),
    );

    // 25 × 4 = 100. A lost update would show fewer.
    expect(await getStockLevel(product.id)).toBe(100);
  });

  it('handles simultaneous first-ever movements without duplicate stock rows', async () => {
    const product = await createTestProduct({ categoryId: world.category.id });

    // No stock_levels row exists yet, so both requests race to create it.
    await Promise.all(
      Array.from({ length: 6 }, () =>
        addStock({ productId: product.id, quantity: 5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ),
    );

    expect(await getStockLevel(product.id)).toBe(30);
  });

  it('keeps mixed additions and removals balanced under load', async () => {
    const product = await createTestProduct({ categoryId: world.category.id });
    await addStock({ productId: product.id, quantity: 200, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

    const operations = [
      ...Array.from({ length: 15 }, () => () =>
        addStock({ productId: product.id, quantity: 3, reason: 'Restock', requestId: requestId(), performedById: world.user.id }),
      ),
      ...Array.from({ length: 15 }, () => () =>
        removeStock({ productId: product.id, quantity: 5, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
      ),
    ];

    const outcomes = await Promise.allSettled(operations.map((run) => run()));
    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);

    // 200 + (15 × 3) - (15 × 5) = 170
    expect(await getStockLevel(product.id)).toBe(170);
  });
});
