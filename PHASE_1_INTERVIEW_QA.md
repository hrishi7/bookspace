# Phase 1 - Interview Questions & Answers
## Foundation & Project Setup Concepts

Complete answers for foundational backend engineering interview questions.

---

## Q1: "Monorepo vs Polyrepo - which would you choose and why?"

**Complete Answer:**

A **monorepo** stores multiple related projects in a single repository, while a **polyrepo** uses separate repositories for each project.

### Monorepo

**Structure:**
```
bookspace/                    # Single repository
├── services/
│   ├── gateway/             # Microservice 1
│   ├── auth/                # Microservice 2
│   ├── user/                # Microservice 3
│   └── document/            # Microservice 4
├── packages/
│   ├── common/              # Shared package 1
│   ├── logger/              # Shared package 2
│   └── types/               # Shared package 3
└── package.json             # Root workspace
```

**Advantages:**
```
✅ Single source of truth
   - All code in one place
   - Easy to search across services
   - See full system at once

✅ Atomic commits
   - Change multiple services in one commit
   - Git history shows related changes together
   - No "breaking change" across repos

✅ Shared dependencies
   - Install once, use everywhere
   - Consistent versions across all services
   - No dependency hell

✅ Code sharing
   - Easy to share utilities, types, components
   - Internal packages (packages/common)
   - No need to publish to npm

✅ Easier refactoring
   - IDE can refactor across all services
   - Find all usages globally
   - Rename/move code safely

✅ Coordinated releases
   - Version all services together
   - Deploy related changes atomically
   - No version compatibility issues

✅ Better for learning
   - See how everything connects
   - Easy to navigate between services
   - Understand system architecture
```

**Disadvantages:**
```
❌ Large repository
   - Git operations slower
   - CI/CD runs for all services
   - Need build caching

❌ Shared pace
   - All teams must agree on tooling
   - Breaking changes affect everyone
   - Coordination overhead

❌ Access control
   - Harder to restrict access to specific services
   - All or nothing repository access

❌ CI/CD complexity
   - Need smart builds (only changed services)
   - Longer build times without optimization
```

### Polyrepo

**Structure:**
```
bookspace-gateway/           # Repository 1
bookspace-auth/              # Repository 2
bookspace-user/              # Repository 3
bookspace-document/          # Repository 4
bookspace-common/            # Repository 5 (npm package)
```

**Advantages:**
```
✅ Independent releases
   - Each service releases separately
   - No coordination needed
   - Teams work independently

✅ Clear ownership
   - Each team owns their repo
   - Access control per repository
   - Separate CI/CD pipelines

✅ Smaller repositories
   - Faster git operations
   - Focused codebase
   - Less cognitive overhead

✅ Technology diversity
   - Different languages per service
   - Different build tools
   - No global constraints
```

**Disadvantages:**
```
❌ Code duplication
   - Utilities copied across repos
   - Inconsistent implementations
   - Hard to keep in sync

❌ Version hell
   - Shared packages have versions
   - Compatibility matrix complexity
   - Breaking changes painful

❌ Cross-repo changes
   - Multiple PRs needed
   - Merge order matters
   - Hard to coordinate

❌ Harder refactoring
   - Can't refactor across repos
   - Breaking changes risky
   - No global find/replace

❌ Complex dependency management
   - Need private npm registry
   - Publish/version overhead
   - Circular dependencies possible
```

### Our Choice: Monorepo with npm Workspaces

**Why:**
```typescript
// package.json (root)
{
  "workspaces": [
    "services/*",    // All microservices
    "packages/*"     // All shared packages
  ]
}
```

**Reasons:**
1. **Learning project** - See how everything connects
2. **Code sharing** - Easy to share types, utilities
3. **Atomic changes** - Change auth + user service together
4. **Single setup** - One `npm install`
5. **Consistent tooling** - Same TypeScript/ESLint everywhere

**npm Workspaces Features:**
```bash
# Install dependencies for ALL workspaces
npm install

# Run script in specific workspace
npm run dev -w @bookspace/gateway

# Run script in ALL workspaces
npm run build --workspaces

# Link internal packages automatically
# @bookspace/logger available to all services
# No need to npm link manually
```

**Real-World Examples:**

**Monorepo:**
- Google: Single repo with billions of lines
- Facebook: React, Jest, all in one repo
- Babel: All plugins in one repo
- Our project: All services + packages

**Polyrepo:**
- Netflix: Separate repos per service
- Amazon: Thousands of repositories
- Most traditional enterprises

**Interview Summary:**
"I'd choose monorepo for tightly coupled services sharing code (like our microservices platform) because it enables atomic commits, easy code sharing, and consistent tooling. I'd choose polyrepo for independent teams with separate release cycles. For this project, we use monorepo with npm workspaces to share types and utilities across services while maintaining the ability to deploy services independently."

---

## Q2: "Why TypeScript? What are the benefits of strict mode?"

**Complete Answer:**

TypeScript adds **static type checking** to JavaScript, catching errors at compile-time instead of runtime.

### Why TypeScript?

**Problem JavaScript Doesn't Solve:**
```javascript
// JavaScript - compiles fine, crashes at runtime
function getUser(id) {
  const user = db.findUser(id);
  return user.name; // ❌ Runtime error if user is null
}

const userId = "123";
getUser(userId + 1); // ❌ "1231" - string concatenation bug
```

**TypeScript Solution:**
```typescript
// TypeScript - errors at compile time
function getUser(id: string): string {
  const user = db.findUser(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user.name; // ✅ TypeScript knows user is not null here
}

const userId = "123";
getUser(userId + 1); // ❌ TypeScript error: Argument of type 'number' is not assignable to parameter of type 'string'
```

### Benefits of TypeScript

**1. Catch Bugs Early**
```typescript
// Catches typos
const user = { firstName: 'John', lastName: 'Doe' };
console.log(user.fristName); // ❌ TS error: Property 'fristName' does not exist

// Catches type mismatches
function add(a: number, b: number): number {
  return a + b;
}
add("1", "2"); // ❌ TS error: Expected number, got string
```

**2. Better IDE Support**
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

function processUser(user: User) {
  user. // ← IDE autocomplete shows: id, email, name, role
}
```

**3. Self-Documenting Code**
```typescript
// Types are documentation
function createDocument(
  title: string,
  content: string,
  tags: string[],
  userId: string
): Promise<Document>

// vs JavaScript
function createDocument(title, content, tags, userId) // ❓ What types?
```

**4. Refactoring Safety**
```typescript
// Rename interface property
interface User {
  fullName: string; // Renamed from 'name'
}

// TypeScript shows ALL places that need updating
// JavaScript: Silent bugs everywhere
```

**5. Team Collaboration**
```typescript
// New developer sees clear contracts
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// No guessing what the function returns
function login(email: string, password: string): Promise<AuthTokens>
```

### Strict Mode

**Our Configuration:**
```json
{
  "compilerOptions": {
    "strict": true,                      // Enable all strict checks
    "noUnusedLocals": true,             // Error on unused variables
    "noUnusedParameters": true,         // Error on unused parameters
    "noImplicitReturns": true,          // All code paths must return
    "noFallthroughCasesInSwitch": true  // No switch fallthrough
  }
}
```

**What `strict: true` Enables:**

**1. noImplicitAny**
```typescript
// ❌ Error: Parameter implicitly has 'any' type
function process(data) { // Must specify type
  return data.value;
}

// ✅ Fixed
function process(data: { value: string }) {
  return data.value;
}
```

**2. strictNullChecks** (Most Important!)
```typescript
// Without strictNullChecks (dangerous)
const user = db.findUser(id); // Could be null
console.log(user.name); // ❌ Runtime crash if null

// With strictNullChecks (safe)
const user = db.findUser(id); // Type: User | null
console.log(user.name); // ❌ TS error: Object is possibly 'null'

// ✅ Must handle null
if (user) {
  console.log(user.name); // ✅ TypeScript knows user is not null
}
```

**3. strictFunctionTypes**
```typescript
// Ensures function parameters are contravariant (safe)
type Callback = (x: string | number) => void;

const narrowCallback: Callback = (x: string) => { // ❌ Error
  // Can't accept more specific type
};
```

**4. strictPropertyInitialization**
```typescript
class User {
  name: string; // ❌ Error: Property has no initializer
  
  // ✅ Must initialize
  name: string = '';
  // or
  constructor(name: string) {
    this.name = name;
  }
}
```

**5. noImplicitThis**
```typescript
class Component {
  value = 42;
  
  getValue() {
    return function() {
      return this.value; // ❌ Error: 'this' implicitly has type 'any'
    };
  }
}
```

### Real-World Impact

**Example from Our Code:**
```typescript
// packages/common/src/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,    // TypeScript ensures it exists
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

// Usage - IDE autocomplete + type checking
throw new AppError(404, 'Not found');
// If you forget statusCode → Compile error
// If you pass string instead of number → Compile error
```

**Gradual Adoption:**
```typescript
// Can start with JavaScript, migrate incrementally
// .ts files = strict TypeScript
// .js files = no type checking (during migration)
```

### Trade-offs

**Pros:**
✅ Catch bugs at compile time (not production!)
✅ Better IDE support (autocomplete, refactoring)
✅ Self-documenting code
✅ Easier to maintain large codebases
✅ Better team collaboration
✅ Refactoring confidence

**Cons:**
❌ Learning curve for JavaScript developers
❌ More verbose code (type annotations)
❌ Compilation step (slower dev loop)
❌ Sometimes fights you (overly strict)
❌ Type definition maintenance

**When to Use:**
- ✅ Production applications
- ✅ Team projects
- ✅ Large codebases
- ✅ Long-lived projects
- ❌ Small scripts
- ❌ Prototypes (maybe)
- ❌ Solo hackathons

**Interview Summary:**
"TypeScript catches bugs at compile-time instead of runtime through static type checking. The main benefits are IDE autocomplete, refactoring safety, and self-documenting code. We use strict mode to enforce null checks (strictNullChecks prevents null pointer errors), no implicit any (all types must be explicit), and consistent error handling. While it adds complexity, the trade-off is worth it for production applications where catching bugs early saves time and prevents outages."

---

## Q3: "Explain structured logging and why it's important in microservices"

**Complete Answer:**

**Structured logging** means logging in a consistent, machine-readable format (usually JSON) instead of plain text strings.

### Traditional Logging (Unstructured)

```javascript
// Unstructured logs - hard to parse
console.log('User login failed for user@example.com at 2024-10-15 10:30:00');
console.log('Payment processed: $99.99, user: 123, method: credit_card');
console.log(`Error: ${error.message} in ${filename}:${line}`);
```

**Problems:**
```
❌ Inconsistent format (hard to parse)
❌ Can't search efficiently ("find all login failures")
❌ Can't filter by fields ("all errors for user 123")
❌ Can't aggregate/analyze ("average payment amount")
❌ Mixing data and message
```

### Structured Logging (JSON)

```typescript
// Using Pino (our logger)
logger.info({
  event: 'user_login_failed',
  email: 'user@example.com',
  timestamp: '2024-10-15T10:30:00Z',
  ip: '192.168.1.1',
  reason: 'invalid_password'
}, 'User login failed');

logger.info({
  event: 'payment_processed',
  amount: 99.99,
  currency: 'USD',
  userId: '123',
  paymentMethod: 'credit_card',
  transactionId: 'tx_abc123'
}, 'Payment processed');
```

**Output:**
```json
{
  "level": "info",
  "time": 1697365800000,
  "event": "user_login_failed",
  "email": "user@example.com",
  "ip": "192.168.1.1",
  "reason": "invalid_password",
  "msg": "User login failed"
}
```

### Why Structured Logging?

**1. Easy to Search/Filter**
```bash
# Find all login failures in last hour
grep '"event":"user_login_failed"' logs/*.log | grep $(date -d '1 hour ago' +%s)

# In Elasticsearch/Splunk
event: "user_login_failed" AND timestamp: [now-1h TO now]
```

**2. Aggregate/Analyze**
```sql
-- In log analytics tool
SELECT COUNT(*) 
FROM logs 
WHERE event = 'payment_processed' 
  AND timestamp > NOW() - INTERVAL '1 day'
GROUP BY paymentMethod

-- Results:
-- credit_card: 1500
-- paypal: 300
-- bank_transfer: 200
```

**3. Correlation (Critical for Microservices)**
```typescript
// Gateway
logger.info({ requestId: 'abc-123', service: 'gateway' }, 'Request received');

// Auth Service
logger.info({ requestId: 'abc-123', service: 'auth' }, 'Validating token');

// User Service
logger.info({ requestId: 'abc-123', service: 'user' }, 'Fetching user');

// Now search by requestId to see complete flow across all services!
```

**4. Alerting**
```javascript
// Set up alert in monitoring system
if (count(event: "payment_failed") > 10 in last 5 minutes) {
  alert("Payment failures spike");
}
```

**5. Metrics from Logs**
```javascript
// Calculate metrics
avg(amount) WHERE event = "payment_processed" // Average payment
p95(duration) WHERE event = "api_request" // 95th percentile latency
```

### Our Implementation with Pino

**Why Pino?**
```
✅ Fast (5-10x faster than Winston/Bunyan)
✅ Low overhead (asynchronous logging)
✅ JSON by default (structured)
✅ Child loggers (context inheritance)
✅ Pretty printing in development
```

**Setup:**
```typescript
// packages/logger/src/index.ts
import pino from 'pino';

export function createLogger(config: LoggerConfig) {
  return pino({
    level: config.level || 'info',
    name: config.service,
    
    // Format
    formatters: {
      level: (label) => ({ level: label }),
    },
    
    // ISO timestamp
    timestamp: pino.stdTimeFunctions.isoTime,
    
    // Pretty print in development
    ...(config.pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  });
}
```

**Usage:**
```typescript
// Create logger
const logger = createLogger({ 
  service: 'api-gateway',
  level: 'info'
});

// Log with context
logger.info({ userId: '123', action: 'create_document' }, 'Document created');

// Output
{
  "level": "info",
  "time": "2024-10-15T10:30:00.000Z",
  "name": "api-gateway",
  "userId": "123",
  "action": "create_document",
  "msg": "Document created"
}
```

**Child Loggers (Context Inheritance):**
```typescript
// Parent logger
const logger = createLogger({ service: 'gateway' });

// Child logger with request context
app.use((req, res, next) => {
  req.log = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// All logs from this request include context automatically
req.log.info({ userId: '123' }, 'User authenticated');

// Output includes both parent and child context
{
  "level": "info",
  "service": "gateway",
  "requestId": "abc-123",
  "method": "POST",
  "path": "/auth/login",
  "ip": "192.168.1.1",
  "userId": "123",
  "msg": "User authenticated"
}
```

### Log Levels

```typescript
logger.trace({ detail: 'x' }, 'Very detailed'); // Development only
logger.debug({ state: {} }, 'Debug info');      // Development
logger.info({ event: 'x' }, 'Normal event');    // Production
logger.warn({ issue: 'x' }, 'Warning');         // Production
logger.error({ error: err }, 'Error occurred'); // Production
logger.fatal({ error: err }, 'Fatal error');    // Production, then exit
```

**When to Use Each Level:**
```
trace: Function entry/exit, variable values (very noisy)
debug: State changes, conditional branches (noisy)
info: Business events, user actions (normal volume)
warn: Deprecated usage, unusual but handled (rare)
error: Errors that affect operation (should investigate)
fatal: System can't function (should page on-call)
```

### Microservices Context

**Problem:**
```
Request flows: Gateway → Auth → User → Database

Without structured logs:
gateway.log:  "Request received"
auth.log:     "Token validated"
user.log:     "User fetched"

Question: Which token validation goes with which request?
Answer: Impossible to tell!
```

**Solution with Structured Logging:**
```typescript
// Gateway generates requestId
const requestId = uuidv4();
logger.info({ requestId, service: 'gateway' }, 'Request received');

// Forward to Auth Service with header
axios.get(authUrl, {
  headers: { 'X-Request-ID': requestId }
});

// Auth Service extracts requestId
const requestId = req.headers['x-request-id'];
logger.info({ requestId, service: 'auth' }, 'Token validated');

// Now search logs by requestId to see complete flow!
SELECT * FROM logs WHERE requestId = 'abc-123' ORDER BY timestamp
```

### Best Practices

**1. Always Include Context**
```typescript
// ❌ Bad
logger.info('User created');

// ✅ Good
logger.info({ 
  userId: user.id,
  email: user.email,
  role: user.role 
}, 'User created');
```

**2. Use Consistent Event Names**
```typescript
// ❌ Bad - inconsistent
logger.info({ event: 'user_created' });
logger.info({ event: 'UserUpdated' });
logger.info({ event: 'user-deleted' });

// ✅ Good - snake_case convention
logger.info({ event: 'user_created' });
logger.info({ event: 'user_updated' });
logger.info({ event: 'user_deleted' });
```

**3. Don't Log Sensitive Data**
```typescript
// ❌ Very bad
logger.info({ password: user.password }, 'User logged in');

// ✅ Good
logger.info({ userId: user.id }, 'User logged in');
```

**4. Include Error Stack Traces**
```typescript
// ✅ Full error context
try {
  await processPayment();
} catch (error) {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    userId,
    amount
  }, 'Payment processing failed');
}
```

**Interview Summary:**
"Structured logging uses JSON format instead of plain text, making logs machine-readable. This is critical for microservices because it enables searching by fields (find all errors for user X), correlation across services (using request IDs), and generating metrics from logs. We use Pino for fast, structured logging with child loggers that inherit context. Each request gets a correlation ID that flows through all services, allowing us to trace the complete request lifecycle across the distributed system."

---

## Q4: "What are the benefits of shared packages in a monorepo?"

**Complete Answer:**

**Shared packages** are internal libraries that multiple services can use, avoiding code duplication and ensuring consistency.

### Our Shared Packages

```
packages/
├── logger/     # Structured logging (Pino wrapper)
├── common/     # Utilities, errors, validators
└── types/      # TypeScript interfaces
```

### 1. Logger Package

**Purpose:** Centralized logging configuration

**Without Shared Package:**
```typescript
// Gateway service
import pino from 'pino';
const logger = pino({ level: 'info', ... }); // Config 1

// Auth service
import pino from 'pino';
const logger = pino({ level: 'debug', ... }); // Config 2 (different!)

// User service
import pino from 'pino';
const logger = pino({ ... }); // Config 3 (different again!)

// Problems:
❌ Inconsistent log formats
❌ Duplicated configuration
❌ Hard to change globally
```

**With Shared Package:**
```typescript
// packages/logger/src/index.ts
export function createLogger(config) {
  return pino({
    // Centralized configuration
    level: config.level,
    formatters: { ... },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

// All services use same configuration
// Gateway
import { createLogger } from '@bookspace/logger';
const logger = createLogger({ service: 'gateway' });

// Auth
import { createLogger } from '@bookspace/logger';
const logger = createLogger({ service: 'auth' });

// Benefits:
✅ Consistent log format across all services
✅ Change once, affects all services
✅ Type-safe configuration
```

### 2. Common Package

**Purpose:** Shared utilities, errors, validators

**Error Classes:**
```typescript
// packages/common/src/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

// All services use same error classes
// Gateway
throw new NotFoundError('Route not found');

// User Service
throw new NotFoundError('User not found');

// Benefits:
✅ Consistent error responses
✅ Same HTTP status codes
✅ Centralized error handling logic
✅ Type-safe error throwing
```

**Utility Functions:**
```typescript
// packages/common/src/utils.ts

// Retry with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  // Implementation...
}

// All services use same retry logic
// Document Service
const doc = await retry(() => db.documents.findOne(id));

// File Service
const file = await retry(() => s3.getObject(key));

// Benefits:
✅ Consistent retry behavior
✅ Battle-tested implementation
✅ One place to fix bugs
✅ Easy to add features (metrics, logging)
```

**Validators:**
```typescript
// packages/common/src/validators.ts
import { z } from 'zod';

export const emailSchema = z.string().email();
export const passwordSchema = z.string()
  .min(8)
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[0-9]/, 'Must contain number');

export const paginationSchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
});

// All services validate consistently
// Auth Service
const { email, password } = z.object({
  email: emailSchema,
  password: passwordSchema
}).parse(req.body);

// User Service - same validation rules
const { email } = z.object({
  email: emailSchema
}).parse(req.body);

// Benefits:
✅ Consistent validation rules
✅ Same error messages
✅ Type-safe schemas
✅ Update once, applies everywhere
```

### 3. Types Package

**Purpose:** Shared TypeScript interfaces

**Without Shared Types:**
```typescript
// Auth Service
interface User {
  id: string;
  email: string;
  name: string;
}

// User Service (duplicate!)
interface User {
  id: string;
  email: string;
  name: string;
  // Oops, forgot to add new field here
}

// Problems:
❌ Duplicate type definitions
❌ Types drift over time
❌ No compile error if mismatch
```

**With Shared Types:**
```typescript
// packages/types/src/index.ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// All services import same types
// Auth Service
import { User, AuthTokens } from '@bookspace/types';
function login(email: string, password: string): Promise<AuthTokens>

// User Service
import { User, UserRole } from '@bookspace/types';
function getUser(id: string): Promise<User>

// Benefits:
✅ Single source of truth
✅ Type safety across services
✅ Refactoring safety (change once, TypeScript shows all affected code)
✅ Service contract (services agree on data structure)
```

### Benefits Summary

**1. Code Reuse**
```
Without: Copy-paste code across services
With: Import from shared package
Result: DRY (Don't Repeat Yourself)
```

**2. Consistency**
```
Without: Each service does things differently
With: All services use same utilities
Result: Predictable behavior, easier debugging
```

**3. Single Source of Truth**
```
Without: N copies of utility function
With: One implementation
Result: Fix bug once, applies everywhere
```

**4. Type Safety**
```
Without: Services might use different data structures
With: Shared TypeScript interfaces
Result: Compile errors if mismatch
```

**5. Easy Updates**
```
Without: Update in 10 places
With: Update in 1 place
Result: Less error- prone, faster iteration
```

**6. Testing**
```
Without: Test same logic in each service
With: Test shared package once
Result: Better test coverage, less duplication
```

### How npm Workspaces Makes This Easy

**Automatic Linking:**
```json
// package.json (root)
{
  "workspaces": ["services/*", "packages/*"]
}

// Gateway's package.json
{
  "dependencies": {
    "@bookspace/logger": "^1.0.0",
    "@bookspace/common": "^1.0.0"
  }
}

// npm automatically links local packages
// No need for npm link or npm publish
```

**Development Workflow:**
```bash
# Make change to shared package
cd packages/logger
# Edit src/index.ts

# Rebuild
npm run build

# All services now see the change
cd ../../services/gateway
npm run dev
# Uses updated logger automatically
```

### Real-World Examples

**Google:**
- Shared protobuf definitions
- Common RPC framework
- Shared utilities (Guava, etc.)

**Facebook:**
- Shared React components
- Common GraphQL types
- Shared build tools

**Our Project:**
- `@bookspace/logger` - Logging
- `@bookspace/common` - Utilities, errors
- `@bookspace/types` - TypeScript interfaces

**Interview Summary:**
"Shared packages in a monorepo provide code reuse, consistency, and type safety across services. We have three shared packages: logger (centralized Pino configuration), common (utilities, errors, validators), and types (TypeScript interfaces). This ensures all services log the same way, handle errors consistently, and agree on data structures. npm workspaces automatically links packages, making development seamless - change a shared package once, and all services see the update immediately."

---

## Q5: "Explain your Docker Compose setup and why each service is needed"

**Complete Answer:**

Docker Compose orchestrates multiple containers, letting us run the entire infrastructure with one command.

### Our Infrastructure

```yaml
version: '3.8'

services:
  postgres:   # Relational database
  mongodb:    # Document database
  redis:      # Cache + rate limiting
  rabbitmq:   # Message queue
  prometheus: # Metrics
  grafana:    # Visualization
```

### 1. PostgreSQL (Relational Database)

**Purpose:** Store structured, relational data

```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_USER: bookspace
    POSTGRES_PASSWORD: bookspace_dev_password
    POSTGRES_DB: bookspace
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U bookspace"]
    interval: 10s
```

**What We Store:**
```sql
-- Users (structured data with relationships)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  created_at TIMESTAMP
);

-- Notifications (references users)
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR NOT NULL,
  read BOOLEAN DEFAULT FALSE
);
```

**Why PostgreSQL?**
```
✅ ACID transactions (critical for user accounts)
✅ Foreign keys (data integrity)
✅ Complex queries with JOINs
✅ Mature, battle-tested
✅ Great for structured data

Use cases:
- User accounts (need transactions)
- Financial data (need ACID)
- Relationships (need JOINs)
```

### 2. MongoDB (Document Database)

**Purpose:** Store flexible, nested documents

```yaml
mongodb:
  image: mongo:7
  ports:
    - "27017:27017"
  volumes:
    - mongo_data:/data/db
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
```

**What We Store:**
```javascript
// Documents with nested structure
{
  _id: ObjectId("..."),
  title: "API Design Guide",
  content: "...",
  tags: ["api", "design", "rest"],
  versions: [  // Nested array
    {
      version: 1,
      content: "Original content",
      updatedAt: ISODate("...")
    },
    {
      version: 2,
      content: "Updated content",
      updatedAt: ISODate("...")
    }
  ],
  createdBy: "user123",
  createdAt: ISODate("...")
}

// Comments (nested tree structure)
{
  docId: "doc123",
  text: "Great article!",
  parentId: null,  // Top-level comment
  replies: [...]   // Nested replies
}
```

**Why MongoDB?**
```
✅ Flexible schema (documents can vary)
✅ Nested data (versions, comments)
✅ Horizontal scaling (sharding)
✅ Fast for read-heavy workloads
✅ JSON-like documents

Use cases:
- Documents with versions (flexible structure)
- Nested comments (tree structure)
- Content management
- Rapidly evolving schemas
```

### 3. Redis (In-Memory Data Store)

**Purpose:** Caching, rate limiting, session storage

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
```

**What We Store:**
```redis
# Cache (key-value with TTL)
SET doc:123 '{"title":"...","content":"..."}' EX 300  # 5 min TTL
GET doc:123  # Fast retrieval

# Rate limiting (atomic counters)
INCR rl:192.168.1.1  # Increment request count
EXPIRE rl:192.168.1.1 900  # 15 min window

# Token blacklist (set with TTL)
SETEX blacklist:token123 900 "1"  # Blacklist for 15 min
EXISTS blacklist:token123  # Check if blacklisted

# Refresh tokens
SETEX refresh:user123:token456 604800 '{"userId":"123"}'  # 7 days
```

**Why Redis?**
```
✅ Extremely fast (<1ms read/write)
✅ In-memory (no disk I/O)
✅ TTL support (auto-expiration)
✅ Atomic operations (no race conditions)
✅ Distributed (multiple instances share state)

Use cases:
- Caching (reduce database load)
- Rate limiting (distributed counters)
- Token blacklist (fast lookups)
- Session storage
```

### 4. RabbitMQ (Message Queue)

**Purpose:** Asynchronous messaging between services

```yaml
rabbitmq:
  image: rabbitmq:3-management-alpine
  environment:
    RABBITMQ_DEFAULT_USER: bookspace
    RABBITMQ_DEFAULT_PASS: bookspace_dev_password
  ports:
    - "5672:5672"    # AMQP port
    - "15672:15672"  # Management UI
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
```

**What We Send:**
```javascript
// Document created event
{
  event: "doc.created",
  data: {
    docId: "doc123",
    userId: "user456",
    title: "New Document",
    timestamp: "2024-10-15T10:30:00Z"
  }
}

// Consumers:
// - Notification Worker → Creates notification
// - Search Worker → Updates search index
// - Analytics Worker → Records metric
```

**Why RabbitMQ?**
```
✅ Decouple services (pub/sub pattern)
✅ Reliable delivery (acknowledge/retry)
✅ Dead Letter Queue (handle failures)
✅ Load leveling (absorb traffic spikes)
✅ Asynchronous processing (don't block user)

Use cases:
- Event notifications (doc created → notify users)
- Background jobs (send email, process image)
- Microservice communication
- Task queues
```

### 5. Prometheus (Metrics)

**Purpose:** Collect and store metrics

```yaml
prometheus:
  image: prom/prometheus:latest
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
```

**What It Collects:**
```
# Scrapes /metrics endpoint from each service
http_requests_total{method="GET",route="/users",status="200"} 1500
http_request_duration_seconds_bucket{le="0.1"} 1200
```

**Why Prometheus?**
```
✅ Pull-based (services expose /metrics)
✅ Time-series database (stores history)
✅ PromQL (powerful query language)
✅ Alerting (can trigger alerts)
✅ Industry standard

Use cases:
- RED metrics (Rate, Errors, Duration)
- System metrics (CPU, memory)
- Business metrics (signups, payments)
- SLO tracking
```

### 6. Grafana (Visualization)

**Purpose:** Visualize metrics from Prometheus

```yaml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  environment:
    GF_SECURITY_ADMIN_USER: admin
    GF_SECURITY_ADMIN_PASSWORD: admin
  volumes:
    - grafana_data:/var/lib/grafana
  depends_on:
    - prometheus
```

**What You See:**
```
Dashboards with:
- Request rate graph (requests/sec over time)
- Error rate graph (% errors)
- Latency graph (p50, p95, p99)
- System metrics (CPU, memory)
```

**Why Grafana?**
```
✅ Beautiful dashboards
✅ Prometheus integration
✅ Alerting UI
✅ Multiple data sources
✅ Community templates

Use cases:
- Monitor system health
- Debug performance issues
- Track SLOs
- On-call dashboard
```

### Polyglot Persistence Strategy

**SQL vs NoSQL - Why Both?**

```
PostgreSQL (SQL):
✓ Use when: Structured data, relationships, transactions
✓ Example: User accounts (foreign keys, transactions)

MongoDB (NoSQL):
✓ Use when: Flexible schema, nested data, read-heavy
✓ Example: Documents with versions (nested arrays)

Redis:
✓ Use when: Fast access, temporary data, distributed state
✓ Example: Caching, rate limiting
```

**Interview Answer:**
"We use polyglot persistence - choosing the best database for each use case. SQL (PostgreSQL) for users (need ACID transactions and relationships), NoSQL (MongoDB) for documents (flexible schema and nested versions), and Redis for caching/rate limiting (speed and TTL support)."

### Development Workflow

```bash
# Start all infrastructure
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f postgres

# Stop everything
docker-compose down

# Stop and remove data
docker-compose down -v
```

### Production Considerations

**Docker Compose is for development only:**
```
Development: Docker Compose (single machine)
Production: Kubernetes (distributed)

Why?
- Docker Compose: No high availability
- Docker Compose: No auto-scaling
- Docker Compose: No rolling updates
- Kubernetes: All of above + more
```

**Interview Summary:**
"We use Docker Compose to orchestrate six infrastructure services: PostgreSQL for structured data (users, transactions), MongoDB for flexible documents (content with versions), Redis for fast caching and rate limiting, RabbitMQ for async messaging, Prometheus for metrics collection, and Grafana for visualization. This follows polyglot persistence - using the best database for each use case. Docker Compose makes local development easy (start everything with one command), but we'd use Kubernetes in production for high availability and scaling."

---

## Common Follow-Up Questions

### "How do you handle database migrations in a monorepo?"

**Answer:**
```typescript
// Each service manages its own migrations
services/user/
  prisma/
    migrations/
      001_create_users.sql
      002_add_role.sql

// Run migrations per service
cd services/user
npx prisma migrate deploy

// In CI/CD: Run migrations before deployment
```

### "How do you version shared packages?"

**Answer:**
```json
// Workspaces use workspace: protocol
{
  "dependencies": {
    "@bookspace/logger": "workspace:*"
  }
}

// Always uses local version during development
// For publishing: Use semantic versioning (1.0.0, 1.1.0)
```

### "What about circular dependencies between services?"

**Answer:**
"Services shouldn't depend on each other directly - they communicate via:
1. HTTP requests (through gateway)
2. Message queue events (async)
3. Shared packages (utilities only, no business logic)

This prevents circular dependencies and keeps services independent."

---

**You're now ready to explain all Phase 1 foundational concepts in interviews!** 🚀

All concepts are implemented in:
- `packages/` - Shared packages
- `docker-compose.yml` - Infrastructure setup
- Root `package.json` - Workspace configuration
