import { z } from 'zod';

/**
 * Common validation schemas using Zod
 * These can be reused across services for consistent validation
 */

// Email validation
export const emailSchema = z.string().email('Invalid email address');

// Password validation - at least 8 characters, 1 uppercase, 1 lowercase, 1 number
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID');

// Pagination schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/**
 * Creates a standard paginated response structure
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
