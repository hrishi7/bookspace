import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'auth-redis' });

/**
 * Redis Client for Token Management
 * 
 * Interview Topic: Why Redis for Token Storage?
 * 
 * Requirements for Token Storage:
 * 1. Fast reads (< 1ms) - every request validates token
 * 2. TTL support - auto-expire refresh tokens
 * 3. Atomic operations - prevent race conditions
 * 4. Distributed - works with multiple auth service instances
 * 
 * Redis provides all of these!
 */
export const redisClient = new Redis(config.redis.url, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis error');
});

redisClient.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Token Blacklist Operations
 * 
 * Interview Topic: JWT Logout Problem
 * 
 * Problem: JWTs are stateless - server doesn't track them
 * When user logs out, how do you invalidate the token?
 * 
 * Solutions:
 * 1. Short expiry (15min) - minimize risk window
 * 2. Blacklist - store revoked tokens in Redis
 * 3. Token rotation - issue new tokens frequently
 * 
 * We use ALL three for maximum security!
 */

/**
 * Add token to blacklist
 */
export async function blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
  await redisClient.setex(`blacklist:${token}`, expiresInSeconds, '1');
}

/**
 * Check if token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const result = await redisClient.exists(`blacklist:${token}`);
  return result === 1;
}

/**
 * Store refresh token
 * 
 * Interview Topic: Refresh Token Storage
 * 
 * Why store refresh tokens?
 * 1. Track active sessions
 * 2. Enable remote logout (invalidate specific token)
 * 3. Detect token theft (reuse of old refresh token)
 * 4. Limit concurrent sessions per user
 */
export async function storeRefreshToken(
  userId: string,
  token: string,
  expiresInSeconds: number
): Promise<void> {
  const key = `refresh:${userId}:${token}`;
  await redisClient.setex(key, expiresInSeconds, JSON.stringify({
    userId,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Verify refresh token exists
 */
export async function verifyRefreshToken(userId: string, token: string): Promise<boolean> {
  const key = `refresh:${userId}:${token}`;
  const exists = await redisClient.exists(key);
  return exists === 1;
}

/**
 * Invalidate refresh token
 */
export async function invalidateRefreshToken(userId: string, token: string): Promise<void> {
  const key = `refresh:${userId}:${token}`;
  await redisClient.del(key);
}

/**
 * Invalidate all user's refresh tokens (logout from all devices)
 */
export async function invalidateAllUserTokens(userId: string): Promise<void> {
  const pattern = `refresh:${userId}:*`;
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
}
