import { describe, expect, it } from 'vitest';
import { AppError, InsufficientStockError, conflict, forbidden, notFound, unauthenticated } from '@/lib/errors';

describe('AppError status mapping', () => {
  it('maps each helper to its expected HTTP status', () => {
    expect(unauthenticated().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(conflict('x').status).toBe(409);
  });

  it('InsufficientStockError carries the available and requested amounts', () => {
    const error = new InsufficientStockError(10, 15);
    expect(error.status).toBe(409);
    expect(error.available).toBe(10);
    expect(error.requested).toBe(15);
    expect(error.message).toBe('Insufficient stock. Only 10 units are currently available.');
  });

  it('is an instance of AppError so generic handling still applies', () => {
    expect(new InsufficientStockError(1, 2)).toBeInstanceOf(AppError);
  });
});
