import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter a supplier name').max(160),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9()\s-]*$/, 'Use digits, spaces, brackets, + or -')
    .optional(),
  email: z.union([z.string().trim().email('Enter a valid email address').max(254), z.literal('')]).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const locationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Enter a short code')
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes'),
  name: z.string().trim().min(2, 'Enter a location name').max(120),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Use lower-case letters, numbers and dashes'),
  parentId: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
});

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().default(true),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type BrandInput = z.infer<typeof brandSchema>;
