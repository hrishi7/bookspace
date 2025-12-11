# Phase 9: Testing & Quality - Best Practices

## Testing Principles

### 1. Test Pyramid

Follow the test pyramid for balanced testing strategy:

```
           /\
          /  \          E2E Tests (10%)
         /    \         - Slow, brittle
        /------\        - Test critical user flows
       /        \       
      /          \      Integration Tests (30%)
     /            \     - Test component interactions
    /--------------\    - Real dependencies
   /                \   
  /                  \  Unit Tests (60%)
 /____________________\ - Fast, focused
                        - Test isolated logic
```

**Rationale:**
- Unit tests are cheap and fast → write many
- Integration tests are slower → write selectively
- E2E tests are expensive → write sparingly

### 2. AAA Pattern

Structure all tests using Arrange-Act-Assert:

```typescript
it('should do something', () => {
  // ARRANGE - Set up test data
  const input = { foo: 'bar' };
  const expected = { foo: 'bar', processed: true };
  
  // ACT - Execute the code
  const result = processData(input);
  
  // ASSERT - Verify the result
  expect(result).toEqual(expected);
});
```

### 3. Test Independence

Each test should be completely independent:

```typescript
// ❌ BAD - Tests depend on execution order
let user;
it('should create user', async () => {
  user = await createUser();
});
it('should update user', async () => {
  await updateUser(user.id); // Depends on previous test!
});

// ✅ GOOD - Each test is independent
describe('UserService', () => {
  let user;
  
  beforeEach(async () => {
    user = await createUser(); // Fresh user for each test
  });
  
  it('should create user', async () => {
    expect(user.id).toBeDefined();
  });
  
  it('should update user', async () => {
    await updateUser(user.id);
    // Test is independent
  });
});
```

## What to Test

### ✅ DO Test

1. **Business Logic**
   ```typescript
   // Test calculations, transformations, algorithms
   describe('calculateDiscount', () => {
     it('should apply 10% discount for orders over $100', () => {
       expect(calculateDiscount(150)).toBe(15);
     });
   });
   ```

2. **Edge Cases**
   ```typescript
   describe('divide', () => {
     it('should handle division by zero', () => {
       expect(() => divide(10, 0)).toThrow('Division by zero');
     });
     
     it('should handle negative numbers', () => {
       expect(divide(-10, 2)).toBe(-5);
     });
   });
   ```

3. **Error Handling**
   ```typescript
   it('should throw error for invalid input', async () => {
     await expect(createUser({ email: 'invalid' }))
       .rejects
       .toThrow('Invalid email');
   });
   ```

4. **Integration Points**
   ```typescript
   it('should save to database', async () => {
     const user = await userService.create({ email: 'test@ex.com' });
     const saved = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
     expect(saved).toBeDefined();
   });
   ```

### ❌ DON'T Test

1. **Third-Party Libraries** - Trust they work
2. **Trivial Code** - Getters, setters
3. **Implementation Details** - Private methods
4. **Framework Code** - Express.js, React, etc.

## Code Coverage

### Target: 80% Minimum

```json
// jest.config.js
{
  "coverageThresholds": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### Coverage ≠ Quality

```typescript
// ❌ 100% coverage, BAD test
it('should process user', () => {
  processUser({ name: 'Test' }); // No assertions!
});

// ✅ Lower coverage, GOOD test
it('should process user correctly', () => {
  const result = processUser({ name: 'Test' });
  expect(result.name).toBe('Test');
  expect(result.processed).toBe(true);
});
```

## Load Testing Best Practices

### 1. Realistic Scenarios

```javascript
// Model real user behavior
export default function () {
  // Login
  const loginRes = http.post('/auth/login', credentials);
  sleep(2); // User reads content
  
  // Browse documents
  http.get('/api/documents');
  sleep(3);
  
  // Search
  http.get('/api/search?q=test');
  sleep(5);
  
  // Logout
  http.post('/auth/logout');
}
```

### 2. Gradual Ramp-Up

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Warm up
    { duration: '5m', target: 50 },   // Normal load
    { duration: '2m', target: 100 },  // Peak
    { duration: '3m', target: 100 },  // Sustain
    { duration: '2m', target: 0 },    // Cool down
  ],
};
```

### 3. Clear Thresholds

```javascript
export const options = {
  thresholds: {
    'http_req_duration': ['p(95)<500'],     // 95% under 500ms
    'http_req_duration{name:Login}': ['p(99)<300'], // Login specifically
    'http_req_failed': ['rate<0.01'],       // <1% errors
    'http_reqs': ['rate>100'],              // >100 req/s
  },
};
```

## Security Testing

### 1. Test All OWASP Top 10

- SQL Injection
- XSS
- Broken Authentication
- Sensitive Data Exposure
- XML External Entities (XXE)
- Broken Access Control
- Security Misconfiguration
- Insecure Deserialization
- Known Vulnerabilities
- Insufficient Logging

### 2. Automate Security Checks

```bash
# npm audit
npm audit --audit-level=moderate

# OWASP Dependency Check
dependency-check --project BookSpace --scan .

# Snyk
snyk test
```

### 3. Input Validation Tests

```typescript
const maliciousInputs = [
  "'; DROP TABLE users; --",
  "<script>alert('XSS')</script>",
  "../../../etc/passwd",
  "' OR '1'='1",
];

for (const input of maliciousInputs) {
  it(`should handle ${input} safely`, () => {
    // Test handling
  });
}
```

## Performance Testing

### 1. Establish Baselines

```typescript
// performance-baseline.ts
export const baselines = {
  'GET /api/documents': {
    p50: 50,   // 50ms median
    p95: 200,  // 200ms 95th percentile
    p99: 500,  // 500ms 99th percentile
  },
  'POST /api/documents': {
    p50: 100,
    p95: 400,
    p99: 800,
  },
};
```

### 2. Monitor Degradation

```typescript
it('should not degrade performance', async () => {
  const iterations = 1000;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await service.process();
    times.push(Date.now() - start);
  }
  
  const p95 = percentile(times, 0.95);
  expect(p95).toBeLessThan(baselines['process'].p95);
});
```

## CI/CD Integration

### 1. Fast Feedback Loop

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      # Unit tests - Fast
      - name: Unit Tests
        run: npm run test:unit
        timeout-minutes: 5
      
      # Integration tests - Slower
      - name: Integration Tests
        run: npm run test:integration
        timeout-minutes: 15
      
      # Coverage
      - name: Coverage
        run: npm run test:coverage
      
      # Security audit
      - name: Security Audit
        run: npm run security:audit
```

### 2. Fail Fast

- Run unit tests first (fast)
- Run integration tests after
- Run E2E tests last (slow)

### 3. Parallel Execution

```typescript
// jest.config.js
{
  maxWorkers: '50%', // Use 50% of CPU cores
}
```

## Common Pitfalls

### 1. Flaky Tests

```typescript
// ❌ Flaky - depends on timing
it('should process async', (done) => {
  processAsync();
  setTimeout(() => {
    expect(result).toBe('done');
    done();
  }, 100); // What if it takes 101ms?
});

// ✅ Reliable - wait for completion
it('should process async', async () => {
  await processAsync();
  expect(result).toBe('done');
});
```

### 2. Test Pollution

```typescript
// ❌ Shared mutable state
const cache = new Map();

it('test 1', () => {
  cache.set('key', 'value1');
});

it('test 2', () => {
  cache.set('key', 'value2'); // Pollutes test 1!
});

// ✅ Clean state
beforeEach(() => {
  cache.clear();
});
```

### 3. Testing Implementation Details

```typescript
// ❌ Tests implementation
it('should call internal method', () => {
  const spy = jest.spyOn(service, '_internalMethod');
  service.execute();
  expect(spy).toHaveBeenCalled();
});

// ✅ Tests behavior
it('should return correct result', () => {
  const result = service.execute();
  expect(result).toBe('expected');
});
```

## Conclusion

Good testing is a balance of:
- Speed vs Coverage
- Unit vs Integration
- Isolation vs Reality
- Automation vs Manual

Aim for:
- Fast, reliable tests
- High confidence
- Easy maintenance
- Clear purpose
