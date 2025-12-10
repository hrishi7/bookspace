import { PrismaClient } from '@prisma/client';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'user-prisma' });

/**
 * Prisma Client Instance
 * 
 * Interview Topic: Connection Pooling with Prisma
 * 
 * Prisma uses connection pooling automatically:
 * - Default pool size: calculated based on CPU cores
 * - Formula: num_physical_cpus * 2 + 1
 * - Can configure via DATABASE_URL
 * 
 * Example:
 * DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=20"
 * 
 * Best practices:
 * - One PrismaClient instance per application
 * - Reuse across requests (singleton pattern)
 * - Don't create new instance per request
 * 
 * Why singleton?
 * - Connection pooling works best with single client
 * - Multiple clients = multiple pools = wasted connections
 */

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
});

/**
 * Connect to database
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ error }, 'Database connection failed');
    throw error;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ error }, 'Database disconnection error');
    throw error;
  }
}

/**
 * Middleware: Soft delete filtering
 * 
 * Interview Topic: Prisma Middleware
 * 
 * Automatically exclude soft-deleted records from queries
 * Without middleware, every query needs: WHERE deletedAt IS NULL
 * With middleware, it's automatic!
 */
prisma.$use(async (params, next) => {
  // Intercept findMany and findFirst
  if (params.model === 'User') {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      // Add deletedAt: null to WHERE clause
      if (!params.args) {
        params.args = {};
      }
      if (!params.args.where) {
        params.args.where = {};
      }
      if (!params.args.where.deletedAt) {
        params.args.where.deletedAt = null;
      }
    }

    // Convert delete to soft delete
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }

    // Convert deleteMany to soft delete
    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      if (params.args.data !== undefined) {
        params.args.data.deletedAt = new Date();
      } else {
        params.args.data = { deletedAt: new Date() };
      }
    }
  }

  return next(params);
});
