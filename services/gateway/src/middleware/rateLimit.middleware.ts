import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Redis client for distributed rate limiting
 * 
 * Interview Topic: Why Redis for Rate Limiting?
 * 1. Atomic operations (INCR) - no race conditions
 * 2. TTL support - automatic cleanup
 * 3. Distributed - works across multiple gateway instances
 * 4. Fast - in-memory, ~microsecond latency
 */
const redisClient = new Redis(config.redis.url, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true, // Don't connect immediately
});

let redisAvailable = false;

// Try to connect to Redis
redisClient.connect().then(() => {
  console.log('[Gateway] Redis connected for rate limiting');
  redisAvailable = true;
}).catch((err) => {
  console.warn('[Gateway] Redis unavailable for rate limiting, using memory store:', err.message);
  redisAvailable = false;
});

redisClient.on('error', (err) => {
  console.error('[Gateway] Redis error:', err.message);
  redisAvailable = false;
});

redisClient.on('connect', () => {
  redisAvailable = true;
});

/**
 * Token Bucket Rate Limiting
 * 
 * Interview Topic: Rate Limiting Algorithms
 * 
 * 1. Token Bucket (this implementation):
 *    - Refills tokens at fixed rate
 *    - Allows bursts up to bucket size
 *    - Good for: API gateways, general use
 * 
 * 2. Leaky Bucket:
 *    - Processes requests at fixed rate
 *    - Smooths out bursts
 *    - Good for: Streaming, constant rate
 * 
 * 3. Fixed Window:
 *    - Resets counter at fixed intervals
 *    - Simple but has burst problem at boundaries
 *    - Good for: Simple quotas
 * 
 * 4. Sliding Window:
 *    - Hybrid of fixed window + sliding log
 *    - More accurate but more complex
 *    - Good for: Strict rate limits
 */
export const createRateLimiter = () => {
  // Using memory store for now - for production with multiple instances, use Redis
  return rateLimit({
    windowMs: config.rateLimit.windowMs, // 15 minutes
    max: config.rateLimit.maxRequests, // 100 requests per window
    
    // Standardize headers
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers

    // Key generator - rate limit by IP
    keyGenerator: (req: any) => {
      // In production, use req.user.id for authenticated users
      return req.ip || 'unknown';
    },

    // Custom error handler
    handler: (_req: any, res: any) => {
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests, please try again later',
          retryAfter: res.getHeader('Retry-After'),
        },
      });
    },

    // Skip rate limiting for certain conditions
    skip: (req: any) => {
      // Don't rate limit health checks
      return req.path === '/health';
    },
  });
};

/**
 * Stricter rate limit for auth endpoints
 * Prevents brute force attacks on login/signup
 * 
 * Interview Topic: Security Best Practices
 */
export const createAuthRateLimiter = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 attempts per window

    keyGenerator: (req: any) => {
      // Rate limit by IP for auth requests
      return `auth:${req.ip}`;
    },

    handler: (_req: any, res: any) => {
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: res.getHeader('Retry-After'),
        },
      });
    },

    standardHeaders: true,
    legacyHeaders: false,
  });
};
