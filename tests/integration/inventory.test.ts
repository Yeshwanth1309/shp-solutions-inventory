import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { stockTransactions } from '@/server/db/schema';
import {
  addStock,
  adjustStock,
  getStockLevel,
  removeStock,
} from '@/server/services/inventory-service';
import { InsufficientStockError } from '@/lib/errors';
import { resetDatabase } from './helpers/database';
import { captureError, databaseMessage } from './helpers/errors';
import { createBaseWorld, createTestProduct, requestId } from './helpers/factories';

describe('inventory engine', () => {
  let world: Awaited<ReturnType<typeof createBaseWorld>>;

  beforeEach(async () => {
    await resetDatabase();
    world = await createBaseWorld();
  });

  describe('adding stock', () => {
    it('records the movement and moves the level from 0 to the new total', async () => {
      const result = await addStock({
        productId: world.product.id,
        quantity: 25,
        reason: 'Purchase',
        requestId: requestId(),
        performedById: world.user.id,
      });

      expect(result.previousStock).toBe(0);
      expect(result.newStock).toBe(25);
      expect(result.replayed).toBe(false);
      expect(await getStockLevel(world.product.id)).toBe(25);
    });

    it('accumulates across several movements and keeps previous/new consistent', async () => {
      await addStock({ productId: world.product.id, quantity: 100, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });
      const second = await addStock({ productId: world.product.id, quantity: 25, reason: 'Restock', requestId: requestId(), performedById: world.user.id });

      expect(second.previousStock).toBe(100);
      expect(second.newStock).toBe(125);
      expect(await getStockLevel(world.product.id)).toBe(125);
    });

    it('rejects zero and negative quantities', async () => {
      await expect(
        addStock({ productId: world.product.id, quantity: 0, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/greater than zero/i);

      await expect(
        addStock({ productId: world.product.id, quantity: -5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/greater than zero/i);
    });

    it('rejects fractional quantities', async () => {
      await expect(
        addStock({ productId: world.product.id, quantity: 2.5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/whole number/i);
    });

    it('refuses to add stock to an inactive product', async () => {
      const inactive = await createTestProduct({ categoryId: world.category.id, isActive: false });
      await expect(
        addStock({ productId: inactive.id, quantity: 5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/inactive/i);
    });

    it('rejects a product that does not exist', async () => {
      await expect(
        addStock({ productId: 'does-not-exist', quantity: 5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/no longer exists/i);
    });
  });

  describe('removing stock', () => {
    beforeEach(async () => {
      await addStock({ productId: world.product.id, quantity: 125, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });
    });

    it('reduces the level and records previous and new stock', async () => {
      const result = await removeStock({
        productId: world.product.id,
        quantity: 20,
        reason: 'Sale',
        requestId: requestId(),
        performedById: world.user.id,
      });

      expect(result.previousStock).toBe(125);
      expect(result.newStock).toBe(105);
      expect(await getStockLevel(world.product.id)).toBe(105);
    });

    it('allows removing exactly the amount on hand', async () => {
      const result = await removeStock({ productId: world.product.id, quantity: 125, reason: 'Sale', requestId: requestId(), performedById: world.user.id });
      expect(result.newStock).toBe(0);
      expect(await getStockLevel(world.product.id)).toBe(0);
    });

    it('rejects a removal larger than the stock on hand, and leaves stock untouched', async () => {
      const product = await createTestProduct({ categoryId: world.category.id });
      await addStock({ productId: product.id, quantity: 10, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      await expect(
        removeStock({ productId: product.id, quantity: 15, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(InsufficientStockError);

      expect(await getStockLevel(product.id)).toBe(10);
    });

    it('reports how many units are actually available', async () => {
      const product = await createTestProduct({ categoryId: world.category.id });
      await addStock({ productId: product.id, quantity: 10, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      await expect(
        removeStock({ productId: product.id, quantity: 15, reason: 'Sale', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow('Insufficient stock. Only 10 units are currently available.');
    });

    it('rolls back the ledger row when the removal is rejected', async () => {
      const product = await createTestProduct({ categoryId: world.category.id });
      await addStock({ productId: product.id, quantity: 3, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      const failing = requestId();
      await expect(
        removeStock({ productId: product.id, quantity: 99, reason: 'Sale', requestId: failing, performedById: world.user.id }),
      ).rejects.toThrow(InsufficientStockError);

      const rows = await db.select().from(stockTransactions).where(eq(stockTransactions.requestId, failing));
      expect(rows).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('applies a repeated request id exactly once', async () => {
      const id = requestId();
      const first = await addStock({ productId: world.product.id, quantity: 50, reason: 'Purchase', requestId: id, performedById: world.user.id });
      const retry = await addStock({ productId: world.product.id, quantity: 50, reason: 'Purchase', requestId: id, performedById: world.user.id });

      expect(first.replayed).toBe(false);
      expect(retry.replayed).toBe(true);
      expect(retry.transaction.id).toBe(first.transaction.id);
      expect(await getStockLevel(world.product.id)).toBe(50);
    });

    it('survives simultaneous retries of the same request id', async () => {
      const id = requestId();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          addStock({ productId: world.product.id, quantity: 10, reason: 'Purchase', requestId: id, performedById: world.user.id }),
        ),
      );

      const transactionIds = new Set(attempts.map((a) => a.transaction.id));
      expect(transactionIds.size).toBe(1);
      expect(await getStockLevel(world.product.id)).toBe(10);
    });

    it('treats different request ids as separate movements', async () => {
      await addStock({ productId: world.product.id, quantity: 10, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });
      await addStock({ productId: world.product.id, quantity: 10, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });
      expect(await getStockLevel(world.product.id)).toBe(20);
    });
  });

  describe('corrections', () => {
    it('appends an ADJUSTMENT rather than editing history', async () => {
      await addStock({ productId: world.product.id, quantity: 100, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      const result = await adjustStock({
        productId: world.product.id,
        targetQuantity: 92,
        reason: 'Stock count correction',
        requestId: requestId(),
        performedById: world.user.id,
      });

      expect(result.newStock).toBe(92);
      expect(result.transaction.type).toBe('ADJUSTMENT');
      expect(result.transaction.quantity).toBe(8);
      expect(result.transaction.direction).toBe('OUT');

      const ledger = await db.select().from(stockTransactions).where(eq(stockTransactions.productId, world.product.id));
      expect(ledger).toHaveLength(2);
    });

    it('corrects upwards when the count is higher than recorded', async () => {
      await addStock({ productId: world.product.id, quantity: 10, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });
      const result = await adjustStock({
        productId: world.product.id,
        targetQuantity: 14,
        reason: 'Stock count correction',
        requestId: requestId(),
        performedById: world.user.id,
      });
      expect(result.transaction.direction).toBe('IN');
      expect(result.newStock).toBe(14);
    });

    it('rejects a correction to a negative figure', async () => {
      await expect(
        adjustStock({ productId: world.product.id, targetQuantity: -1, reason: 'Correction', requestId: requestId(), performedById: world.user.id }),
      ).rejects.toThrow(/zero or more/i);
    });
  });

  describe('the ledger is append-only', () => {
    it('refuses updates at the database level', async () => {
      const result = await addStock({ productId: world.product.id, quantity: 5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      const error = await captureError(() =>
        db.update(stockTransactions).set({ quantity: 9999 }).where(eq(stockTransactions.id, result.transaction.id)),
      );

      expect(databaseMessage(error)).toMatch(/append-only/i);

      // The row is untouched.
      const rows = await db.select().from(stockTransactions).where(eq(stockTransactions.id, result.transaction.id));
      expect(rows[0]?.quantity).toBe(5);
    });

    it('refuses deletes at the database level', async () => {
      const result = await addStock({ productId: world.product.id, quantity: 5, reason: 'Purchase', requestId: requestId(), performedById: world.user.id });

      const error = await captureError(() =>
        db.delete(stockTransactions).where(eq(stockTransactions.id, result.transaction.id)),
      );

      expect(databaseMessage(error)).toMatch(/append-only/i);

      const rows = await db.select().from(stockTransactions).where(eq(stockTransactions.id, result.transaction.id));
      expect(rows).toHaveLength(1);
    });
  });
});
