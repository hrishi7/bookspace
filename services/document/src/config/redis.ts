import Redis from 'ioredis';
import { createLogger } from '@bookspace/logger';
import { config } from '../config';

const logger = createLogger({ service: 'document-redis' });

/**
 * Redis Client for Document Caching
 * 
 * Interview Topic: Caching Strategies
 * 
 * We use Cache-Aside (Lazy Loading) pattern:
 * 1. Check cache first
 * 2. If miss, fetch from database
 * 3. Store in cache for next request
 * 4. Invalidate on update/delete
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
 * Cache Key Helpers
 */
export const cacheKeys = {
  document: (id: string) => `doc:${id}`,
  userDocuments: (userId: string) => `user:${userId}:docs`,
  documentComments: (docId: string) => `doc:${docId}:comments`,
};

/**
 * Get cached document
 */
export async function getCachedDocument(docId: string): Promise<any | null> {
  if (!config.cache.enabled) return null;

  try {
    const cached = await redisClient.get(cacheKeys.document(docId));
    if (cached) {
      logger.debug({ docId }, 'Cache hit');
      return JSON.parse(cached);
    }
    logger.debug({ docId }, 'Cache miss');
    return null;
  } catch (error) {
    logger.error({ error, docId }, 'Cache get error');
    return null; // Fail gracefully
  }
}

/**
 * Cache document
 */
export async function cacheDocument(docId: string, document: any): Promise<void> {
  if (!config.cache.enabled) return;

  try {
    await redisClient.setex(
      cacheKeys.document(docId),
      config.cache.ttl,
      JSON.stringify(document)
    );
    logger.debug({ docId }, 'Cached document');
  } catch (error) {
    logger.error({ error, docId }, 'Cache set error');
    // Don't throw - caching is not critical
  }
}

/**
 * Invalidate document cache
 * 
 * Interview Topic: Cache Invalidation
 * 
 * "There are only two hard things in Computer Science: 
 *  cache invalidation and naming things."
 * 
 * Strategies:
 * 1. TTL (Time To Live) - auto-expire after N seconds
 * 2. Manual invalidation - delete on update/delete
 * 3. Write-through - update cache on write
 * 
 * We use TTL + Manual invalidation
 */
export async function invalidateDocumentCache(docId: string): Promise<void> {
  try {
    await redisClient.del(cacheKeys.document(docId));
    logger.debug({ docId }, 'Invalidated cache');
  } catch (error) {
    logger.error({ error, docId }, 'Cache invalidation error');
  }
}

/**
 * Cache comments
 */
export async function cacheComments(docId: string, comments: any[]): Promise<void> {
  if (!config.cache.enabled) return;

  try {
    await redisClient.setex(
      cacheKeys.documentComments(docId),
      config.cache.ttl,
      JSON.stringify(comments)
    );
  } catch (error) {
    logger.error({ error, docId }, 'Cache comments error');
  }
}

/**
 * Get cached comments
 */
export async function getCachedComments(docId: string): Promise<any[] | null> {
  if (!config.cache.enabled) return null;

  try {
    const cached = await redisClient.get(cacheKeys.documentComments(docId));
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error({ error, docId }, 'Get cached comments error');
    return null;
  }
}

/**
 * Invalidate comments cache
 */
export async function invalidateCommentsCache(docId: string): Promise<void> {
  try {
    await redisClient.del(cacheKeys.documentComments(docId));
  } catch (error) {
    logger.error({ error, docId }, 'Invalidate comments cache error');
  }
}
