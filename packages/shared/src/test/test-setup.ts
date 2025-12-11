/**
 * Test Setup Utilities
 * Provides database setup, test data factories, and helper functions for testing
 */

import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';

// Test Database Connections
let pgPool: Pool;
let mongoClient: MongoClient;
let redisClient: Redis;

export interface TestDatabase {
  postgres: Pool;
  mongo: MongoClient;
  redis: Redis;
}

/**
 * Setup test databases
 * Can use either real databases or test containers
 */
export async function setupTestDatabase(): Promise<TestDatabase> {
  // PostgreSQL
  pgPool = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'bookspace_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
  });

  // Clean database
  await pgPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  // Run migrations (if you have them)
  // await runMigrations(pgPool);

  // MongoDB
  mongoClient = await MongoClient.connect(
    process.env.TEST_MONGO_URL || 'mongodb://localhost:27017/bookspace_test'
  );

  // Clean all collections
  const db = mongoClient.db();
  const collections = await db.listCollections().toArray();
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
  }

  // Redis
  redisClient = new Redis({
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
    db: parseInt(process.env.TEST_REDIS_DB || '15'), // Use separate DB for tests
  });

  // Clean Redis
  await redisClient.flushdb();

  return {
    postgres: pgPool,
    mongo: mongoClient,
    redis: redisClient,
  };
}

/**
 * Cleanup test databases
 */
export async function teardownTestDatabase(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  if (redisClient) {
    redisClient.disconnect();
  }
}

/**
 * Clean all data between tests
 */
export async function cleanDatabase(): Promise<void> {
  // Clean PostgreSQL
  if (pgPool) {
    const result = await pgPool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    for (const { tablename } of result.rows) {
      await pgPool.query(`TRUNCATE TABLE ${tablename} CASCADE`);
    }
  }

  // Clean MongoDB
  if (mongoClient) {
    const db = mongoClient.db();
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  }

  // Clean Redis
  if (redisClient) {
    await redisClient.flushdb();
  }
}

/**
 * Test Data Factories
 */

export const TestDataFactory = {
  /**
   * Create test user
   */
  createUser: (overrides = {}) => ({
    id: `user-${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456', // Dummy hash
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  /**
   * Create test document
   */
  createDocument: (overrides = {}) => ({
    id: `doc-${Date.now()}-${Math.random()}`,
    title: 'Test Document',
    content: 'This is test content',
    authorId: 'user-1',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  /**
   * Create test comment
   */
  createComment: (overrides = {}) => ({
    id: `comment-${Date.now()}-${Math.random()}`,
    documentId: 'doc-1',
    userId: 'user-1',
    content: 'Test comment',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
};

/**
 * Test Helpers
 */

export const TestHelpers = {
  /**
   * Generate JWT token for testing
   */
  generateTestToken: (payload: any): string => {
    // Simple mock token for testing
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  },

  /**
   * Wait for condition
   */
  waitFor: async (
    condition: () => Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Condition not met within timeout');
  },

  /**
   * Sleep helper
   */
  sleep: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

/**
 * Mock Factories
 */

export const MockFactory = {
  /**
   * Create mock repository
   */
  createMockRepository: <T>() => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
  }),

  /**
   * Create mock service
   */
  createMockService: () => ({
    execute: jest.fn(),
    process: jest.fn(),
  }),

  /**
   * Create mock event publisher
   */
  createMockEventPublisher: () => ({
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
  }),
};

// Export database connections for direct access in tests
export const getTestDatabase = () => ({
  postgres: pgPool,
  mongo: mongoClient,
  redis: redisClient,
});
