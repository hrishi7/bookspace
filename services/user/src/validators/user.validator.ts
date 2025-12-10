import { z } from 'zod';
import { emailSchema } from '@bookspace/common';

/**
 * Create User Schema
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['USER', 'ADMIN']).optional().default('USER'),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;

/**
 * Update User Schema
 */
export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

/**
 * Update Password Schema
 */
export const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type UpdatePasswordRequest = z.infer<typeof updatePasswordSchema>;
