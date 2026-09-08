import { z } from 'zod';

/**
 * Shared validation contracts. The same schemas run in the browser (via
 * react-hook-form) and again on the server, so a crafted request that bypasses
 * the form still hits identical rules.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const skuSchema = trimmed(64)
  .min(2, 'SKU must be at least 2 characters')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, numbers, dot, dash, slash or underscore');

export const barcodeSchema = trimmed(64).regex(/^[A-Za-z0-9-]*$/, 'Barcode may contain letters, numbers and dashes');

export const PRODUCT_UNITS = ['PIECE', 'BOX', 'PACK', 'SET', 'REAM', 'BOTTLE', 'KIT', 'METRE'] as const;
export const PRINTER_TYPES = ['LASER', 'INKJET', 'MULTIFUNCTION', 'DOT_MATRIX', 'PHOTO', 'THERMAL'] as const;
export const COLOR_TYPES = ['MONO', 'COLOUR', 'BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'TRICOLOUR'] as const;
export const CONSUMABLE_TYPES = [
  'TONER_CARTRIDGE',
  'INK_CARTRIDGE',
  'INK_BOTTLE',
  'DRUM_UNIT',
  'WASTE_TONER',
  'PRINT_HEAD',
  'MAINTENANCE_KIT',
  'FUSER',
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const productSchema = z
  .object({
    sku: skuSchema,
    barcode: barcodeSchema.optional().transform((v) => (v === '' ? undefined : v)),
    name: trimmed(200).min(2, 'Product name must be at least 2 characters'),
    model: optionalText(120),
    description: optionalText(2000),
    unit: z.enum(PRODUCT_UNITS).default('PIECE'),
    minimumStock: z.coerce.number().int('Use a whole number').min(0, 'Cannot be negative').max(1_000_000),
    maximumStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
    isActive: z.boolean().default(true),

    categoryId: z.string().min(1, 'Choose a category'),
    brandId: z.string().min(1).optional(),
    supplierId: z.string().min(1).optional(),

    printerType: z.enum(PRINTER_TYPES).optional(),
    colorType: z.enum(COLOR_TYPES).optional(),
    consumableType: z.enum(CONSUMABLE_TYPES).optional(),
    compatibility: z.array(trimmed(120)).max(50).default([]),
    partNumber: optionalText(80),
    manufacturerPartNumber: optionalText(80),
  })
  .refine(
    (v) => v.maximumStock === undefined || v.maximumStock >= v.minimumStock,
    { message: 'Maximum stock must be at least the minimum', path: ['maximumStock'] },
  );

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.innerType().partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const STOCK_STATUSES = ['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;

export const productListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(STOCK_STATUSES).default('ALL'),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  supplierId: z.string().optional(),
  locationId: z.string().optional(),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'sku', 'stock', 'minimumStock', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type ProductListQueryInput = z.infer<typeof productListQuerySchema>;
