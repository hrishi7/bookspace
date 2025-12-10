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
- Code comments explain the "why" behind every decision
