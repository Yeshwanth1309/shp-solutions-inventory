import { describe, expect, it } from 'vitest';
import { productSchema } from '@/server/validation/product-schemas';
import { addStockSchema, adjustStockSchema, removeStockSchema } from '@/server/validation/inventory-schemas';
import { passwordSchema, loginSchema } from '@/server/validation/auth-schemas';

describe('product schema', () => {
  const base = { sku: 'TNR-001', name: 'HP 12A Toner', categoryId: 'cat_1', minimumStock: 5, unit: 'PIECE' as const };

  it('accepts a minimal valid product', () => {
    expect(productSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a blank name', () => {
    const result = productSchema.safeParse({ ...base, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an SKU with spaces', () => {
    const result = productSchema.safeParse({ ...base, sku: 'TNR 001' });
    expect(result.success).toBe(false);
  });

  it('rejects negative minimum stock', () => {
    const result = productSchema.safeParse({ ...base, minimumStock: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a maximum stock below the minimum', () => {
    const result = productSchema.safeParse({ ...base, minimumStock: 20, maximumStock: 5 });
    expect(result.success).toBe(false);
  });

  it('accepts a maximum stock at or above the minimum', () => {
    expect(productSchema.safeParse({ ...base, minimumStock: 5, maximumStock: 5 }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, minimumStock: 5, maximumStock: 50 }).success).toBe(true);
  });

  it('rejects an unrecognised unit', () => {
    const result = productSchema.safeParse({ ...base, unit: 'CRATE' as unknown });
    expect(result.success).toBe(false);
  });
});

describe('inventory mutation schemas', () => {
  it('rejects a zero quantity for add stock', () => {
    const result = addStockSchema.safeParse({ quantity: 0, reason: 'Purchase', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative quantity for remove stock', () => {
    const result = removeStockSchema.safeParse({ quantity: -3, reason: 'Sale', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(false);
  });

  it('rejects an add-stock reason that is not in the allowed list', () => {
    const result = addStockSchema.safeParse({ quantity: 5, reason: 'Sale', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(false); // "Sale" is a remove reason, not an add reason
  });

  it('requires a request id for idempotency', () => {
    const result = addStockSchema.safeParse({ quantity: 5, reason: 'Purchase' });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed add-stock payload', () => {
    const result = addStockSchema.safeParse({ quantity: 5, reason: 'Purchase', notes: 'From PO #4', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(true);
  });

  it('allows a zero target for stock adjustment (a full write-off)', () => {
    const result = adjustStockSchema.safeParse({ targetQuantity: 0, reason: 'Annual count', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(true);
  });

  it('rejects a negative target for stock adjustment', () => {
    const result = adjustStockSchema.safeParse({ targetQuantity: -1, reason: 'Annual count', requestId: 'req-abcdefgh' });
    expect(result.success).toBe(false);
  });
});

describe('auth schemas', () => {
  it('rejects a password shorter than 12 characters', () => {
    expect(passwordSchema.safeParse('Short1').success).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(passwordSchema.safeParse('NoDigitsHereAtAll').success).toBe(false);
  });

  it('rejects a password with no upper-case letter', () => {
    expect(passwordSchema.safeParse('alllowercase123').success).toBe(false);
  });

  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('CorrectHorse123Battery').success).toBe(true);
  });

  it('lower-cases and trims the login email', () => {
    const result = loginSchema.safeParse({ email: '  Owner@SHPSolutions.in  ', password: 'x' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('owner@shpsolutions.in');
  });
});
