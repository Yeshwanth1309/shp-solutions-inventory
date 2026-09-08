import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

/**
 * Length is the dominant factor in password strength, so the floor is 12 rather
 * than a shorter password padded with symbol rules.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Passwords cannot exceed 128 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Include upper and lower case letters')
  .refine((v) => /[0-9]/.test(v), 'Include at least one number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const totpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
});

export const recoveryCodeSchema = z.object({
  code: z.string().trim().min(8, 'Enter a recovery code').max(32),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['newPassword'],
  });

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, 'Enter a name').max(120),
  password: passwordSchema,
  roleKey: z.enum(['ADMIN', 'INVENTORY_MANAGER', 'STAFF']),
  mustChangePassword: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleKey: z.enum(['ADMIN', 'INVENTORY_MANAGER', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
