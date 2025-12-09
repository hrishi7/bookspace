# Phase 1: Foundation & Project Setup - Learning Guide

## 🎓 What You've Built

You've just created the **foundation** of a production-grade distributed REST API system. Let's break down every concept and understand the "why" behind each decision.

---

## 1. Monorepo with npm Workspaces

### What is it?
A **monorepo** is a single repository containing multiple related projects (packages/services). npm workspaces is Node.js's built-in tool for managing monorepos.

### Why use it?
```
✅ Single source of truth - all code in one place
✅ Shared dependencies - install once, use everywhere
✅ Atomic commits - change multiple services in one commit
✅ Easier refactoring - rename/move code across services
✅ Coordinated releases - version all services together
```

### How it works
In `package.json`, we defined:
```json
"workspaces": [
  "services/*",    // All folders in services/
  "packages/*"     // All folders in packages/
]
```

This tells npm that each folder under `services/` and `packages/` is an independent package.

### Key Commands
```bash
# Install dependencies for ALL workspaces
npm install

# Run script in specific workspace
npm run build -w @bookspace/logger

# Run script in ALL workspaces
npm run test --workspaces
```

### Interview Question: "Monorepo vs Polyrepo?"
**Answer**: 
- **Monorepo**: Single repo with multiple projects. Best for tightly coupled services sharing code.
- **Polyrepo**: Separate repos for each service. Best for independent teams/services.

For our system, monorepo is perfect because:
1. Services share types, utilities, and logging
2. We're learning/building everything together
3. Easy to maintain consistency

---

## 2. TypeScript Configuration

### What is it?
TypeScript adds **static typing** to JavaScript, catching errors before runtime.

### Why strict mode?
Look at our `tsconfig.json`:
```json
{
  "strict": true,                      // Enable all strict checks
  "noUnusedLocals": true,             // Error on unused variables
  "noImplicitReturns": true,          // All code paths must return
  "noFallthroughCasesInSwitch": true  // Prevent switch fallthrough bugs
}
```

**Strict mode catches bugs early**:
```typescript
// Without strict: compiles but crashes at runtime
function getUser(id) {
  const user = db.findUser(id);
  return user.name; // ❌ Crashes if user is null
}

// With strict: TypeScript forces you to handle null
function getUser(id: string): string {
  const user = db.findUser(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user.name; // ✅ Safe
}
```

### Interview Question: "Why TypeScript in production?"
**Answer**:
1. **Catch bugs at compile time** - not in production
2. **Better IDE support** - autocomplete, refactoring
3. **Self-documenting code** - types serve as documentation
4. **Easier refactoring** - TypeScript catches all breaking changes
5. **Team scalability** - new developers understand code faster

---

## 3. Shared Packages Architecture

We created 3 shared packages. Let's understand each:

### 📦 @bookspace/logger (Structured Logging with Pino)

#### What is Pino?
**Pino** is a fast, **structured logging** library for Node.js.

#### Structured vs Regular Logging
```javascript
// ❌ Regular logging - hard to parse/search
console.log('User login failed for user@example.com at 2023-10-15');

// ✅ Structured logging - machine-readable JSON
logger.info({
  event: 'login_failed',
  email: 'user@example.com',
  timestamp: '2023-10-15T10:30:00Z',
  ip: '192.168.1.1'
});
```

**Why structured?**
1. **Easy to search**: "Find all login failures in last hour"
2. **Metrics**: Count events, calculate rates
3. **Alerting**: Trigger alerts on specific patterns
4. **Debugging**: See complete context of errors

#### Pino Performance
Pino is **5-10x faster** than Winston/Bunyan because:
- Minimal overhead - async logging
- Single JSON.stringify call
- Child loggers reuse parent config

#### Child Loggers
```typescript
// Parent logger
const logger = createLogger({ service: 'api-gateway' });

// Child logger with request context
app.use((req, res, next) => {
  req.log = logger.child({ requestId: uuid() });
  next();
});

// All logs from this request include requestId
req.log.info({ userId: 123 }, 'User authenticated');
// Output: {"level":"info","requestId":"abc-123","userId":123,"msg":"User authenticated"}
```

#### Interview Question: "Why structured logging?"
**Answer**: In distributed systems with multiple services, structured logging lets you:
1. **Correlate requests** across services (using requestId)
2. **Search/filter** logs efficiently (e.g., all errors for user X)
3. **Generate metrics** from logs (count events, calculate latency)
4. **Set up alerts** (trigger when error rate > threshold)

---

### 📦 @bookspace/common (Shared Utilities)

#### Error Classes
We created custom error classes with HTTP status codes:

```typescript
class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(404, message);
  }
}
```

**Why custom errors?**
```typescript
// In service
if (!user) {
  throw new NotFoundError('User not found');
}

// In error middleware - knows what status code to return
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }
  // Unknown error - 500
  res.status(500).json({ error: 'Internal Server Error' });
});
```

**Benefits**:
1. Consistent error responses
2. Automatic status codes
3. Type-safe error handling
4. Easy to add error tracking (Sentry, etc.)

#### Retry with Exponential Backoff
```typescript
const data = await retry(
  () => fetchDataFromAPI(),
  3, // max attempts
  (attempt, error) => logger.warn({ attempt, error }, 'Retrying...')
);
```

**What is exponential backoff?**
```
Attempt 1: Wait 1 second
Attempt 2: Wait 2 seconds
Attempt 3: Wait 4 seconds
Attempt 4: Wait 8 seconds
```

**Why exponential?**
- Gives service time to recover
- Prevents overwhelming a failing service
- Adds jitter (randomness) to prevent "thundering herd"

**Thundering herd**: When 1000 requests fail simultaneously and all retry at the exact same time, overwhelming the service again.

#### Interview Question: "How do you handle transient failures?"
**Answer**: Use retry with exponential backoff:
1. Identify **transient** errors (network timeout) vs **permanent** (validation error)
2. Only retry transient errors
3. Use exponential backoff with jitter
4. Set max retries (avoid infinite loops)
5. Log retry attempts for debugging

---

### 📦 @bookspace/types (Shared TypeScript Types)

#### Why separate types package?
```typescript
// All services use the same User type
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Auth service creates user
const user: User = await createUser(data);

// Document service uses user
function createDocument(user: User, content: string) {
  // TypeScript knows user.id, user.email exist
}
```

**Benefits**:
1. **Type safety** across services
2. **Single source of truth** for data models
3. **Refactoring** - change type once, all services update
4. **Contract** - services agree on data structure

#### DTO (Data Transfer Object) Pattern
```typescript
export interface User {
  // Internal - includes sensitive data
  id: string;
  email: string;
  password: string; // ❌ Never send to client
}

export interface UserDTO {
  // External - safe to send to client
  id: string;
  email: string;
  // No password! ✅
}
```

**Use case**:
```typescript
// Service layer - works with full User
const user = await db.findUser(id);

// Controller - sends UserDTO to client
const userDTO: UserDTO = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role
};
res.json(userDTO); // Password not leaked ✅
```

---

## 4. Docker Compose Infrastructure

### What is Docker Compose?
Tool to run **multiple containers** together with a single command.

### Our Stack
```yaml
services:
  postgres:   # Relational database for users
  mongodb:    # Document database for docs
  redis:      # Cache + rate limiting
  rabbitmq:   # Message queue
  prometheus: # Metrics collection
  grafana:    # Metrics visualization
```

### Why this combination?

#### PostgreSQL (Relational DB)
**Use for**: Users, notifications (structured data with relationships)
```
✅ ACID transactions
✅ Foreign keys & constraints
✅ Complex queries with JOINs
```

#### MongoDB (Document DB)
**Use for**: Documents, comments (flexible schema, nested data)
```
✅ Schema flexibility
✅ Nested documents (versions array)
✅ Horizontal scaling
```

#### Redis (In-Memory Store)
**Use for**: Caching, rate limiting, session storage
```
✅ Extremely fast (in-memory)
✅ TTL (auto-expiration)
✅ Atomic operations
```

#### RabbitMQ (Message Queue)
**Use for**: Async tasks, event-driven communication
```
✅ Reliable delivery
✅ Retry & DLQ support
✅ Decouples services
```

### Interview Question: "SQL vs NoSQL?"
**Answer**: Use **both** (polyglot persistence):

**SQL (PostgreSQL)** when you need:
- ACID transactions (money transfers)
- Complex relationships (user → posts → comments)
- Data integrity (foreign keys)

**NoSQL (MongoDB)** when you need:
- Flexible schema (document versioning)
- Nested data (comments tree)
- Horizontal scaling

Our system uses:
- **PostgreSQL**: Users (need ACID for account operations)
- **MongoDB**: Documents (flexible schema for content)

---

## 5. Code Quality Tools

### ESLint
**Linter** - catches code quality issues:
```typescript
// ESLint catches:
const user = fetchUser(); // ❌ unused variable
function foo() {
  if (x) return 1; // ❌ missing else return
}
```

### Prettier
**Formatter** - enforces consistent style:
```typescript
// Before
function foo(x,y,z){return x+y+z}

// After (Prettier)
function foo(x, y, z) {
  return x + y + z;
}
```

**Why both?**
- ESLint: Logic/quality rules
- Prettier: Formatting rules
- Together: Clean, consistent code

---

## 6. Observability Foundation

### The Three Pillars of Observability

#### 1. Logs (What happened)
```
[INFO] User 123 logged in
[ERROR] Failed to connect to database
```
**Use**: Debug issues, audit trail

#### 2. Metrics (How much / How fast)
```
http_requests_total: 1500
http_request_duration_seconds: 0.15
```
**Use**: Dashboards, alerts, capacity planning

#### 3. Traces (Where time was spent)
```
Request → Gateway (5ms) → Auth (10ms) → User Service (25ms)
```
**Use**: Find bottlenecks, optimize performance

### Prometheus + Grafana
- **Prometheus**: Collects & stores metrics
- **Grafana**: Visualizes metrics in dashboards

**We'll use them to monitor**:
- Request rate, latency, errors (RED metrics)
- Database connection pool usage
- Cache hit rate
- Queue length

---

## 🎯 Key Takeaways for Interviews

### 1. Architecture Decisions
**Q**: "Why microservices?"
**A**: 
- **Independent scaling**: Scale document service without scaling auth
- **Technology flexibility**: Use best DB for each service
- **Team autonomy**: Teams work on separate services
- **Fault isolation**: Auth crash doesn't kill document service

### 2. Infrastructure Choices
**Q**: "Why RabbitMQ over direct HTTP?"
**A**:
- **Decoupling**: Services don't need to know about each other
- **Reliability**: Retries, DLQ for failed messages
- **Load leveling**: Queue absorbs traffic spikes
- **Async processing**: Don't block user request

### 3. Best Practices
**Q**: "What makes this production-grade?"
**A**:
1. **Type safety** (TypeScript strict mode)
2. **Structured logging** (searchable, correlatable)
3. **Error handling** (custom errors, retries)
4. **Observability** (logs, metrics, traces)
5. **Code quality** (linting, formatting)
6. **Infrastructure as code** (Docker Compose)

---

## 📚 Next Steps

You've completed **Phase 1: Foundation**! 

Next, we'll build **Phase 2: API Gateway & Authentication**:
- JWT authentication (access + refresh tokens)
- API Gateway routing
- Rate limiting
- User service with PostgreSQL

**Key concepts you'll learn**:
- JWT security patterns
- Token rotation
- Rate limiting algorithms
- API Gateway pattern
- Prisma ORM
- Database migrations

---

## 💡 Exercises to Deepen Learning

1. **Explore the logger**
   ```bash
   cd packages/logger
   cat src/index.ts
   ```
   Try to understand how child loggers work

2. **Test retry logic**
   ```bash
   cd packages/common
   cat src/utils.ts
   ```
   Trace through the retry function - how does exponential backoff work?

3. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```
   Visit RabbitMQ management: http://localhost:15672 (bookspace/bookspace_dev_password)

4. **Check logs**
   ```bash
   docker-compose logs -f postgres
   ```
   See PostgreSQL startup logs

---

**You're now ready to build real services! Let's proceed to Phase 2.** 🚀
