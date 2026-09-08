import { z } from 'zod';
import { ADD_REASONS, REMOVE_REASONS } from '@/server/services/inventory-service';

const quantitySchema = z.coerce
  .number({ invalid_type_error: 'Enter a quantity' })
  .int('Quantity must be a whole number')
  .positive('Quantity must be greater than zero')
  .max(1_000_000, 'That quantity looks too large');

/**
 * `requestId` is the idempotency key. The client generates one per confirmed
 * action and reuses it on retry, so a flaky connection cannot double-post a
 * stock movement.
 */
const requestIdSchema = z
  .string()
  .trim()
  .min(8, 'Missing request identifier')
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid request identifier');

export const addStockSchema = z.object({
  quantity: quantitySchema,
  reason: z.enum(ADD_REASONS),
  notes: z.string().trim().max(500).optional(),
  locationId: z.string().min(1).optional(),
  requestId: requestIdSchema,
});

export const removeStockSchema = z.object({
  quantity: quantitySchema,
  reason: z.enum(REMOVE_REASONS),
  notes: z.string().trim().max(500).optional(),
  locationId: z.string().min(1).optional(),
  requestId: requestIdSchema,
});

export const adjustStockSchema = z.object({
  targetQuantity: z.coerce.number().int('Use a whole number').min(0, 'Cannot be negative').max(1_000_000),
  reason: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional(),
  locationId: z.string().min(1).optional(),
  requestId: requestIdSchema,
});

export const historyQuerySchema = z.object({
  productId: z.string().optional(),
  sku: z.string().trim().max(64).optional(),
  type: z.enum(['ADD', 'REMOVE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'PURCHASE', 'SALE']).optional(),
  performedById: z.string().optional(),
  reason: z.string().trim().max(120).optional(),
  locationId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AddStockInput = z.infer<typeof addStockSchema>;
export type RemoveStockInput = z.infer<typeof removeStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
