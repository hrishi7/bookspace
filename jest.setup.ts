// Global test setup
import { setupTestDatabase, teardownTestDatabase } from './packages/shared/src/test/test-setup';

// Extend Jest matchers
import '@testing-library/jest-dom';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global beforeAll - runs once before all tests
beforeAll(async () => {
  console.log('🚀 Setting up test environment...');
  await setupTestDatabase();
});

// Global afterAll - runs once after all tests
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  await teardownTestDatabase();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep warn and error for important messages
};
