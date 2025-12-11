# Phase 9: Testing & Quality - Detailed Answers

> In-depth answers with production-ready code examples, testing strategies, and best practices

## Table of Contents
1. [Unit Testing Answers](#unit-testing)
2. [Integration Testing Answers](#integration-testing)
3. [Load Testing Answers](#load-testing)
4. [Security Answers](#security)
5. [Performance Optimization Answers](#performance-optimization)
6. [Testing Best Practices Answers](#testing-best-practices)

---

## Unit Testing

### Q1: What is the difference between unit tests and integration tests?

**Answer:**

**Unit Tests:**
- Test individual functions/methods in isolation
- Mock all external dependencies
- Fast execution (<1ms per test)
- No database, network, or file system access
- Test one thing at a time

**Integration Tests:**
- Test multiple components together
- Use real dependencies (database, APIs)
- Slower execution (100ms-1000ms per test)
- Test actual interactions
- Verify system behavior

**Code Example:**

```typescript
// ❌ NOT a unit test - hits real database
describe('UserService', () => {
  it('should create user', async () => {
    const user = await userService.create({ email: 'test@example.com' });
    expect(user.id).toBeDefined();
  });
});

// ✅ UNIT TEST - mocked dependencies
describe('UserService', () => {
  it('should create user', async () => {
    // Mock the repository
    const mockRepo = {
      save: jest.fn().mockResolvedValue({ id: '123', email: 'test@example.com' })
    };
    
    const userService = new UserService(mockRepo);
    const user = await userService.create({ email: 'test@example.com' });
    
    expect(mockRepo.save).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(user.id).toBe('123');
  });
});

// ✅ INTEGRATION TEST - real database
describe('UserService Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  
  afterAll(async () => {
    await teardownTestDatabase();
  });
  
  it('should create user in database', async () => {
    const userService = new UserService(realRepository);
    const user = await userService.create({ email: 'test@example.com' });
    
    // Verify in database
    const saved = await database.query('SELECT * FROM users WHERE id = $1', [user.id]);
    expect(saved.email).toBe('test@example.com');
  });
});
```

**When to Use Each:**
- **Unit Tests:** Business logic, algorithms, calculations, transformations
- **Integration Tests:** API endpoints, database queries, external service calls

---

### Q2: Explain the AAA pattern in testing

**Answer:**

AAA stands for **Arrange-Act-Assert**, a standard pattern for structuring tests that makes them readable and maintainable.

**Pattern:**
1. **Arrange:** Set up test data and mocks
2. **Act:** Execute the code under test
3. **Assert:** Verify the results

**Example:**

```typescript
describe('PasswordService', () => {
  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      // ===== ARRANGE =====
      const passwordService = new PasswordService();
      const plainPassword = 'mySecurePassword123';
      
      // ===== ACT =====
      const hashedPassword = await passwordService.hashPassword(plainPassword);
      
      // ===== ASSERT =====
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(plainPassword);
      expect(hashedPassword.length).toBeGreaterThan(50);
      expect(hashedPassword.startsWith('$2b$')).toBe(true); // bcrypt format
    });
  });
  
  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      // ARRANGE
      const passwordService = new PasswordService();
      const plainPassword = 'mySecurePassword123';
      const hashedPassword = await passwordService.hashPassword(plainPassword);
      
      // ACT
      const isMatch = await passwordService.comparePassword(plainPassword, hashedPassword);
      
      // ASSERT
      expect(isMatch).toBe(true);
    });
    
    it('should return false for wrong password', async () => {
      // ARRANGE
      const passwordService = new PasswordService();
      const hashedPassword = await passwordService.hashPassword('correctPassword');
      
      // ACT
      const isMatch = await passwordService.comparePassword('wrongPassword', hashedPassword);
      
      // ASSERT
      expect(isMatch).toBe(false);
    });
  });
});
```

**Benefits:**
- Clear test structure
- Easy to understand what's being tested
- Easy to maintain
- Encourages one assertion per test concept

**Common Variation - Given/When/Then (BDD):**

```typescript
it('should reject login with wrong password', async () => {
  // GIVEN a user exists with a password
  const user = await createTestUser({ email: 'test@example.com', password: 'correct' });
  
  // WHEN attempting to login with wrong password
  const result = await authService.login('test@example.com', 'wrong');
  
  // THEN login should fail
  expect(result.success).toBe(false);
  expect(result.error).toBe('Invalid credentials');
});
```

---

### Q3: How do you mock external dependencies in unit tests?

**Answer:**

Mocking isolates the code under test by replacing external dependencies with controlled test doubles.

**Jest Mocking Techniques:**

**1. Mock Functions:**

```typescript
import { JWTService } from '../services/jwt.service';
import { UserRepository } from '../repositories/user.repository';

jest.mock('../repositories/user.repository');

describe('AuthService', () => {
  it('should generate token for valid user', async () => {
    // Mock the repository
    const mockFindByEmail = jest.fn().mockResolvedValue({
      id: '123',
      email: 'test@example.com',
      passwordHash: '$2b$10$...'
    });
    
    UserRepository.prototype.findByEmail = mockFindByEmail;
    
    const authService = new AuthService(new UserRepository(), new JWTService());
    const result = await authService.login('test@example.com', 'password');
    
    expect(mockFindByEmail).toHaveBeenCalledWith('test@example.com');
    expect(result.token).toBeDefined();
  });
});
```

**2. Manual Mocks:**

```typescript
// __mocks__/user.repository.ts
export class UserRepository {
  async findByEmail(email: string) {
    return {
      id: '123',
      email,
      passwordHash: 'hashed',
    };
  }
  
  async save(user: any) {
    return { ...user, id: '123' };
  }
}

// test file
jest.mock('../repositories/user.repository');

describe('UserService', () => {
  it('should create user', async () => {
    const userService = new UserService(new UserRepository());
    const user = await userService.create({ email: 'test@example.com' });
    
    expect(user.id).toBe('123');
  });
});
```

**3. Dependency Injection + Mock Objects:**

```typescript
class AuthService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JWTService,
    private passwordService: PasswordService
  ) {}
  
  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new Error('User not found');
    
    const isValid = await this.passwordService.compare(password, user.passwordHash);
    if (!isValid) throw new Error('Invalid password');
    
    return this.jwtService.generateToken({ userId: user.id });
  }
}

// Test with mocks
describe('AuthService', () => {
  it('should login successfully', async () => {
    // Create mock objects
    const mockUserRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        passwordHash: 'hashed'
      })
    };
    
    const mockPasswordService = {
      compare: jest.fn().mockResolvedValue(true)
    };
    
    const mockJWTService = {
      generateToken: jest.fn().mockReturnValue('token123')
    };
    
    // Inject mocks
    const authService = new AuthService(
      mockUserRepository as any,
      mockJWTService as any,
      mockPasswordService as any
    );
    
    // Test
    const result = await authService.login('test@example.com', 'password');
    
    // Assert
    expect(result).toBe('token123');
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockPasswordService.compare).toHaveBeenCalledWith('password', 'hashed');
    expect(mockJWTService.generateToken).toHaveBeenCalledWith({ userId: '123' });
  });
});
```

**4. Spies (Partial Mocking):**

```typescript
describe('DocumentService', () => {
  it('should publish event after creating document', async () => {
    const docService = new DocumentService(repository, eventPublisher);
    
    // Spy on event publisher
    const publishSpy = jest.spyOn(eventPublisher, 'publish');
    
    await docService.createDocument({ title: 'Test' });
    
    // Verify event was published
    expect(publishSpy).toHaveBeenCalledWith('document.created', expect.objectContaining({
      title: 'Test'
    }));
    
    publishSpy.mockRestore();
  });
});
```

**Best Practices:**
- ✅ Mock external systems (database, APIs, file system)
- ✅ Use dependency injection for testability
- ✅ Reset mocks between tests
- ❌ Don't mock everything - test real logic
- ❌ Don't mock implementation details

---

### Q5: How do you test async code in JavaScript?

**Answer:**

Async code requires special handling to ensure tests wait for operations to complete.

**1. Async/Await (Recommended):**

```typescript
describe('DocumentService', () => {
  it('should create document', async () => {
    const doc = await documentService.create({ title: 'Test' });
    expect(doc.id).toBeDefined();
  });
  
  it('should throw error for invalid data', async () => {
    await expect(documentService.create({}))
      .rejects
      .toThrow('Title is required');
  });
});
```

**2. Promises (done callback):**

```typescript
it('should create document', (done) => {
  documentService.create({ title: 'Test' })
    .then(doc => {
      expect(doc.id).toBeDefined();
      done();
    })
    .catch(done);
});
```

**3. Testing Race Conditions:**

```typescript
describe('CacheService', () => {
  it('should handle concurrent writes correctly', async () => {
    const cache = new CacheService();
    
    // Trigger concurrent writes
    const promises = [
      cache.set('key', 'value1'),
      cache.set('key', 'value2'),
      cache.set('key', 'value3'),
    ];
    
    await Promise.all(promises);
    
    // Last write should win
    const value = await cache.get('key');
    expect(['value1', 'value2', 'value3']).toContain(value);
  });
});
```

**4. Testing Timeouts:**

```typescript
describe('RateLimiter', () => {
  it('should reset after timeout', async () => {
    jest.useFakeTimers();
    
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
    
    // Use up the limit
    await limiter.checkLimit('user1');
    await limiter.checkLimit('user1');
    
    // Should be rate limited
    await expect(limiter.checkLimit('user1')).rejects.toThrow('Rate limit exceeded');
    
    // Fast-forward time
    jest.advanceTimersByTime(1000);
    
    // Should work again
    await expect(limiter.checkLimit('user1')).resolves.not.toThrow();
    
    jest.useRealTimers();
  });
});
```

**5. Testing Event Emitters:**

```typescript
describe('FileProcessor', () => {
  it('should emit progress events', async () => {
    const processor = new FileProcessor();
    const progressEvents: number[] = [];
    
    processor.on('progress', (percent) => {
      progressEvents.push(percent);
    });
    
    await processor.processFile('test.txt');
    
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1]).toBe(100);
  });
});
```

**6. Testing Callbacks:**

```typescript
describe('LegacyService', () => {
  it('should handle callback', (done) => {
    legacyService.doSomething((error, result) => {
      expect(error).toBeNull();
      expect(result).toBe('success');
      done();
    });
  });
  
  it('should handle callback error', (done) => {
    legacyService.doInvalidThing((error, result) => {
      expect(error).toBeDefined();
      expect(error.message).toBe('Invalid operation');
      done();
    });
  });
});
```

**Common Pitfalls:**

```typescript
// ❌ WRONG - test finishes before async operation
it('should create document', () => {
  documentService.create({ title: 'Test' });
  // Test finishes immediately!
});

// ❌ WRONG - missing await
it('should create document', async () => {
  documentService.create({ title: 'Test' }); // Missing await!
  // Assertion runs before creation completes
});

// ✅ CORRECT
it('should create document', async () => {
  const doc = await documentService.create({ title: 'Test' });
  expect(doc.id).toBeDefined();
});
```

---

## Integration Testing

### Q9: How do you set up a test database for integration tests?

**Answer:**

Integration tests need a real database, but it should be isolated from development/production data.

**Approach 1: Docker Test Containers (Recommended):**

```typescript
// test-setup.ts
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';

let postgresContainer: StartedTestContainer;
let mongoContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;

export async function setupTestDatabase() {
  // Start PostgreSQL
  postgresContainer = await new GenericContainer('postgres:15')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'bookspace_test',
    })
    .start();
  
  // Start MongoDB
  mongoContainer = await new GenericContainer('mongo:6')
    .withExposedPorts(27017)
    .start();
  
  // Start Redis
  redisContainer = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .start();
  
  // Set environment variables
  process.env.DATABASE_URL = `postgresql://test:test@localhost:${postgresContainer.getMappedPort(5432)}/bookspace_test`;
  process.env.MONGODB_URL = `mongodb://localhost:${mongoContainer.getMappedPort(27017)}/bookspace_test`;
  process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(6379)}`;
  
  // Run migrations
  await runMigrations();
}

export async function teardownTestDatabase() {
  await postgresContainer?.stop();
  await mongoContainer?.stop();
  await redisContainer?.stop();
}

// jest.config.js
module.exports = {
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
};
```

**Approach 2: Dedicated Test Database:**

```typescript
// test-db-setup.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test',
  password: 'test',
  database: 'bookspace_test',
});

export async function setupTestDatabase() {
  // Drop all tables
  await pool.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  `);
  
  // Run migrations
  await runMigrations(pool);
}

export async function cleanDatabase() {
  // Truncate all tables (faster than DROP)
  const tables = await pool.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public'
  `);
  
  for (const { tablename } of tables.rows) {
    await pool.query(`TRUNCATE TABLE ${tablename} CASCADE`);
  }
}

// In each test file
beforeEach(async () => {
  await cleanDatabase();
});
```

**Approach 3: In-Memory Database:**

```typescript
// For MongoDB - use mongodb-memory-server
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clean all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

**Full Integration Test Example:**

```typescript
// auth.integration.test.ts
import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, cleanDatabase } from './test-setup';

describe('Auth API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  
  beforeEach(async () => {
    await cleanDatabase();
  });
  
  describe('POST /auth/register', () => {
    it('should register new user', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
        });
      
      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.token).toBeDefined();
      
      // Verify user in database
      const user = await db.query('SELECT * FROM users WHERE email = $1', ['test@example.com']);
      expect(user.rows[0]).toBeDefined();
      expect(user.rows[0].name).toBe('Test User');
    });
    
    it('should reject duplicate email', async () => {
      // Create user
      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'pass', name: 'User1' });
      
      // Try to register again
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'pass', name: 'User2' });
      
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });
  
  describe('POST /auth/login', () => {
    it('should login with correct credentials', async () => {
      // Register user first
      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!', name: 'Test' });
      
      // Login
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      
      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });
  });
});
```

**Best Practices:**
- ✅ Use Docker containers for real database testing
- ✅ Clean data between tests
- ✅ Use transactions and rollback for faster cleanup
- ✅ Seed minimum required data
- ❌ Don't share state between tests
- ❌ Don't use production database for tests

---

## Load Testing

### Q16: What is the difference between load, stress, and spike testing?

**Answer:**

These are three distinct types of performance testing with different goals:

**1. Load Testing:**
- **Goal:** Verify system handles expected load
- **Pattern:** Gradual ramp-up to target load, sustain, then ramp-down
- **Metrics:** Response time, throughput at expected capacity

```javascript
// load-test.js - K6
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% errors
  },
};

export default function () {
  const response = http.get('http://localhost:3000/api/documents');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

**2. Stress Testing:**
- **Goal:** Find system breaking point
- **Pattern:** Gradually increase load beyond capacity until failure
- **Metrics:** Maximum capacity, failure mode, recovery behavior

```javascript
// stress-test.js
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Normal load
    { duration: '5m', target: 200 },   // Above normal
    { duration: '5m', target: 300 },   // Breaking point
    { duration: '5m', target: 400 },   // Beyond capacity
    { duration: '10m', target: 0 },    // Recovery
  ],
};

export default function () {
  const response = http.get('http://localhost:3000/api/search');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
```

**3. Spike Testing:**
- **Goal:** Test sudden traffic surges
- **Pattern:** Immediate jump to high load, sustain briefly, drop
- **Metrics:** Response to sudden changes, recovery time

```javascript
// spike-test.js
export const options = {
  stages: [
    { duration: '10s', target: 100 },  // Normal load
    { duration: '30s', target: 1000 }, // SUDDEN SPIKE
    { duration: '10s', target: 100 },  // Back to normal
    { duration: '10s', target: 0 },    // Recovery
  ],
};
```

**4. Soak Testing (Bonus):**
- **Goal:** Find memory leaks, resource exhaustion
- **Pattern:** Sustained load for extended period (hours)

```javascript
// soak-test.js
export const options = {
  stages: [
    { duration: '2m', target: 100 },     // Ramp up
    { duration: '8h', target: 100 },     // Sustain for 8 hours
    { duration: '2m', target: 0 },       // Ramp down
  ],
};
```

**Comparison Table:**

| Type | Duration | Load Pattern | Goal |
|------|----------|--------------|------|
| Load | Minutes | Expected capacity | Verify performance SLA |
| Stress | Hours | Beyond capacity | Find breaking point |
| Spike | Seconds-Minutes | Sudden burst | Test elasticity |
| Soak | Hours-Days | Sustained | Find resource leaks |

**Real-World Scenarios:**

```javascript
// Black Friday scenario (spike + stress)
export const options = {
  stages: [
    { duration: '5m', target: 500 },    // Normal traffic
    { duration: '1m', target: 5000 },   // SALE STARTS (spike)
    { duration: '30m', target: 5000 },  // Sustained surge (stress)
    { duration: '10m', target: 1000 },  // Traffic subsides
    { duration: '5m', target: 0 },      // End
  ],
};
```

---

### Q20: How do you identify performance bottlenecks?

**Answer:**

Identifying bottlenecks requires systematic profiling and monitoring across the stack.

**1. Application Profiling with clinic.js:**

```bash
# Install clinic
npm install -g clinic

# Profile CPU
clinic doctor -- node server.js

# Profile event loop
clinic bubbleprof -- node server.js

# Profile I/O operations
clinic flame -- node server.js
```

```typescript
// Add profiling endpoints
app.get('/profile/start', (req, res) => {
  const profiler = require('v8-profiler-next');
  profiler.startProfiling('API');
  res.send('Profiling started');
});

app.get('/profile/stop', (req, res) => {
  const profiler = require('v8-profiler-next');
  const profile = profiler.stopProfiling('API');
  
  profile.export((error, result) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(result);
    profile.delete();
  });
});
```

**2. Database Query Analysis:**

```typescript
// Enable query logging in PostgreSQL
import { Pool } from 'pg';

const pool = new Pool({
  // ... config
});

// Log slow queries
pool.on('query', (query) => {
  const startTime = Date.now();
  
  query.on('end', () => {
    const duration = Date.now() - startTime;
    
    if (duration > 100) { // Log queries over 100ms
      console.warn('Slow query detected:', {
        query: query.text,
        duration: `${duration}ms`,
        params: query.values,
      });
    }
  });
});

// Analyze with EXPLAIN
async function analyzeQuery(queryText: string) {
  const result = await pool.query(`EXPLAIN ANALYZE ${queryText}`);
  console.log(result.rows);
}
```

**3. APM (Application Performance Monitoring):**

```typescript
// New Relic example
import newrelic from 'newrelic';

app.get('/api/documents', async (req, res) => {
  // Custom transaction
  const transaction = newrelic.getTransaction();
  
  // Measure database time
  const dbSegment = newrelic.startSegment('database-query', true);
  const docs = await db.query('SELECT * FROM documents');
  dbSegment.end();
  
  // Measure cache time
  const cacheSegment = newrelic.startSegment('cache-check', true);
  const cached = await redis.get('docs');
  cacheSegment.end();
  
  res.json(docs);
});
```

**4. Load Test with Detailed Metrics:**

```javascript
// k6-bottleneck-test.js
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const dbQueryDuration = new Trend('db_query_duration');
const cacheHitRate = new Trend('cache_hit_rate');

export default function () {
  const response = http.get('http://localhost:3000/api/documents', {
    tags: { name: 'DocumentList' },
  });
  
  // Parse custom metrics from response headers
  if (response.headers['X-Db-Duration']) {
    dbQueryDuration.add(parseFloat(response.headers['X-Db-Duration']));
  }
  
  if (response.headers['X-Cache']) {
    cacheHitRate.add(response.headers['X-Cache'] === 'HIT' ? 1 : 0);
  }
}
```

**5. Custom Performance Monitoring:**

```typescript
// performance-monitor.ts
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  
  measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    
    return fn()
      .then(result => {
        this.record(name, Date.now() - start);
        return result;
      })
      .catch(error => {
        this.record(name, Date.now() - start, 'error');
        throw error;
      });
  }
  
  private record(name: string, duration: number, status = 'success') {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push(duration);
    
    // Alert on slow operations
    if (duration > 1000) {
      console.warn(`Slow operation detected: ${name} took ${duration}ms`);
    }
  }
  
  getStats(name: string) {
    const durations = this.metrics.get(name) || [];
    
    return {
      count: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
    };
  }
  
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}

// Usage
const perfMonitor = new PerformanceMonitor();

app.get('/api/documents', async (req, res) => {
  const docs = await perfMonitor.measure('document-list', async () => {
    return await documentService.list();
  });
  
  res.json(docs);
});

app.get('/metrics/performance', (req, res) => {
  res.json({
    'document-list': perfMonitor.getStats('document-list'),
    'search-query': perfMonitor.getStats('search-query'),
  });
});
```

**6. Memory Profiling:**

```typescript
// Check for memory leaks
const heapdump = require('heapdump');

app.get('/heapdump', (req, res) => {
  const filename = `/tmp/heapdump-${Date.now()}.heapsnapshot`;
  heapdump.writeSnapshot(filename, (err) => {
    if (err) return res.status(500).send(err.message);
    res.send(`Heap dump written to ${filename}`);
  });
});

// Monitor memory usage
setInterval(() => {
  const used = process.memoryUsage();
  console.log({
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  });
}, 30000);
```

**Common Bottlenecks & Solutions:**

| Bottleneck | Symptom | Solution |
|------------|---------|----------|
| N+1 Queries | High DB query count | Use joins or DataLoader |
| Missing Indexes | Slow queries | Add database indexes |
| Large Payloads | High network time | Implement pagination |
| No Caching | High response time | Add Redis caching |
| Blocking Operations | Low throughput | Use async/worker threads |
| Memory Leaks | Increasing memory | Find and fix leaks |

---

## Security

### Q25: How do you prevent SQL injection?

**Answer:**

SQL injection occurs when user input is concatenated into SQL queries. Always use parameterized queries or ORMs.

**❌ VULNERABLE CODE:**

```typescript
// NEVER DO THIS!
app.get('/users', async (req, res) => {
  const { email } = req.query;
  
  // SQL injection vulnerability!
  const query = `SELECT * FROM users WHERE email = '${email}'`;
  const users = await db.query(query);
  
  res.json(users.rows);
});

// Attack: ?email=' OR '1'='1
// Result: SELECT * FROM users WHERE email = '' OR '1'='1'
// Returns ALL users!
```

**✅ SAFE CODE - Parameterized Queries:**

```typescript
app.get('/users', async (req, res) => {
  const { email } = req.query;
  
  // Use parameterized query
  const query = 'SELECT * FROM users WHERE email = $1';
  const users = await db.query(query, [email]);
  
  res.json(users.rows);
});

// Attack attempt: ?email=' OR '1'='1
// Treats entire string as email value (safe)
```

**✅ SAFE CODE - ORM (Prisma):**

```typescript
app.get('/users', async (req, res) => {
  const { email } = req.query;
  
  // Prisma automatically parameterizes
  const users = await prisma.user.findMany({
    where: { email },
  });
  
  res.json(users);
});
```

**✅ SAFE CODE - Query Builder:**

```typescript
import { Knex } from 'knex';

app.get('/users', async (req, res) => {
  const { email, role } = req.query;
  
  // Knex query builder
  const users = await knex('users')
    .where('email', email)
    .where('role', role)
    .select('*');
  
  res.json(users);
});
```

**Input Validation:**

```typescript
import Joi from 'joi';

const userQuerySchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('admin', 'user', 'guest'),
});

app.get('/users', async (req, res) => {
  // Validate input
  const { error, value } = userQuerySchema.validate(req.query);
  
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  const users = await db.query(
    'SELECT * FROM users WHERE email = $1 AND role = $2',
    [value.email, value.role]
  );
  
  res.json(users.rows);
});
```

**Testing for SQL Injection:**

```typescript
// security-audit.test.ts
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection in email parameter', async () => {
    const maliciousInput = "' OR '1'='1";
    
    const response = await request(app)
      .get('/users')
      .query({ email: maliciousInput });
    
    // Should return empty or error, not all users
    expect(response.body.length).toBe(0);
  });
  
  it('should sanitize input with special characters', async () => {
    const inputs = [
      "'; DROP TABLE users; --",
      "1' UNION SELECT * FROM passwords--",
      "admin'--",
    ];
    
    for (const input of inputs) {
      const response = await request(app)
        .get('/users')
        .query({ email: input });
      
      // Should handle safely
      expect(response.status).not.toBe(500);
    }
  });
});
```

**Best Practices:**
- ✅ Always use parameterized queries ($1, $2, etc.)
- ✅ Use ORMs (Prisma, TypeORM) or query builders (Knex)
- ✅ Validate and sanitize ALL user input
- ✅ Use principle of least privilege for DB users
- ✅ Never concatenate user input into queries
- ✅ Test for SQL injection in security audits

---

## Performance Optimization

### Q33: What are N+1 queries and how do you fix them?

**Answer:**

N+1 queries happen when you fetch a list of items (1 query), then fetch related data for each item (N queries), resulting in N+1 total queries.

**❌ PROBLEM - N+1 Queries:**

```typescript
// Get all documents
const documents = await prisma.document.findMany(); // 1 query

// Get author for each document (N queries!)
for (const doc of documents) {
  doc.author = await prisma.user.findUnique({
    where: { id: doc.authorId }
  }); // N queries (one per document)
}

// Total: 1 + N queries
// If 100 documents: 101 queries! 😱
```

**✅ SOLUTION 1 - Join/Include:**

```typescript
// Prisma: Use include
const documents = await prisma.document.findMany({
  include: {
    author: true,  // Fetch author in same query
    comments: {
      include: {
        user: true, // Nested include
      },
    },
  },
});

// Total: 1 query with JOINs
```

```typescript
// Raw SQL: Use JOIN
const query = `
  SELECT 
    d.*,
    u.id as author_id,
    u.name as author_name,
    u.email as author_email
  FROM documents d
  LEFT JOIN users u ON d.author_id = u.id
`;

const result = await db.query(query);
```

**✅ SOLUTION 2 - DataLoader (Facebook):**

```typescript
import DataLoader from 'dataloader';

// Create DataLoader for users
const userLoader = new DataLoader(async (userIds: string[]) => {
  // Batch load all users in one query
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
  });
  
  // Return in same order as requested IDs
  return userIds.map(id => users.find(u => u.id === id));
});

// Usage
const documents = await prisma.document.findMany();

// Load all authors in ONE batched query
const documentsWithAuthors = await Promise.all(
  documents.map(async (doc) => ({
    ...doc,
    author: await userLoader.load(doc.authorId),
  }))
);

// Total: 2 queries (1 for documents, 1 batched for users)
```

**✅ SOLUTION 3 - Manual Batching:**

```typescript
// Get all documents
const documents = await prisma.document.findMany();

// Extract all author IDs
const authorIds = [...new Set(documents.map(d => d.authorId))];

// Fetch all authors in ONE query
const authors = await prisma.user.findMany({
  where: { id: { in: authorIds } },
});

// Map authors to documents
const authorMap = new Map(authors.map(a => [a.id, a]));

const documentsWithAuthors = documents.map(doc => ({
  ...doc,
  author: authorMap.get(doc.authorId),
}));

// Total: 2 queries
```

**Real-World Example - Comments with Users:**

```typescript
// ❌ N+1 Problem
async function getDocumentWithComments(docId: string) {
  const document = await prisma.document.findUnique({
    where: { id: docId },
    include: { comments: true },
  });
  
  // N+1: Fetch user for each comment
  for (const comment of document.comments) {
    comment.user = await prisma.user.findUnique({
      where: { id: comment.userId }
    });
  }
  
  return document;
}

// ✅ Fixed with nested include
async function getDocumentWithComments(docId: string) {
  return await prisma.document.findUnique({
    where: { id: docId },
    include: {
      comments: {
        include: {
          user: true,  // Single query with joins
        },
      },
    },
  });
}
```

**Detecting N+1 Queries:**

```typescript
// Enable query logging
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
  ],
});

// Log all queries
let queryCount = 0;
prisma.$on('query', (e) => {
  queryCount++;
  console.log(`Query ${queryCount}:`, e.query);
  
  if (queryCount > 5) {
    console.warn('⚠️  Possible N+1 query detected!');
  }
});

// Reset counter per request
app.use((req, res, next) => {
  queryCount = 0;
  next();
});
```

**Performance Comparison:**

```typescript
// Benchmark N+1 vs Optimized
async function benchmarkQueries() {
  // N+1 approach
  console.time('N+1');
  const docsN1 = await prisma.document.findMany();
  for (const doc of docsN1) {
    doc.author = await prisma.user.findUnique({ where: { id: doc.authorId } });
  }
  console.timeEnd('N+1');
  // N+1: 2500ms (100 documents = 101 queries)
  
  // Optimized approach
  console.time('Optimized');
  const docsOptimized = await prisma.document.findMany({
    include: { author: true },
  });
  console.timeEnd('Optimized');
  // Optimized: 50ms (1 query with JOIN)
  
  // 50x faster! 🚀
}
```

**Best Practices:**
- ✅ Use `include` or `populate` in ORMs
- ✅ Use DataLoader for GraphQL
- ✅ Batch related queries
- ✅ Monitor query count per request
- ✅ Use database query logging
- ❌ Never loop over database calls

---

## Summary

Phase 9 provides comprehensive coverage of testing and quality assurance:

**Unit Testing:** Isolate and test individual components with mocks, achieving high code coverage and fast feedback.

**Integration Testing:** Test real system interactions with databases, message queues, and external services in isolated test environments.

**Load Testing:** Use K6 to simulate realistic traffic, identify bottlenecks, and establish performance baselines.

**Security:** Prevent common vulnerabilities (SQL injection, XSS, CSRF), audit dependencies, and implement security best practices.

**Performance:** Profile applications, optimize database queries, reduce N+1 queries, improve cache hit rates, and eliminate memory leaks.

These skills are essential for building production-ready, scalable, and secure distributed systems.
