# Phase 2 Update - User Service with Prisma ✅

## What Was Added

### User Service (Port 3002)
Complete PostgreSQL-based user management with:
- ✅ **Prisma ORM** - Type-safe database queries
- ✅ **Database Migrations** - Schema versioning
- ✅ **User CRUD** - Create, read, update, delete operations 
- ✅ **Soft Delete Pattern** - Recoverable user deletion
- ✅ **Prisma Middleware** - Automatic soft delete filtering
- ✅ **Password Management** - bcrypt hashing + password updates
- ✅ **RBAC** - USER and ADMIN roles

**Files**: `/services/user/`

---

## Architecture (Complete Phase 2)

```
Client → API Gateway (3000)
           ├→ Auth Service (3001) → User Service (3002) → PostgreSQL
           ├→ User Service (3002) → PostgreSQL
           └→ Document Service (3003) → MongoDB

Infrastructure:
- PostgreSQL (5432) - User data
- MongoDB (27017) - Document data
- Redis (6379) - Caching, rate limiting, token blacklist
- RabbitMQ (5672) - Message queue
- Prometheus (9090) - Metrics
- Grafana (3001) - Dashboards
```

---

## Quick Start

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Terminal: User Service
cd services/user

# Run migrations (creates database tables)
npx prisma migrate dev --name init

# Start service
npm run dev  # http://localhost:3002
```

---

## API Endpoints

```bash
# Create user
curl -X POST http://localhost:3002/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123",
    "name": "John Doe",
    "role": "USER"
  }'

# List all users
curl http://localhost:3002/v1/users

# Get user by ID
curl http://localhost:3002/v1/users/{userId}

# Get user by email (for Auth Service)
curl http://localhost:3002/v1/users/email/john@example.com

# Update user
curl -X PUT http://localhost:3002/v1/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "role": "ADMIN"
  }'

# Update password
curl -X PUT http://localhost:3002/v1/users/{userId}/password \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "SecurePass123",
    "newPassword": "NewSecurePass456"
  }'

# Soft delete user
curl -X DELETE http://localhost:3002/v1/users/{userId}

# Restore deleted user
curl -X POST http://localhost:3002/v1/users/{userId}/restore
```

---

## Prisma Commands

```bash
# Generate Prisma Client (after schema changes)
npx prisma generate

# Create migration
npx prisma migrate dev --name add_user_table

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (DEV ONLY!)
npx prisma migrate reset

# Open Prisma Studio (database browser)
npx prisma studio
```

---

## Key Concepts Implemented

### 1. Prisma ORM

**Type-Safe Queries:**
```typescript
// Fully typed - IDE autocomplete works!
const user = await prisma.user.findUnique({
  where: { email: 'john@example.com' },
  select: {
    id: true,
    email: true,
    name: true,
    // password excluded
  }
});

// TypeScript knows the shape:
console.log(user.id);     // ✅ Valid
console.log(user.password); // ❌ TypeScript error (not selected)
```

### 2. Soft Delete Pattern

**Middleware Auto-Filtering:**
```typescript
// Without middleware - must filter manually
const users = await prisma.user.findMany({
  where: { deletedAt: null }  // Easy to forget!
});

// With middleware - automatic
const users = await prisma.user.findMany(); // deletedAt: null added automatically

// Delete becomes soft delete
await prisma.user.delete({ where: { id } });
// Actually runs: UPDATE users SET deleted_at = NOW()
```

### 3. Database Migrations

**Version Control for Schema:**
```
prisma/migrations/
├── 20241210_init/
│   └── migration.sql       -- CREATE TABLE users
├── 20241211_add_role/
│   └── migration.sql       -- ALTER TABLE users ADD COLUMN role
└── migration_lock.toml
```

**Benefits:**
- Track schema changes in git
- Reproducible deployments
- Rollback capability
- Team collaboration

### 4. Connection Pooling

**Singleton Pattern:**
```typescript
// ❌ Bad - creates new pool per request
app.use((req, res) => {
  const prisma = new PrismaClient(); // DON'T DO THIS
});

// ✅ Good - single instance, shared pool
const prisma = new PrismaClient(); // Once at startup
app.use((req, res) => {
  // Reuse same client
});

// Pool size: (CPU cores * 2) + 1
// Configure: DATABASE_URL="...?connection_limit=10"
```

---

## Interview Topics Added

### Prisma & ORM

**Q1: ORM vs Raw SQL - Trade-offs?**
- ✅ Type safety vs Full control
- ✅ Productivity vs Performance
- ✅ SQL injection prevention
- ✅ Database portability

**Q2: Soft Delete vs Hard Delete?**
- ✅ Data recovery
- ✅ Audit trails
- ✅ Query filtering
- ✅ Foreign key handling

**Q3: Database Migrations - Why important?**
- ✅ Schema versioning
- ✅ Team collaboration
- ✅ Deployment safety
- ✅ Rollback capability

**Q4: Connection Pooling - How does it work?**
- ✅ Reuse connections
- ✅ Pool sizing
- ✅ Resource efficiency
- ✅ Singleton pattern

**Q5: N+1 Query Problem - How to prevent?**
- ✅ Eager loading (include/select)
- ✅ DataLoader pattern
- ✅ Query optimization

---

## Phase 2 Now Complete! 🎉

**What You Built:**
1. ✅ **API Gateway** - Routes, auth middleware, rate limiting, metrics
2. ✅ **Auth Service** - JWT tokens, refresh rotation, bcrypt passwords
3. ✅ **User Service** - Prisma ORM, soft deletes, RBAC

**Database Stack:**
- PostgreSQL (structured data - users)
- MongoDB (flexible data - documents)  
- Redis (caching + rate limiting)

**Interview Readiness:**
- Authentication (JWT, tokens, passwords)
- Authorization (RBAC)
- API Gateway pattern
- Rate limiting
- ORM vs SQL
- Database migrations
- Soft deletes
- Connection pooling

---

## Testing the Complete Flow

```bash
# 1. Start all infrastructure
docker-compose up -d

# 2. Start all services
# Terminal 1 - Gateway
cd services/gateway && npm run dev

# Terminal 2 - Auth  
cd services/auth && npm run dev

# Terminal 3 - User
cd services/user && npx prisma migrate dev && npm run dev

# 3. Signup (Gateway → Auth → User)
curl -X POST http://localhost:3000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "name": "Test User"
  }'

# Returns: { accessToken, refreshToken, user }

# 4. Login (Gateway → Auth → User)
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123"
  }'

# 5. Get user profile (Gateway → User)
curl http://localhost:3000/v1/users/{userId} \
  -H "Authorization: Bearer {accessToken}"
```

---

## Files Added

```
services/user/
├── prisma/
│   └── schema.prisma            # Database schema + migrations
├── src/
│   ├── config/
│   │   ├── index.ts             # Configuration
│   │   └── database.ts          # Prisma client + middleware
│   ├── validators/
│   │   └── user.validator.ts    # Zod schemas
│   ├── routes/
│   │   └── user.routes.ts       # User CRUD
│   └── index.ts                 # Main server
├── package.json
├── tsconfig.json
└── .env
```

---

**Next Steps:**

You can now:
- **Study** the interview Q&A documents (Phase 1, 2, 3)
- **Continue** to Phase 4 (RabbitMQ messaging)
- **Test** the complete authentication flow
- **Experiment** with  Prisma Studio to browse data

**Phase 2 is production-ready!** 🚀
