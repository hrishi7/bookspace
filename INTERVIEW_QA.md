# Phase 2 - Interview Questions & Answers

## Complete answers to the top 10 authentication & API gateway interview questions

---

## Q1: "How does JWT authentication work?"

**Complete Answer:**

JWT (JSON Web Token) is a stateless authentication mechanism where the server doesn't need to store session data.

**JWT Structure:**
```
header.payload.signature

Example:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

**Decoded:**
```json
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload
{
  "userId": "123",
  "email": "user@example.com",
  "role": "user",
  "exp": 1234567890,
  "iat": 1234567800
}

// Signature = HMACSHA256(base64(header) + "." + base64(payload), secret)
```

**Authentication Flow:**

1. **Login**: User sends credentials
2. **Verification**: Server validates credentials
3. **Token Generation**: Server creates JWT with user data
   ```typescript
   const token = jwt.sign(
     { userId, email, role },
     SECRET_KEY,
     { expiresIn: '15m' }
   );
   ```
4. **Client Storage**: Client stores token (memory or httpOnly cookie)
5. **API Requests**: Client sends token in Authorization header
   ```
   Authorization: Bearer eyJhbGciOiJ...
   ```
6. **Token Validation**: Server verifies signature
   ```typescript
   const decoded = jwt.verify(token, SECRET_KEY);
   // If signature valid → user authenticated
   ```

**Why Stateless?**
- No database lookup needed
- Scales horizontally easily
- Works across microservices
- Faster (no DB hit)

**Verification Process:**
```
1. Extract token from Authorization header
2. Split into header, payload, signature
3. Recreate signature using header + payload + secret
4. Compare signatures
5. If match → token valid, not tampered
6. Check expiration (exp claim)
7. Attach user data to request
```

**Security:**
- Signature prevents tampering
- Short expiry limits damage if stolen
- HTTPS prevents token interception
- httpOnly cookies prevent XSS theft

---

## Q2: "Explain access vs refresh tokens"

**Complete Answer:**

We use **two-token strategy** to balance security and user experience.

**The Problem with Single Token:**

❌ **Short Expiry (15 min)**
- Secure (limited damage if stolen)
- But: User must login every 15 minutes (terrible UX!)

❌ **Long Expiry (7 days)**
- Good UX (stay logged in)
- But: If stolen, attacker has access for 7 days (dangerous!)

**Solution: Two Tokens**

### Access Token
```
Purpose: API requests
Lifetime: 15 minutes
Storage: Client memory (never localStorage!)
Contains: User ID, email, role, type: 'access'
If Stolen: Limited damage (expires in 15min)
```

### Refresh Token
```
Purpose: Get new access token
Lifetime: 7 days
Storage: httpOnly cookie (can't be accessed by JavaScript)
Contains: User ID, email, role, type: 'refresh'
If Stolen: Can be revoked, rotated on use
```

**Complete Flow:**

```
1. Login
   → Server returns: accessToken + refreshToken

2. API Request
   → Client sends: Authorization: Bearer {accessToken}
   → Server validates signature
   → Returns data

3. Access Token Expires (15 min later)
   → Client gets 401 Unauthorized
   → Client sends refreshToken to /auth/refresh

4. Refresh Endpoint
   → Validates refresh token
   → Generates NEW access + refresh token (rotation!)
   → Invalidates OLD refresh token
   → Returns new tokens

5. Repeat from step 2
```

**Token Rotation (Security):**

Without rotation:
```
Login → Get refresh token R1
Day 1: Use R1 → Get access token (R1 still valid)
Day 2: Use R1 → Get access token (R1 still valid)
Attacker steals R1 → Can use forever until expiry!
```

With rotation (our implementation):
```
Login → Get refresh token R1, store in Redis
Day 1: Use R1 → Get R2, invalidate R1 in Redis
Day 2: Use R2 → Get R3, invalidate R2 in Redis
If R1 used again → Detect theft, invalidate ALL user tokens!
```

**Why This Works:**
- ✅ Access token short expiry = secure
- ✅ Refresh token long expiry = good UX
- ✅ Rotation = detect theft
- ✅ Can revoke refresh tokens = controllable

---

## Q3: "How do you handle logout with JWT?"

**Complete Answer:**

The challenge: JWTs are **stateless** - the server doesn't track them, so you can't just "delete" a token.

**Our 3-Layer Approach:**

### Layer 1: Client-Side Deletion
```typescript
// Client discards tokens
localStorage.removeItem('accessToken');
delete memory.accessToken;
document.cookie = 'refreshToken=; Max-Age=0';
```

**Problem**: If attacker already stole the token, this doesn't help!

### Layer 2: Short Access Token Expiry
```
Access token: 15 minutes
User logs out → Token still valid for max 15 more minutes
But damage window is limited
```

**Problem**: Still has 15-minute window of vulnerability

### Layer 3: Token Blacklisting (Our Implementation)
```typescript
// On logout
async function logout(accessToken, refreshToken) {
  // 1. Blacklist access token in Redis
  const decoded = jwt.verify(accessToken, SECRET);
  const expirySeconds = decoded.exp - Math.floor(Date.now() / 1000);
  await redis.setex(`blacklist:${accessToken}`, expirySeconds, '1');
  
  // 2. Invalidate refresh token in Redis
  await redis.del(`refresh:${userId}:${refreshToken}`);
}

// On every authentication
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.substring(7);
  
  // Check if blacklisted
  const isBlacklisted = await redis.exists(`blacklist:${token}`);
  if (isBlacklisted) {
    throw new UnauthorizedError('Token revoked');
  }
  
  // Verify signature
  const decoded = jwt.verify(token, SECRET);
  req.user = decoded;
  next();
}
```

**Why Redis for Blacklisting?**

✅ **Fast**: In-memory, <1ms reads
✅ **TTL**: Auto-delete when token expires
✅ **Distributed**: Works with multiple gateway instances
✅ **Atomic**: No race conditions
✅ **Efficient**: Only store blacklisted tokens (most tokens aren't blacklisted)

**Storage Efficiency:**
```
Don't store ALL tokens (millions)
Only store BLACKLISTED tokens (few)
Token expires → Redis auto-deletes (TTL)
→ No manual cleanup needed
```

**Complete Logout Flow:**
```
1. Client sends POST /auth/logout with accessToken + refreshToken
2. Server blacklists accessToken in Redis (until expiry)
3. Server deletes refreshToken from Redis
4. Server returns success
5. Client deletes tokens from memory
6. Any API call with old tokens → 401 Unauthorized
```

---

## Q4: "What rate limiting algorithm do you use and why?"

**Complete Answer:**

We use **Token Bucket** algorithm with Redis for distributed rate limiting.

### Token Bucket Algorithm

**Concept:**
```
Bucket capacity: 100 tokens
Refill rate: 10 tokens/second
Request cost: 1 token per request

If tokens available → Allow request, consume token
If no tokens → Reject with 429 Too Many Requests
```

**Flow:**
```
Time 0s:  Bucket = 100 tokens
          User makes 50 requests → Bucket = 50 tokens

Time 1s:  Refill +10 → Bucket = 60 tokens
          User makes 20 requests → Bucket = 40 tokens

Time 2s:  Refill +10 → Bucket = 50 tokens
          User makes 100 requests
          → 50 allowed, 50 rejected (429)
          → Bucket = 0 tokens

Time 5s:  Refill +50 → Bucket = 50 tokens
          (Can make requests again)
```

**Implementation:**
```typescript
// Gateway middleware
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  
  // Redis for distributed rate limiting
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  }),
  
  // Key = IP address (or user ID if authenticated)
  keyGenerator: (req) => req.ip,
  
  // Return info in headers
  standardHeaders: true,
  
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});
```

### Why Token Bucket?

**Compared to Other Algorithms:**

#### Leaky Bucket
```
- Processes requests at fixed rate (strict)
- No bursts allowed
- Good for: Streaming, constant rate processing
- Bad for: APIs (users expect bursts)
```

#### Fixed Window
```
- Simple: Count requests in 1-minute windows
- Problem: Burst at boundaries
  Example:
  0:59 → 100 requests (OK)
  1:00 → 100 requests (new window, OK)
  Total: 200 in 1 second! (burst problem)
```

#### Sliding Window
```
- Most accurate
- No boundary problem
- But: More complex, higher memory
- Stores all request timestamps
```

**Token Bucket Advantages:**
✅ Allows bursts (up to bucket size)
✅ Smooth over time (refills gradually)
✅ Simple to implement
✅ Industry standard (AWS, GitHub use it)
✅ Good balance of simplicity and effectiveness

### Why Redis for Rate Limiting?

**Requirements:**
- Fast (check rate limit on every request)
- Distributed (multiple gateway instances)
- Atomic operations (no race conditions)
- TTL support (auto-cleanup)

**Redis provides all:**
```typescript
// Atomic increment
await redis.incr(`rl:${ip}`);
await redis.expire(`rl:${ip}`, 900); // 15 min TTL

// Multiple gateways share same Redis
// → Consistent rate limiting across all instances
```

**Different Limits for Different Endpoints:**
```typescript
// General API: 100 req / 15 min
app.use(createRateLimiter());

// Auth endpoints: 5 req / 15 min (prevent brute force)
authRouter.use(createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `auth:${req.ip}`
}));
```

---

## Q5: "How do you trace requests across microservices?"

**Complete Answer:**

We use **Correlation IDs** (also called Request IDs or Trace IDs) for distributed tracing.

### The Problem

**Scenario:**
```
User request flows through:
Gateway → Auth Service → User Service → Database

Each service logs independently:
Gateway: "Request received"
Auth: "Validating token"  
User: "Fetching user"
Database: "Query executed"

Question: How do you connect these logs?
Which auth validation belongs to which request?
```

**Without Correlation IDs:**
```
gateway.log:  [2024-10-15 10:30:00] Request received
auth.log:     [2024-10-15 10:30:01] Validating token
auth.log:     [2024-10-15 10:30:01] Validating token  ← Which request?
user.log:     [2024-10-15 10:30:02] Fetching user     ← Which token validation?
```

**Impossible to trace!**

### Solution: Correlation IDs

**Implementation:**

1. **Gateway Generates ID:**
```typescript
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  // Use client's request ID if provided, else generate
  req.id = req.headers['x-request-id'] || uuidv4();
  
  // Add to response headers (client can track)
  res.setHeader('X-Request-ID', req.id);
  
  // Create child logger with request context
  req.log = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  
  next();
});
```

2. **Gateway Forwards to Services:**
```typescript
// Proxy middleware
onProxyReq: (proxyReq, req) => {
  // Forward request ID to backend service
  proxyReq.setHeader('X-Request-ID', req.id);
  
  // Also forward user info
  if (req.user) {
    proxyReq.setHeader('X-User-ID', req.user.userId);
  }
}
```

3. **Each Service Uses Same ID:**
```typescript
// Auth Service
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'];
  req.log = logger.child({ requestId });
  next();
});

// Now all logs include requestId
req.log.info('Validating token');
// Output: {"requestId":"abc-123","msg":"Validating token"}
```

**Complete Flow with Correlation ID:**

```
Client Request
  ↓
Gateway (generates ID: "abc-123")
  logs: {"requestId":"abc-123","msg":"Request received"}
  forwards: X-Request-ID: abc-123
  ↓
Auth Service (extracts ID from header)
  logs: {"requestId":"abc-123","msg":"Validating token"}
  forwards: X-Request-ID: abc-123
  ↓
User Service (extracts ID from header)
  logs: {"requestId":"abc-123","msg":"Fetching user from DB"}
  ↓
Response
  headers: X-Request-ID: abc-123
```

**Now you can trace the entire request:**
```bash
# Find all logs for request abc-123
grep "abc-123" logs/*.log

# Or in Elasticsearch
GET /logs/_search
{
  "query": {
    "term": { "requestId": "abc-123" }
  }
}

# Results show complete flow:
10:30:00.123 gateway: Request received
10:30:00.145 auth: Validating token
10:30:00.167 auth: Token valid
10:30:00.189 user: Fetching user from DB
10:30:00.234 user: User found
10:30:00.256 gateway: Response sent (duration: 133ms)
```

**Benefits:**
✅ Debug production issues
✅ Find bottlenecks (which service is slow?)
✅ Track errors across services
✅ Audit user actions
✅ Performance monitoring

**Standard Practice:**
- AWS X-Ray uses this
- Google Cloud Trace uses this
- Microservices standard pattern
- Part of OpenTelemetry standard

---

## Q6: "Why bcrypt over SHA256 for passwords?"

**Complete Answer:**

SHA256 is **completely wrong** for passwords. Here's why:

### The Attack: Password Cracking

**Attacker goals:**
1. Get database dump (SQL injection, breach, etc.)
2. Crack password hashes
3. Login as users

**Attack methods:**
- Brute force: Try all combinations
- Dictionary: Try common passwords  
- Rainbow tables: Precomputed hashes

### Why SHA256 Fails

**Problem 1: Too Fast**
```
Modern GPU: 1 billion SHA256/second
Password: "password123"
Time to crack: Milliseconds

// SHA256 is designed to be FAST
// Great for data integrity
// Terrible for passwords!
```

**Problem 2: No Salt**
```
If two users have same password:
User A: "password123" → SHA256 → abc123...
User B: "password123" → SHA256 → abc123...
Same hash! Attacker cracks once, gets both passwords
```

**Problem 3: Rainbow Tables**
```
Precomputed table:
"password" → 5e884898da...
"123456" → 8d969eef6e...
"password123" → ef92b778ba...

Attacker downloads table, instant lookups!
```

### Why bcrypt Wins

**Designed Specifically for Passwords:**

**Feature 1: Slow by Design**
```typescript
// bcrypt with 12 rounds
await bcrypt.hash("password123", 12);
// Takes ~400ms

// Why slow is good:
User logging in: 400ms delay → barely noticeable
Attacker cracking: 400ms per attempt → prohibitively slow

// Speed comparison:
SHA256: 1,000,000,000 attempts/second
bcrypt (12 rounds): 2,500 attempts/second
→ 400,000x slower for attacker!
```

**Feature 2: Adaptive (Future-Proof)**
```
Rounds = work factor = 2^rounds iterations

2010: 10 rounds (1024 iterations) → ~100ms
2020: 12 rounds (4096 iterations) → ~400ms
2030: 14 rounds (16384 iterations) → ~1.6s

As computers get faster, increase rounds
Automatically stays secure!
```

**Feature 3: Built-in Random Salt**
```typescript
// Each password gets unique salt
await bcrypt.hash("password123", 12);
// → $2b$12$R9h/cIPz0gi...

await bcrypt.hash("password123", 12);
// → $2b$12$K8x/dJQa1hj...

// Same password, different hashes!
// Rainbow tables useless!
```

**bcrypt Hash Format:**
```
$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW
 |  |  |                     |
 |  |  |                     └─ Hash (31 chars)
 |  |  └─ Salt (22 chars, random per password)
 |  └─ Cost factor (12 = 4096 iterations)
 └─ Algorithm version (2b = latest bcrypt)
```

**Feature 4: Timing-Safe Comparison**
```typescript
// Wrong (vulnerable to timing attacks)
if (inputPassword === storedPassword) {
  // String comparison stops at first mismatch
  // Attacker can measure time to guess length/content
}

// Right (timing-safe)
await bcrypt.compare(inputPassword, storedHash);
// Takes same time regardless of correctness
// Attacker can't learn anything from timing
```

### Implementation

```typescript
// Registration
const hashedPassword = await bcrypt.hash(password, 12);
await db.users.create({ email, password: hashedPassword });

// Login
const user = await db.users.findByEmail(email);
const isValid = await bcrypt.compare(password, user.password);
if (!isValid) {
  throw new UnauthorizedError('Invalid credentials');
}
```

### Gradual Migration (Increase Rounds)

```typescript
// Check if hash needs updating
function needsRehash(hash: string): boolean {
  const currentRounds = parseInt(hash.match(/^\$2[aby]\$(\d+)\$/)[1]);
  return currentRounds < 12;
}

// On login, rehash if needed
if (isValid && needsRehash(user.password)) {
  const newHash = await bcrypt.hash(password, 12);
  await db.users.update(userId, { password: newHash });
  // User never knows, seamless upgrade!
}
```

**Interview Summary:**
"SHA256 is designed for speed (data integrity), bcrypt for slowness (password security). bcrypt is slow by design (~400ms vs <1ms), adaptive (can increase security over time), includes random salts (prevents rainbow tables), and uses timing-safe comparisons. It's the industry standard for password hashing, specifically designed to resist brute force attacks."

---

## Q7: "What is the API Gateway pattern?"

**Complete Answer:**

API Gateway is a **single entry point** for all client requests to microservices.

### Architecture

**Without Gateway:**
```
Client
  ├→ http://auth-service:3001/signup
  ├→ http://user-service:3002/profile  
  ├→ http://doc-service:3003/documents
  └→ http://file-service:3004/upload
```

**With Gateway:**
```
Client
  ↓
API Gateway (http://api.example.com)
  ├→ /v1/auth/* → Auth Service (3001)
  ├→ /v1/users/* → User Service (3002)
  ├→ /v1/docs/* → Document Service (3003)
  └→ /v1/files/* → File Service (3004)
```

### Gateway Responsibilities

**1. Request Routing (Reverse Proxy)**
```typescript
// Client calls: GET /v1/users/123
// Gateway routes to: http://user-service:3002/v1/users/123

app.use('/v1/users', createProxyMiddleware({
  target: 'http://user-service:3002',
  changeOrigin: true
}));
```

**2. Authentication**
```typescript
// Validate JWT once at gateway
// Forward user info to backend services

app.use('/v1/users', authenticate, proxy);
// All /v1/users/* routes now require auth
```

**3. Rate Limiting**
```typescript
// Protect ALL services with one configuration
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

**4. Request/Response Transformation**
```typescript
// Add headers
onProxyReq: (proxyReq, req) => {
  proxyReq.setHeader('X-Request-ID', req.id);
  proxyReq.setHeader('X-User-ID', req.user?.userId);
}

// Transform response
onProxyRes: (proxyRes, req, res) => {
  // Add CORS headers, etc.
}
```

**5. Logging & Monitoring**
```typescript
// Centralized logging
app.use((req, res, next) => {
  req.log.info({ method: req.method, path: req.path });
  next();
});

// Centralized metrics
app.use(metricsMiddleware);
```

**6. Security Headers**
```typescript
// Once at gateway, applies to all services
app.use(helmet());
app.use(cors());
```

### Benefits

**For Clients:**
✅ Single URL to remember
✅ Don't need to know service locations
✅ Consistent authentication
✅ Standardized error responses

**For Backend:**
✅ Services focus on business logic
✅ No duplicate auth/logging code
✅ Easy to move/rename services
✅ Can change backend without affecting clients

**For Operations:**
✅ Centralized monitoring
✅ Single point for SSL/TLS
✅ Easy to add caching
✅ Load balancing

### Trade-offs

**Advantages:**
✅ Simplified client code
✅ Centralized cross-cutting concerns
✅ Service independence
✅ Protocol translation (REST → gRPC)
✅ Version management (/v1/, /v2/)

**Disadvantages:**
❌ Single point of failure (mitigate with HA)
❌ Additional network hop (adds latency ~5-10ms)
❌ Can become bottleneck (mitigate with scaling)
❌ More complex deployment

### Our Implementation

```typescript
// services/gateway/src/routes/proxy.routes.ts

// Public routes (no auth)
router.use('/v1/auth', createProxy(AUTH_SERVICE));

// Protected routes (auth required)
router.use('/v1/users', authenticate, createProxy(USER_SERVICE));
router.use('/v1/docs', authenticate, createProxy(DOC_SERVICE));

// Optional auth (changes behavior based on user)
router.use('/v1/search', optionalAuth, createProxy(SEARCH_SERVICE));

// Admin only
router.use('/v1/admin', authenticate, requireAdmin, createProxy(ADMIN_SERVICE));
```

### Real-World Examples

**Netflix**: Zuul (Java) → replaced by Spring Cloud Gateway
**Amazon**: API Gateway service (AWS)
**Uber**: Custom gateway handling billions of requests/day
**Kong**: Open-source API Gateway (Nginx-based)

**Interview Summary:**
"API Gateway is a reverse proxy that provides a single entry point for microservices. It handles cross-cutting concerns like authentication, rate limiting, logging, and routing. Benefits include simplified clients and centralized logic, but it can be a single point of failure (solved with HA) and adds latency (usually 5-10ms, acceptable trade-off for the benefits)."

---

## Q8: "Explain RED metrics"

**Complete Answer:**

RED metrics are the **three golden signals** for monitoring request-driven services (APIs, web servers).

### The Three Metrics

**R = Rate (Requests per second)**
**E = Errors (Failed requests per second)**
**D = Duration (How long requests take)**

### Why These Three?

**Rate** tells you: **How busy is my service?**
- Traffic patterns
- Load trends  
- Capacity planning
- Spot anomalies

**Errors** tells you: **Is my service working?**
- Error rate
- Which endpoints failing
- User impact
- Alert triggers

**Duration** tells you: **Is my service fast enough?**
- Latency percentiles (p50, p95, p99)
- Performance degradation
- Bottlenecks
- SLA compliance

### Implementation with Prometheus

**1. Rate - Counter**
```typescript
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// On each request
httpRequestsTotal.inc({
  method: 'GET',
  route: '/users',
  status_code: '200'
});
```

**Query in Prometheus:**
```
# Requests per second (last 5 minutes)
rate(http_requests_total[5m])

# By status code
rate(http_requests_total{status_code="200"}[5m])
```

**2. Errors - Counter (subset of Rate)**
```typescript
// Same counter, filter by error status codes
httpRequestsTotal.inc({
  method: 'POST',
  route: '/auth/login',
  status_code: '401'  // Error!
});
```

**Query in Prometheus:**
```
# Error rate (5xx and 4xx)
rate(http_requests_total{status_code=~"[45].."}[5m])

# Error percentage
rate(http_requests_total{status_code=~"5.."}[5m])
  / rate(http_requests_total[5m])
```

**3. Duration - Histogram**
```typescript
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// On each request
const startTime = Date.now();
// ... handle request ...
const duration = (Date.now() - startTime) / 1000;
httpRequestDuration.observe({ method, route, status_code }, duration);
```

**Query in Prometheus:**
```
# p95 latency (95% of requests faster than this)
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket[5m])
)

# p50 (median)
histogram_quantile(0.50, 
  rate(http_request_duration_seconds_bucket[5m])
)

# p99 (slowest 1%)
histogram_quantile(0.99, 
  rate(http_request_duration_seconds_bucket[5m])
)
```

### Metric Types Explained

**Counter (only goes up):**
```
Use for: Total requests, error count
Value: Continuously increasing
Example: 
  t=0s:  100 requests
  t=1s:  150 requests
  t=2s:  220 requests
```

**Gauge (can go up/down):**
```
Use for: Current connections, queue size, memory
Value: Current value
Example:
  t=0s:  50 connections
  t=1s:  75 connections
  t=2s:  60 connections (went down)
```

**Histogram (distribution):**
```
Use for: Request duration, response size
Value: Buckets of observations
Example:
  0-10ms:   1000 requests
  10-50ms:  500 requests
  50-100ms: 100 requests
  100ms+:   10 requests
  
Can calculate: p50, p95, p99, avg
```

### Alerting with RED Metrics

```yaml
# Alert if error rate > 1%
- alert: HighErrorRate
  expr: |
    rate(http_requests_total{status_code=~"5.."}[5m])
      / rate(http_requests_total[5m]) > 0.01
  for: 5m
  annotations:
    summary: "Error rate above 1%"

# Alert if p95 latency > 500ms
- alert: HighLatency
  expr: |
    histogram_quantile(0.95, 
      rate(http_request_duration_seconds_bucket[5m])
    ) > 0.5
  for: 5m
  annotations:
    summary: "p95 latency above 500ms"

# Alert if traffic drops 50% (possible outage)
- alert: TrafficDrop
  expr: |
    rate(http_requests_total[5m]) < 
    rate(http_requests_total[1h] offset 1h) * 0.5
  for: 5m
  annotations:
    summary: "Traffic dropped 50%"
```

### Grafana Dashboard

**Example queries for visualization:**
```
# Request rate by endpoint
sum by (route) (rate(http_requests_total[5m]))

# Error rate percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m])) * 100

# Latency percentiles
histogram_quantile(0.50, ...) # p50 (median)
histogram_quantile(0.95, ...) # p95
histogram_quantile(0.99, ...) # p99
```

**Interview Summary:**
"RED metrics are Rate, Errors, and Duration - the three essential metrics for monitoring APIs. Rate shows traffic volume (requests/sec), Errors shows failure rate (error %), Duration shows latency (p50/p95/p99). We implement them using Prometheus with Counters for rate/errors and Histograms for duration. These metrics enable us to set SLOs and create alerts for production issues."

---

## Q9: "How do you do graceful shutdown?"

**Complete Answer:**

Graceful shutdown ensures servers stop cleanly without dropping requests or leaking resources.

### The Problem

**Without Graceful Shutdown:**
```
1. SIGTERM signal received (Kubernetes wants to stop pod)
2. Process exits immediately
3. 10 requests in-flight → All fail with connection errors
4. Database has 5 open connections → Connection leak
5. User gets 500 errors → Bad experience
6. Logs not flushed → Lost debugging data
```

**With Graceful Shutdown:**
```
1. SIGTERM signal received
2. Stop accepting NEW requests
3. Wait for IN-FLIGHT requests to complete
4. Close database connections cleanly
5. Close Redis connections
6. Close message queue connections
7. Flush logs
8. Exit with code 0 (success)
```

### Implementation

```typescript
// Gateway service
const server = app.listen(3000);

const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Close external connections
  try {
    // Close Redis
    await redisClient.quit();
    logger.info('Redis connection closed');

    // If we had database
    // await mongoose.connection.close();
    // await prisma.$disconnect();

    // Exit successfully
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));  // Ctrl+C

// Fallback: Force shutdown after timeout
setTimeout(() => {
  logger.error('Forced shutdown after timeout');
  process.exit(1);
}, 30000); // 30 seconds
```

### Why Each Step Matters

**1. server.close() - No New Connections**
```typescript
server.close(() => {
  // Callback runs when all existing connections closed
});

// What happens:
// - Stop accepting new TCP connections
// - Keep existing connections open
// - Wait for in-flight requests to finish
// - Then call callback
```

**2. Wait for In-Flight Requests**
```
Current requests:
  - GET /users/123 (started 2s ago, needs 1s more)
  - POST /docs (started 1s ago, needs 3s more)
  - PUT /profile (started 0s ago, needs 2s more)

server.close() waits until all three complete
Then proceeds to close connections
```

**3. Close Database Connections**
```typescript
// PostgreSQL with Prisma
await prisma.$disconnect();
// Closes connection pool cleanly
// Prevents: Lost transactions, connection leaks

// MongoDB with Mongoose
await mongoose.connection.close();
// Ensures pending operations complete
```

**4. Close Redis**
```typescript
await redisClient.quit();
// vs redisClient.disconnect() (immediate)

// quit() waits for pending commands
// disconnect() drops them immediately
```

**5. Force Timeout (Safety)**
```typescript
setTimeout(() => {
  logger.error('Forced shutdown - took too long');
  process.exit(1);
}, 30000);

// Why?
// - Prevents hanging forever
// - Kubernetes will force-kill after 30s anyway
// - Better to exit cleanly before force-kill
```

### Signals

**SIGTERM** (Termination signal)
```
- Sent by: Kubernetes, Docker, systemd
- Meaning: "Please stop gracefully"
- Response: Graceful shutdown
```

**SIGINT** (Interrupt signal)
```
- Sent by: Ctrl+C in terminal
- Meaning: "User wants to stop"
- Response: Graceful shutdown
```

**SIGKILL** (Kill signal)
```
- Sent by: kill -9, Kubernetes after timeout
- Meaning: "Stop NOW"
- Response: Immediate termination (can't catch this!)
```

### Kubernetes Integration

**Pod Termination Flow:**
```
1. User runs: kubectl delete pod my-app
2. Kubernetes marks pod as "Terminating"
3. Removes pod from service endpoints (no new traffic)
4. Sends SIGTERM to container
5. Waits 30s (terminationGracePeriodSeconds)
6. If still running, sends SIGKILL (force kill)
```

**Config:**
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: api-gateway
    image: gateway:latest
  terminationGracePeriodSeconds: 30  # Match our timeout
```

### Zero-Downtime Deployment

**Rolling Update:**
```
Step 1: Start new pod (v2)
  - v1 pod: Handling traffic
  - v2 pod: Starting up

Step 2: Wait for v2 ready (health check passes)
  - v1 pod: Handling traffic
  - v2 pod: Ready, added to load balancer

Step 3: Send SIGTERM to v1
  - v1 pod: Graceful shutdown (30s)
  - v2 pod: Handling all new traffic

Step 4: v1 completes shutdown
  - v1 pod: Terminated
  - v2 pod: Handling all traffic

Result: Zero dropped requests!
```

### Error Handling

**Unhandled Promise Rejection:**
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
  // In production, might want to: 
  gracefulShutdown('unhandledRejection');
});
```

**Uncaught Exception:**
```typescript
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  // Must exit - state is unknown
  process.exit(1);
});
```

**Interview Summary:**
"Graceful shutdown stops accepting new requests while completing in-flight requests, then cleanly closes all connections (database, Redis, message queues) before exiting. We listen for SIGTERM/SIGINT signals, call server.close() to stop new connections, await connection closures, and set a 30-second force-shutdown timeout. This enables zero-downtime deployments in Kubernetes where pods gracefully drain traffic before terminating."

---

## Q10: "What's the difference between authentication and authorization?"

**Complete Answer:**

**Authentication** and **Authorization** are often confused but serve different purposes in security.

### Quick Answer

**Authentication**: "Who are you?" (Identity verification)
**Authorization**: "What are you allowed to do?" (Permission checking)

### Authentication

**Question**: Who are you?

**Process**:
```
1. User provides credentials (email + password)
2. Server verifies credentials
3. Server provides proof of identity (JWT token)
4. User proves identity on subsequent requests
```

**Example Flow:**
```typescript
// Login (authentication)
POST /auth/login
{
  "email": "john@example.com",
  "password": "SecurePass123"
}

// Server validates credentials
const user = await findUserByEmail(email);
const isValid = await bcrypt.compare(password, user.password);

if (!isValid) {
  throw new UnauthorizedError('Invalid credentials');
}

// Generate proof of identity
const token = jwt.sign(
  { userId: user.id, email: user.email, role: user.role },
  SECRET
);

// Return token
return { token }; // Proof you are John
```

**Authentication Methods:**
1. **Password-based**: Email + password
2. **Token-based**: JWT, session tokens
3. **Multi-factor**: Password + SMS/TOTP
4. **OAuth**: Login with Google/GitHub
5. **Biometric**: Fingerprint, Face ID
6. **Certificate**: SSL client certificates

### Authorization

**Question**: What are you allowed to do?

**Process**:
```
1. User makes request (with authenticated identity)
2. Server checks permissions
3. Server allows or denies based on rules
```

**Example Flow:**
```typescript
// User wants to delete another user
DELETE /users/456
Authorization: Bearer eyJhbGci... (John's token)

// Authentication middleware (who are you?)
const decoded = jwt.verify(token, SECRET);
// John's token is valid → Authenticated ✓

// Authorization middleware (what can you do?)
if (decoded.role !== 'admin') {
  // John is not admin
  throw new ForbiddenError('Requires admin role');
}
// John is admin → Authorized ✓

// Process delete
await deleteUser(456);
```

**Authorization Models:**

**1. Role-Based Access Control (RBAC)** - Our implementation
```typescript
enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

// Roles have permissions
const requireRole = (...roles: UserRole[]) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
};

// Usage
router.delete('/users/:id', 
  authenticate,              // Who are you?
  requireRole(UserRole.ADMIN), // Are you admin?
  deleteUser
);
```

**2. Attribute-Based Access Control (ABAC)**
```typescript
// Rules based on attributes
function canEditDocument(user, document) {
  return (
    document.createdBy === user.id || // Owner
    user.role === 'admin' ||          // Admin
    (user.department === document.department && // Same dept
     user.role === 'editor')                    // And editor role
  );
}

if (!canEditDocument(user, doc)) {
  throw new ForbiddenError();
}
```

**3. Access Control Lists (ACL)**
```typescript
// Per-resource permissions
document = {
  id: '123',
  permissions: [
    { userId: 'alice', access: ['read', 'write'] },
    { userId: 'bob', access: ['read'] }
  ]
};

function hasPermission(user, doc, action) {
  const perms = doc.permissions.find(p => p.userId === user.id);
  return perms && perms.access.includes(action);
}
```

### Key Differences

| | Authentication | Authorization |
|---|---|---|
| **Question** | Who are you? | What can you do? |
| **When** | Once (at login) | Every request |
| **Proves** | Identity | Permissions |
| **Failure** | 401 Unauthorized | 403 Forbidden |
| **Example** | Email + password | User role = admin |

### HTTP Status Codes

**401 Unauthorized** (Authentication failed)
```
Meaning: You are not authenticated
Reason: No token, invalid token, expired token
Action: Login again

Example:
GET /users/me
(no Authorization header)
→ 401 Unauthorized
→ Client should redirect to login
```

**403 Forbidden** (Authorization failed)
```
Meaning: You are authenticated but not authorized
Reason: Insufficient permissions
Action: You can't do this action

Example:
DELETE /users/456
Authorization: Bearer <valid-token-for-regular-user>
→ 403 Forbidden (regular user can't delete users)
→ Client shows "You don't have permission"
```

### Complete Example

```typescript
// Authentication middleware
export const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.substring(7);
  
  if (!token) {
    // No token → Not authenticated
    throw new UnauthorizedError('No token provided');
  }
  
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // Now we know WHO you are
    next();
  } catch {
    // Invalid token → Authentication failed
    throw new UnauthorizedError('Invalid token');
  }
};

// Authorization middleware
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    // No user → Must authenticate first
    throw new UnauthorizedError('Authentication required');
  }
  
  if (req.user.role !== 'admin') {
    // Valid user but wrong role → Authorization failed
    throw new ForbiddenError('Requires admin role');
  }
  
  next(); // Authenticated AND authorized
};

// Usage
router.delete('/users/:id',
  authenticate,    // Step 1: Verify identity (401 if fails)
  requireAdmin,    // Step 2: Check permissions (403 if fails)
  deleteUser       // Step 3: Execute action
);
```

### Real-World Analogy

**Airport Security:**

**Authentication** = TSA checking your ID
- They verify you are who your boarding pass says
- Passport, driver's license
- "Prove you're John Doe"

**Authorization** = Gate agent checking your boarding pass
- They verify you're allowed on THIS flight
- Right flight number, right seat class
- "You proved you're John, but are you allowed in first class?"

**Interview Summary:**
"Authentication verifies identity (who are you?) typically via credentials like email/password, returning a token. Authorization checks permissions (what can you do?) based on the authenticated identity. Authentication fails → 401 Unauthorized (login again). Authorization fails → 403 Forbidden (you're logged in but can't do this). We implement authentication with JWT middleware and authorization with RBAC (role-based access control)."

---

## Common Follow-Up Questions

### "How do you prevent brute force attacks?"

**Answer:**
1. **Rate limiting**: 5 attempts per 15 minutes on auth endpoints
2. **Account lockout**: Lock account after N failed attempts (optional)
3. **CAPTCHA**: After 3 failed attempts
4. **Strong passwords**: Enforce complexity requirements (Zod validation)
5. **Monitoring**: Alert on high failure rates
6. **IP blocking**: Block IPs with repeated failures

### "How does your system scale?"

**Answer:**
1. **Stateless architecture**: JWT tokens, no server-side sessions
2. **Horizontal scaling**: Multiple gateway/service instances behind load balancer
3. **Distributed state**: Redis shared across instances (rate limiting, blacklist)
4. **Connection pooling**: Database connection pools
5. **Caching**: Redis for frequently accessed data
6. **Async processing**: Message queue for heavy tasks

### "How do you handle token theft?"

**Answer:**
1. **Short expiry**: Access token 15min (limits damage window)
2. **Token rotation**: New refresh token on each use
3. **Theft detection**: Reuse of old refresh token → invalidate all tokens
4. **Blacklisting**: Can revoke specific tokens
5. **Secure storage**: httpOnly cookies (prevent XSS theft)
6. **HTTPS only**: Prevent interception
7. **User alerts**: Email on new login/location

---

**You can now confidently answer these questions in any senior-level interview!** 🚀

All concepts are implemented in the code you just built. Review:
- `/services/gateway/` - API Gateway with all middleware
- `/services/auth/` - Complete auth service
- `/services/user/` - Prisma ORM with type-safe queries
- Code comments explain the "why" behind every decision

---

## Phase 2 Extended: Prisma & ORM Questions

## Q11: "ORM vs Raw SQL - When would you use each?"

**Complete Answer:**

ORM (Object-Relational Mapping) provides database abstraction, while raw SQL gives direct control.

### ORM Advantages

**1. Type Safety**
```typescript
// Prisma - Fully typed
const user = await prisma.user.findUnique({
  where: { email: 'john@example.com' }
});
// TypeScript knows: user.id, user.email, user.name

// Raw SQL - No types
const result = await db.query('SELECT * FROM users WHERE email = $1', ['john@example.com']);
// TypeScript knows: result is any[]
```

**2. SQL Injection Prevention**
```typescript
// ❌ Raw SQL - Vulnerable
const email = req.query.email;
await db.query(`SELECT * FROM users WHERE email = '${email}'`);
// Attacker: ?email=' OR '1'='1
// Runs: SELECT * FROM users WHERE email = '' OR '1'='1'
// Returns all users!

// ✅ Prisma - Safe (parameterized)
await prisma.user.findUnique({
  where: { email: email } // Automatically escaped
});
```

**3. Productivity**
```typescript
// Create user with Prisma
const user = await prisma.user.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    role: 'USER'
  }
});

// Same with raw SQL
await db.query(`
  INSERT INTO users (id, email, name, role, created_at, updated_at)
  VALUES ($1, $2, $3, $4, NOW(), NOW())
  RETURNING *
`, [uuid(), 'john@example.com', 'John Doe', 'USER']);
```

**4. Database Portability**
```typescript
// Prisma - works with PostgreSQL, MySQL, SQLite
datasource db {
  provider = "postgresql" // Change to "mysql" - code still works!
  url = env("DATABASE_URL")
}

// Raw SQL - database-specific
// PostgreSQL: RETURNING *
// MySQL: LAST_INSERT_ID()
// Different syntax!
```

### Raw SQL Advantages

**1. Complex Queries**
```sql
-- Complex analytics query
SELECT 
  u.name,
  COUNT(DISTINCT d.id) as doc_count,
  AVG(c.sentiment) as avg_sentiment,
  ARRAY_AGG(DISTINCT d.tags) as all_tags
FROM users u
LEFT JOIN documents d ON d.created_by = u.id
LEFT JOIN comments c ON c.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name
HAVING COUNT(d.id) > 5
ORDER BY doc_count DESC
LIMIT 10;

// Prisma - harder to express
// Might need raw SQL anyway
```

**2. Performance Optimization**
```sql
-- Optimized query with specific indexes
SELECT /*+ INDEX(users idx_email) */ *
FROM users
WHERE email = 'john@example.com'
AND deleted_at IS NULL;

-- ORM can't hint indexes
```

**3. Bulk Operations**
```sql
-- Bulk update (efficient)
UPDATE users 
SET role = 'PREMIUM'
WHERE created_at < '2024-01-01' 
  AND total_spent > 1000;

-- Prisma prisma.user.updateMany() - same efficiency
```

### When to Use Each

**Use ORM (Prisma) When:**
- ✅ CRUD operations (90% of queries)
- ✅ Type safety important
- ✅ Team using TypeScript
- ✅ Need database migration tools
- ✅ Want productivity boost

**Use Raw SQL When:**
- ✅ Complex analytics queries
- ✅ Performance-critical paths
- ✅ Database-specific features
- ✅ Bulk operations (millions of rows)
- ✅ Existing SQL you're migrating

**Hybrid Approach (Best Practice):**
```typescript
// Most queries: ORM
const user = await prisma.user.findUnique({ where: { id } });

// Complex queries: Raw SQL
const analytics = await prisma.$queryRaw`
  SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as signups
  FROM users
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY date
  ORDER BY date
`;
// Still type-safe with Prisma.TypedQuery!
```

**Interview Summary:**
"ORMs like Prisma provide type safety, SQL injection prevention, and productivity for CRUD operations—covering 90% of use cases. Raw SQL is better for complex analytics, performance optimization, and database-specific features. The best approach is hybrid: use ORM for standard queries and raw SQL for complex cases. Prisma supports both, giving you type safety even with raw queries using `$queryRaw`."

---

## Q12: "Explain soft delete and when you'd use it"

**Complete Answer:**

Soft delete marks records as deleted instead of removing them from the database.

### Hard Delete

```sql
-- Permanently removes data
DELETE FROM users WHERE id = '123';

-- Data gone forever
SELECT * FROM users WHERE id = '123'; -- Returns nothing
```

**Consequences:**
- ❌ Can't recover deleted data
- ❌ Foreign key issues (orphaned references)
- ❌ No audit trail
- ❌ Violates some compliance requirements (GDPR right to be forgotten allows deletion, but need audit trail)

### Soft Delete

```sql
-- Marks as deleted
UPDATE users SET deleted_at = NOW() WHERE id = '123';

-- Still in database
SELECT * FROM users WHERE id = '123'; -- Still there

-- Normal queries exclude it
SELECT * FROM users WHERE deleted_at IS NULL; -- Real users only
```

**Benefits:**
- ✅ Recoverable
- ✅ Audit trail (who deleted when)
- ✅ Foreign keys still valid
- ✅ Can analyze deleted data
- ✅ "Undo" functionality

### Implementation with Prisma

**Schema:**
```prisma
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  name      String
  deletedAt DateTime? @map("deleted_at")  // null = active, date = deleted

  @@index([deletedAt]) // Important for filtering
}
```

**Middleware (Automatic Filtering):**
```typescript
// Prisma middleware auto-excludes soft-deleted records
prisma.$use(async (params, next) => {
  if (params.model === 'User') {
    // findMany/findFirst auto-add: deletedAt: null
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = params.args.where || {};
      params.args.where.deletedAt = null;
    }

    // Convert delete to soft delete
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
  }
  return next(params);
});

// Now all queries are automatically safe!
await prisma.user.findMany(); // WHERE deleted_at IS NULL (automatic!)
await prisma.user.delete({ where: { id } }); // UPDATE users SET deleted_at = NOW()
```

**Restore Functionality:**
```typescript
// Restore deleted user
async function restoreUser(userId: string) {
  // Find deleted user (bypass middleware)
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: { not: null } // Specifically find deleted
    }
  });

  if (!user) {
    throw new Error('Deleted user not found');
  }

  // Restore (set deletedAt back to null)
  return prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null }
  });
}
```

### When to Use Soft Delete

**Use Soft Delete:**
1. **User accounts** - users want to "undo" deletion
2. **Content** - posts, documents (moderation, recovery)
3. **Orders** - compliance, audit requirements
4. **Anything with relationships** - avoid orphaned foreign keys

**Use Hard Delete:**
1. **GDPR compliance** - "right to be forgotten" (after retention period)
2. **Sensitive data** - security concerns
3. **Large-scale cleanup** - disk space critical
4. **Truly temporary data** - sessions, caches

### Compliance Considerations

**GDPR "Right to be Forgotten":**
```typescript
// Two-stage deletion
// 1. Soft delete (immediate)
await prisma.user.update({
  where: { id },
  data: {
    deletedAt: new Date(),
    // Optional: Anonymize PII
    email: `deleted_${id}@example.com`,
    name: 'Deleted User'
  }
});

// 2. Hard delete after retention period (30 days)
await prisma.user.deleteMany({
  where: {
    deletedAt: {
      lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
  }
});
```

### Performance Considerations

**Indexes are Critical:**
```prisma
model User {
  deletedAt DateTime?

  @@index([deletedAt]) // CRITICAL for WHERE deleted_at IS NULL
}

// Without index: Full table scan
// With index: Index scan (100x faster)
```

**Partition deleted data** (advanced):
```sql
-- Separate tables for active/deleted
CREATE TABLE users_active AS SELECT * FROM users WHERE deleted_at IS NULL;
CREATE TABLE users_deleted AS SELECT * FROM users WHERE deleted_at IS NOT NULL;

-- Queries only hit active table (smaller, faster)
```

**Interview Summary:**
"Soft delete sets a `deletedAt` timestamp instead of removing records, enabling recovery, maintaining foreign key integrity, and providing audit trails. Implement with Prisma middleware to automatically filter deleted records and convert DELETEs to UPDATEs. Use for user accounts, content, and anything needing recovery. Use hard delete for GDPR compliance, sensitive data, or disk space constraints. Always index `deletedAt` for query performance."

---

## Q13: "What are database migrations and why are they important?"

**Complete Answer:**

**Database migrations** are versioned changes to your database schema, tracked in code.

### The Problem Without Migrations

**Scenario:** 3 developers, 1 database

```typescript
// Dev A (Monday): Adds 'role' column
ALTER TABLE users ADD COLUMN role VARCHAR;

// Dev B (Tuesday): Doesn't know about role column
INSERT INTO users (email, name) VALUES (...); // ❌ Missing role!

// Dev C (Wednesday): Renames 'name' to 'full_name'
ALTER TABLE users RENAME COLUMN name TO full_name;

// Dev A's code (Thursday):
SELECT name FROM users; // ❌ Column doesn't exist!

// Production: Total chaos
```

**Problems:**
- ❌ No single source of truth
- ❌ Can't reproduce schema
- ❌ Can't rollback changes
- ❌ Developers out of sync
- ❌ Production deployments fragile

### Migrations Solution

**Version-controlled schema changes:**
```
prisma/migrations/
├── 20241210_init/
│   └── migration.sql
├── 20241211_add_role/
│   └── migration.sql
├── 20241212_rename_name/
│   └── migration.sql
└── migration_lock.toml
```

**Each migration file:**
```sql
-- Migration: 20241211_add_role/migration.sql
-- Created: 2024-12-11 10:30:00

-- Add role column
ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'USER';

-- Add index
CREATE INDEX idx_users_role ON users(role);
```

### How Migrations Work

**1. Development Flow:**
```bash
# 1. Update Prisma schema
# prisma/schema.prisma
model User {
  id    String @id
  email String
  role  Role   @default(USER)  // ← Added
}

# 2. Generate migration
npx prisma migrate dev --name add_role

# Prisma:
# - Compares schema to database
# - Generates SQL migration file
# - Applies migration to dev database
# - Updates Prisma Client types
```

**2. Team Collaboration:**
```bash
# Dev B pulls Dev A's changes
git pull

# Run migrations to sync database
npx prisma migrate dev

# Now Dev B's database matches Dev A's
```

**3. Production Deployment:**
```bash
# CI/CD pipeline
npx prisma migrate deploy

# Runs all pending migrations
# Atomic (all or nothing)
# Records applied migrations in _prisma_migrations table
```

### Migration Table

**Prisma tracks applied migrations:**
```sql
CREATE TABLE _prisma_migrations (
  id                  VARCHAR PRIMARY KEY,
  checksum            VARCHAR,
  finished_at         TIMESTAMP,
  migration_name      VARCHAR,
  logs                TEXT,
  rolled_back_at      TIMESTAMP,
  started_at          TIMESTAMP,
  applied_steps_count INTEGER
);

-- Example data:
-- 20241210_init | finished | 2024-12-10 10:00:00
-- 20241211_add_role | finished | 2024-12-11 15:30:00
```

**How it works:**
```
1. Read pending m igrations from disk
2. Check _prisma_migrations table
3. Apply only new migrations
4. Record completion
```

### Benefits

**1. Version Control**
```bash
git log prisma/migrations/

# See schema history
commit abc123: Add role column
commit def456: Rename name to full_name
commit ghi789: Add deleted_at for soft delete
```

**2. Reproducibility**
```bash
# Fresh database (dev, staging, prod)
npx prisma migrate deploy

# Applies ALL migrations in order
# Exact same schema everywhere
```

**3. Collaboration**
```bash
# No conflicts
Dev A: Adds migration 20241210_add_role
Dev B: Adds migration 20241210_add_status

# Both merge - both run
# No duplicates (tracked by ID)
```

**4. Rollback** (careful!)
```bash
# Prisma doesn't have automatic rollback
# But you can:

# 1. Revert migration commit
git revert abc123

# 2. Create new migration that undoes changes
npx prisma migrate dev --name revert_role

# Migration SQL:
ALTER TABLE users DROP COLUMN role;
```

### Migration Best Practices

**1. Backward Compatible Changes**
```sql
-- ✅ Safe (backward compatible)
ALTER TABLE users ADD COLUMN phone VARCHAR; -- New column (optional)
CREATE INDEX idx_email ON users(email); -- New index

-- ❌ Risky (breaking change)
ALTER TABLE users DROP COLUMN email; -- App crashes if deployed before code
ALTER TABLE users ALTER COLUMN name TYPE TEXT; -- Might truncate data
```

**2. Multi-Step Migrations** (for breaking changes)
```sql
-- Step 1: Add new column (deploy code + migration together)
ALTER TABLE users ADD COLUMN full_name VARCHAR;
UPDATE users SET full_name = name;

-- Deploy code that writes to both name AND full_name

-- Step 2: Wait a day, then drop old column
ALTER TABLE users DROP COLUMN name;

-- Deploy code that only uses full_name
```

**3. Data Migrations**
```sql
-- Schema migration + data migration
ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'active';

-- Migrate existing data
UPDATE users SET status = 'premium' WHERE subscription_id IS NOT NULL;
UPDATE users SET status = 'inactive' WHERE last_login < NOW() - INTERVAL '1 year';
```

**4. Test Migrations**
```bash
# Test on dev database first
npx prisma migrate dev

# Then staging
DATABASE_URL="staging" npx prisma migrate deploy

# Then production (during maintenance window)
DATABASE_URL="prod" npx prisma migrate deploy
```

### Common Interview Follow-Ups

**Q: "What if a migration fails midway?"**
```
Depends on database:

PostgreSQL: Uses transactions
- Migration wrapped in BEGIN/COMMIT
- If fails, rolls back automatically
- Database unchanged

MySQL (older): No DDL transactions
- Migration partially applied
- Database in corrupt state
- Need manual fix

Mitigation:
- Test migrations in staging first
- Have rollback plan
- Backup before big changes
```

**Q: "How do you handle migration conflicts?"**
```bash
# Two developers create migrations simultaneously
Dev A: 20241210_103000_add_role
Dev B: 20241210_103001_add_status

# Both merge to main
# On production:
npx prisma migrate deploy

# Runs both in timestamp order
# No conflict (separate migrations)

# Real conflict:
Dev A: Renames column 'name'
Dev B: Adds index on column 'name'

# Solution: Rebase and fix
git rebase main
# Resolve migration order
# Test combined changes
```

**Interview Summary:**
"Database migrations are version-controlled schema changes that ensure consistency across environments. Prisma generates migration files from schema changes, tracks applied migrations in a table, and applies pending migrations atomically. Benefits include reproducibility (same schema everywhere), collaboration (no conflicts), and audit trail (schema history in git). Best practices: backward-compatible changes, test in staging, multi-step for breaking changes, and combine schema + data migrations when needed."

---

## Q14: "Explain connection pooling and why it matters"

**Complete Answer:**

**Connection pooling** reuses database connections instead of creating new ones for each request.

### The Problem Without Pooling

**Naive approach:**
```typescript
// ❌ Create new connection per request
app.get('/users', async (req, res) => {
  const db = await createConnection(); // ← Expensive!
  const users = await db.query('SELECT * FROM users');
  await db.close();
  res.json(users);
});
```

**Cost of creating connection:**
```
1. TCP handshake (network round-trip)
2. PostgreSQL authentication
3. Session initialization
4. Close connection
Time: ~50-100ms per request!

100 requests/sec = spend 5-10 seconds just connecting!
```

**Additional problems:**
- Max connections limit (PostgreSQL default: 100)
- Connection leak (forgot to close)
- Resource exhaustion (too many open connections)

### Connection Pool Solution

**Pool maintains connections:**
```
Connection Pool (10 connections)
┌─────────────────────┐
│ [C1] [C2] [C3] ... │  Active (in use)
│ [C4] [C5] [C6] ... │  Idle (available)
└─────────────────────┘

Request comes in:
1. Borrow idle connection (instant)
2. Use for query
3. Return to pool
4. Next request reuses it
```

**Implementation with Prisma:**
```typescript
// Single PrismaClient instance (has built-in pool)
const prisma = new PrismaClient();

app.get('/users', async (req, res) => {
  // Reuses connection from pool
  const users = await prisma.user.findMany();
  res.json(users);
  // Connection returned to pool automatically
});
```

### Pool Configuration

**Prisma connection string:**
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20"
```

**Parameters:**
```
connection_limit: Maximum connections in pool
  - Default: (CPU cores * 2) + 1
  - Formula from PostgreSQL best practice
  - 4 cores = (4 * 2) + 1 = 9 connections

pool_timeout: Wait time for available connection (seconds)
  - Default: 10s
  - Too low: Requests fail under load
  - Too high: Users wait too long

connect_timeout: Time to establish initial connection
  - Default: 5s
```

### How to Size Your Pool

**Formula:**
```
Pool size = ((core_count × 2) + effective_spindle_count)

For typical web server:
- 4 CPU cores
- 1 disk (database on separate server, disk less relevant)
- Pool size = (4 × 2) + 1 = 9 connections

Why not more?
- PostgreSQL context switching overhead
- Memory per connection
- Diminishing returns
```

**Load testing:**
```javascript
// Simulate load
import autocannon from 'autocannon';

autocannon({
  url: 'http://localhost:3000/users',
  connections: 100, // 100 concurrent requests
  duration: 30 // 30 seconds
});

// Monitor Prisma pool metrics
// - Active connections
// - Wait time
// - Query duration

// Adjust pool size based on results
```

### Multiple Services Pooling

**Problem:**
```
5 service instances (containers)
Each has pool of 10 connections
Total: 5 × 10 = 50 connections to database

Database limit: 100 connections
Only 50 connections left for:
- Other services
- Admin access
- Background jobs
```

**Solution approaches:**

**1. Connection broker (PgBouncer):**
```
┌─────────────┐
│ Service 1   │───┐
│ Service 2   │───┤
│ Service 3   │───┼──→ PgBouncer ──→ PostgreSQL
│ Service 4   │───┤    (Connection    (100 conns)
│ Service 5   │───┘     pooler)
└─────────────┘
  (Each thinks       (Maintains
   it has 10          pool of 20
   connections)       real connections)
```

**2. Smaller pools per service:**
```
Database limit: 100
Services: 5
Admin: 5
Jobs: 5
Reserve: 10

Per service: (100 - 20) / 5 = 16 connections
```

**3. Serverless (Prisma Data Proxy):**
```
AWS Lambda (1000 instances) → Prisma Data Proxy → PostgreSQL
  Each has 1 connection        Pools connections    100 connections

Without proxy: 1000 connections needed (impossible!)
With proxy: 100 connections (proxy handles pooling)
```

### Monitoring Pool Health

**Metrics to track:**
```typescript
// Prisma Client extensions (future feature)
const prisma = new PrismaClient().$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      const start = Date.now();
      const result = await query(args);
      const duration = Date.now() - start;

      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query: ${model}.${operation} took ${duration}ms`);
      }

      return result;
    },
  },
});
```

**Database monitoring:**
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- By database
SELECT datname, count(*) 
FROM pg_stat_activity 
GROUP BY datname;

-- Idle connections
SELECT count(*) 
FROM pg_stat_activity 
WHERE state = 'idle';

-- Long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

### Common Pitfalls

**1. Creating multiple PrismaClient instances:**
```typescript
// ❌ Bad - each creates its own pool
app.get('/users', async (req, res) => {
  const prisma = new PrismaClient(); // New pool!
  const users = await prisma.user.findMany();
  res.json(users);
});

// 100 requests = 100 pools = 1000 connections!
```

**2. Not handling connection errors:**
```typescript
// ❌ Bad
try {
  await prisma.user.findMany();
} catch (error) {
  // Connection still held!
}

// ✅ Good - Prisma handles this automatically
// Connection returned to pool even on error
```

**3. Pool exhaustion:**
```typescript
// Symptom: "Timed out fetching a new connection from the pool"

// Causes:
// - Long-running transactions holding connections
// - Pool too small for load
// - Connection leaks
// - Slow queries

// Fix:
// - Increase pool size
// - Optimize queries
// - Use connection timeouts
// - Monitor active connections
```

**Interview Summary:**
"Connection pooling reuses database connections instead of creating new ones (which costs ~50-100ms). Prisma has built-in pooling with default size `(CPU cores × 2) + 1`. Benefits include faster response times (no connection overhead), resource efficiency (limit max connections), and automatic lifecycle management. Critical for production: use singleton PrismaClient, size pool based on load testing not guesses, monitor active connections, and consider PgBouncer for multiple service instances or serverless deployments."

---

## Q15: "How do you prevent the N+1 query problem with Prisma?"

**Complete Answer:**

The **N+1 problem** happens when you make 1 query to get N items, then N additional queries to get related data.

### The Problem

**Scenario:** Get users and their document counts

```typescript
// ❌ N+1 Problem
async function getUsers Bad() {
  // Query 1: Get all users
  const users = await prisma.user.findMany(); // → SELECT * FROM users

  // Query N: Get each user's documents
  for (const user of users) {
    user.docCount = await prisma.document.count({
      where: { createdBy: user.id }
    });
    // → SELECT COUNT(*) FROM documents WHERE created_by = 'user1'
    // → SELECT COUNT(*) FROM documents WHERE created_by = 'user2'
    // → SELECT COUNT(*) FROM documents WHERE created_by = 'user3'
    // ... (N more queries!)
  }

  return users;
}

// 10 users = 1 + 10 = 11 queries
// 100 users = 1 + 100 = 101 queries
// 1000 users = 1001 queries! 🔥
```

**Performance:**
```
Each query: ~5ms
100 users: 101 queries × 5ms = 505ms
vs
Single query: ~1ms

505x slower!
```

### Solution 1: Include (Eager Loading)

**Join related data in single query:**
```typescript
// ✅ Good - 1 query with JOIN
const users = await prisma.user.findMany({
  include: {
    documents: true // Loads all documents per user
  }
});
// →  SELECT * FROM users
//   LEFT JOIN documents ON documents.created_by = users.id

// Access documents
users[0].documents.forEach(doc => {
  console.log(doc.title);
});

// 1 query total!
```

**Selective include:**
```typescript
// Include but select specific fields
const users = await prisma.user.findMany({
  include: {
    documents: {
      select: {
        id: true,
        title: true,
        createdAt: true
        // Don't load content (large field)
      }
    }
  }
});
```

### Solution 2: Aggregations

**Count without loading all data:**
```typescript
// ❌ Bad - loads all documents just to count
const users = await prisma.user.findMany({
  include: {
    documents: true
  }
});
users.forEach(user => {
  user.docCount = user.documents.length; // Wasteful!
});

// ✅ Good - count in database
const users = await prisma.user.findMany({
  include: {
    _count: {
      select: {
        documents: true // COUNT(documents.id)
      }
    }
  }
});

users.forEach(user => {
  console.log(user._count.documents); // Just the count
});

// Generates:
// SELECT users.*, COUNT(documents.id) as documents_count
// FROM users
// LEFT JOIN documents ON documents.created_by = users.id
// GROUP BY users.id
```

### Solution 3: Batch Loading (DataLoader Pattern)

**For complex scenarios:**
```typescript
import DataLoader from 'dataloader';

// Batch load documents
const documentLoader = new DataLoader(async (userIds: string[]) => {
  // Single query for all users
  const documents = await prisma.document.groupBy({
    by: ['createdBy'],
    where: {
      createdBy: { in: userIds }
    },
    _count: true
  });

  // Return in same order as userIds
  return userIds.map(id =>
    documents.find(d => d.createdBy === id)?._count || 0
  );
});

// Usage
const users = await prisma.user.findMany();
const usersWithCounts = await Promise.all(
  users.map(async user => ({
    ...user,
    docCount: await documentLoader.load(user.id)
  }))
);

// Still 2 queries total (not N+1)
```

### Solution 4: Denormalization

**Store computed values:**
```prisma
model User {
  id       String @id
  email    String
  
  // Denormalized count (updated on document create/delete)
  docCount Int    @default(0)

  documents Document[]
}
```

```typescript
// Update count when document created
await prisma.$transaction([
  prisma.document.create({ data: { ... } }),
  prisma.user.update({
    where: { id: userId },
    data: { docCount: { increment: 1 } }
  })
]);

// Now just query users (no JOIN needed)
const users = await prisma.user.findMany(); // Has docCount already!
```

### Real-World Example: Nested Relations

**Scenario:** Users → Documents → Comments

```typescript
// ❌ Terrible - N+1+N problem
const users = await prisma.user.findMany(); // 1 query

for (const user of users) {
  user.documents = await prisma.document.findMany({
    where: { createdBy: user.id }
  }); // N queries

  for (const doc of user.documents) {
    doc.comments = await prisma.comment.findMany({
      where: { docId: doc.id }
    }); // N more queries
  }
}
// 10 users with 5 docs each = 1 + 10 + 50 = 61 queries!

// ✅ Good - 1 query with nested include
const users = await prisma.user.findMany({
  include: {
    documents: {
      include: {
        comments: true
      }
    }
  }
});
// 1 query with nested JOINs!
```

### How to Detect N+1

**1. Prisma logging:**
```typescript
const prisma = new PrismaClient({
  log: ['query'] // Log all SQL queries
});

// Check logs for repeated patterns:
// SELECT * FROM documents WHERE created_by = 'user1'
// SELECT * FROM documents WHERE created_by  = 'user2'  // ← Red flag!
// SELECT * FROM documents WHERE created_by = 'user3'
```

**2. APM tools:**
```
- New Relic
- DataDog
- Sentry

Look for:
- High query counts per request
- Multiple identical query patterns
- Linear scaling (N users = N queries)
```

**3. Database query log:**
```sql
-- PostgreSQL slow query log
SELECT query, calls
FROM pg_stat_statements
WHERE calls > 100 -- Many repeated queries
ORDER BY calls DESC;
```

### Interview Summary:**
"The N+1 problem occurs when fetching N items requires N+1 queries (1 for items, N for related data). Prevent with Prisma's `include` for eager loading (single JOIN query), `_count` for aggregations, DataLoader for batching, or denormalization for frequently accessed counts. Always use `include` for relational data instead of separate queries. Detect N+1 using Prisma query logging, APM tools, or database slow query logs."

---

**🎉 Phase 2 Fully Complete with Prisma Mastery!**

You now understand:
- ✅ ORM vs Raw SQL trade-offs
- ✅ Soft delete implementation
- ✅ Database migrations
- ✅ Connection pooling
- ✅ N+1 query prevention

All concepts implemented in `/services/user/` 🚀

