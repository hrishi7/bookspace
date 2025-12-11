import jwt from 'jsonwebtoken';
import { TokenPayload, AuthTokens, UserRole } from '@bookspace/types';
import { config } from '../config';
import { storeRefreshToken, blacklistToken } from './redis';

/**
 * JWT Token Service
 * 
 * Interview Topic: Access Token vs Refresh Token
 * 
 * Access Token:
 * - Short-lived (15 minutes)
 * - Used for API requests
 * - Stored in memory (not localStorage!)
 * - Compromised? Expires soon
 * 
 * Refresh Token:
 * - Long-lived (7 days)
 * - Used ONLY to get new access token
 * - Stored in httpOnly cookie
 * - Rot ated on each use
 * - Compromised? Can be revoked
 * 
 * Flow:
 * 1. Login → Get both tokens
 * 2. Use access token for API calls
 * 3. Access token expires → Use refresh token
 * 4. Get new access + refresh token (rotation)
 * 5. Old refresh token invalidated
 */

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(userId: string, email: string, role: UserRole): string {
  const payload: Omit<TokenPayload, 'exp' | 'iat' | 'iss' | 'aud'> = {
    userId,
    email,
    role,
    type: 'access',
  };

  // @ts-ignore - JWT library type issue with expiresIn
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as string | number,
    issuer: 'bookspace-auth',
    audience: 'bookspace-api',
  });
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(userId: string, email: string, role: UserRole): string {
  const payload: Omit<TokenPayload, 'exp' | 'iat' | 'iss' | 'aud'> = {
    userId,
    email,
    role,
    type: 'refresh',
  };

  // @ts-ignore - JWT library type issue with expiresIn
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as string | number,
    issuer: 'bookspace-auth',
    audience: 'bookspace-api',
  });
}

/**
 * Generate both tokens
 */
export async function generateTokens(
  userId: string,
  email: string,
  role: UserRole
): Promise<AuthTokens> {
  const accessToken = generateAccessToken(userId, email, role);
  const refreshToken = generateRefreshToken(userId, email, role);

  // Store refresh token in Redis
  const refreshExpirySeconds = parseExpiry(config.jwt.refreshExpiresIn);
  await storeRefreshToken(userId, refreshToken, refreshExpirySeconds);

  return { accessToken, refreshToken };
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret, {
    issuer: 'bookspace-auth',
    audience: 'bookspace-api',
  }) as TokenPayload;
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret, {
    issuer: 'bookspace-auth',
    audience: 'bookspace-api',
  }) as TokenPayload;
}

/**
 * Blacklist access token (for logout)
 * 
 * Interview Topic: How to Logout with JWT?
 * 
 * Challenge: JWTs are stateless, can't be "deleted"
 * 
 * Solutions:
 * 1. Client discards token (but token still valid if stolen)
 * 2. Short expiry (limits damage if stolen)
 * 3. Blacklist (store revoked tokens in Redis)
 * 
 * We use #3: Store token in Redis until it expires
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = verifyAccessToken(token);
    const expirySeconds = calculateTokenExpiry(decoded);
    await blacklistToken(token, expirySeconds);
  } catch {
    // Token invalid or expired, no need to blacklist
  }
}

/**
 * Helper: Calculate remaining token expiry in seconds
 */
function calculateTokenExpiry(payload: TokenPayload): number {
  if (!payload.exp) return 0;
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  return Math.max(remaining, 0);
}

/**
 * Helper: Parse expiry string (15m, 7d) to seconds
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('Invalid expiry format');

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * multipliers[unit as keyof typeof multipliers];
}
