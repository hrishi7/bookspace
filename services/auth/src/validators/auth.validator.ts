import { z } from 'zod';
import { emailSchema, passwordSchema } from '@bookspace/common';

/**
 * Validation Schemas for Auth Endpoints
 * 
 * Interview Topic: Input Validation Importance
 * 
 * Why validate?
 * 1. Security - prevent injection attacks
 * 2. Data integrity - ensure correct data in DB
 * 3. Better errors - fail fast with clear messages
 * 4. Type safety - runtime validation + TypeScript types
 */

/**
 * Signup Request Schema
 */
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});

export type SignupRequest = z.infer<typeof signupSchema>;

/**
 * Login Request Schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Refresh Token Request Schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
