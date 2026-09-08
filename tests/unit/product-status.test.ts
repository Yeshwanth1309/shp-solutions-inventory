import { describe, expect, it } from 'vitest';
import { deriveStatus } from '@/server/services/product-service';

describe('deriveStatus', () => {
  it('is OUT_OF_STOCK at exactly zero', () => {
    expect(deriveStatus(0, 10)).toBe('OUT_OF_STOCK');
  });

  it('is OUT_OF_STOCK when negative (defensive — should never occur)', () => {
    expect(deriveStatus(-1, 10)).toBe('OUT_OF_STOCK');
  });

  it('is LOW_STOCK when above zero and at or under the minimum', () => {
    expect(deriveStatus(1, 10)).toBe('LOW_STOCK');
    expect(deriveStatus(10, 10)).toBe('LOW_STOCK');
  });

  it('is IN_STOCK once strictly above the minimum', () => {
    expect(deriveStatus(11, 10)).toBe('IN_STOCK');
  });

  it('is IN_STOCK for any positive stock when minimum is zero', () => {
    expect(deriveStatus(1, 0)).toBe('IN_STOCK');
  });

  it('is OUT_OF_STOCK at zero even when minimum is zero', () => {
    expect(deriveStatus(0, 0)).toBe('OUT_OF_STOCK');
  });
});
