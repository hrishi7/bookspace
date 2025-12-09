# BookSpace - Production-Grade Distributed REST API

A comprehensive learning project demonstrating production-level Node.js backend development with microservices architecture.

## 🎯 Project Goals

Build a distributed backend system for document management that demonstrates:
- **Microservices Architecture**: Multiple independent services communicating via REST and message queue
- **Advanced Node.js**: Cluster mode, worker threads, streams, event loop optimization
- **Production Patterns**: Caching, rate limiting, retry mechanisms, graceful shutdown
- **Observability**: Structured logging, metrics, distributed tracing
- **Security**: JWT authentication, RBAC, rate limiting, input validation

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
┌──────▼──────────┐
│  API Gateway    │
│  (Port 3000)    │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬───────────┬──────────┬──────────┐
    │         │          │           │          │          │
┌───▼──┐  ┌──▼──┐  ┌────▼────┐  ┌──▼───┐  ┌───▼────┐  ┌──▼────┐
│ Auth │  │User │  │Document │  │ File │  │ Search │  │Worker │
│ 3001 │  │3002 │  │  3003   │  │ 3004 │  │  3005  │  │ 3006  │
└──┬───┘  └──┬──┘  └────┬────┘  └──┬───┘  └───┬────┘  └──┬────┘
   │         │          │           │          │          │
   └─────────┴──────────┴───────────┴──────────┴──────────┘
                        │
         ┌──────────────┼──────────────┬──────────┐
         │              │              │          │
    ┌────▼────┐    ┌───▼────┐    ┌───▼──┐    ┌──▼──────┐
    │PostgreSQL│    │MongoDB │    │Redis │    │RabbitMQ │
    └─────────┘    └────────┘    └──────┘    └─────────┘
```

## 📁 Project Structure

```
bookspace/
├── services/              # Microservices
│   ├── gateway/          # API Gateway + routing (3000)
│   ├── auth/             # Authentication service (3001)
│   ├── user/             # User management (3002)
│   ├── document/         # Document CRUD + versioning (3003)
│   ├── file/             # File upload with streams (3004)
│   ├── search/           # Search service (3005)
│   └── worker/           # Background job processor (3006)
├── packages/             # Shared packages
│   ├── common/          # Utilities, errors, validators
│   ├── logger/          # Structured logging (Pino)
│   └── types/           # Shared TypeScript types
├── docker-compose.yml   # Local development environment
└── prometheus.yml       # Metrics collection config
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build shared packages:
```bash
npm run build -w @bookspace/logger
npm run build -w @bookspace/common
npm run build -w @bookspace/types
```

3. Start infrastructure services:
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- MongoDB on port 27017
- Redis on port 6379
- RabbitMQ on port 5672 (management UI: http://localhost:15672)
- Prometheus on port 9090
- Grafana on port 3001

### Development

Each service can be developed independently:
```bash
cd services/gateway
npm install
npm run dev
```

## 🧪 Tech Stack

### Core
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express (with option for Fastify)
- **Monorepo**: npm workspaces

### Databases
- **PostgreSQL**: User data, notifications (with Prisma ORM)
- **MongoDB**: Documents, comments (with Mongoose)
- **Redis**: Caching, rate limiting, session store

### Infrastructure
- **RabbitMQ**: Message queue for async tasks
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Docker**: Containerization

### Libraries
- **Pino**: Structured logging
- **Zod**: Runtime validation
- **JWT**: Authentication tokens
- **bcrypt**: Password hashing

## 📚 Learning Path

### Phase 1: Foundation ✅ (Current)
- [x] Monorepo setup with npm workspaces
- [x] TypeScript configuration
- [x] Shared packages (logger, common, types)
- [x] Docker Compose infrastructure
- [ ] Next: Start building services

### Phase 2: Auth & Users (Coming Next)
- API Gateway implementation
- JWT authentication
- User service with PostgreSQL
- Rate limiting

### Phase 3-10: [See implementation_plan.md]

## 🔧 Key Concepts Covered

### Interview Topics
- Microservices vs Monolith
- Event-driven architecture
- Database selection (SQL vs NoSQL)
- Caching strategies
- Message queues vs Event buses
- Horizontal scaling
- Node.js cluster mode
- Worker threads
- Streams and backpressure
- Graceful shutdown
- Observability (logs, metrics, traces)
- Security best practices

## 📊 Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **RabbitMQ Management**: http://localhost:15672 (bookspace/bookspace_dev_password)

## 🎓 After Completion

You'll be ready to answer senior-level interview questions about:
1. How to scale Node.js applications
2. Microservices architecture patterns
3. Message queue reliability
4. Caching strategies
5. Authentication & authorization
6. Database transactions in distributed systems
7. Error handling & retry mechanisms
8. Production monitoring & observability
9. Node.js internals (event loop, cluster, workers)
10. System design for high-traffic APIs

## 📝 License

MIT - This is a learning project

---

**Current Status**: Phase 1 Foundation Complete ✅  
**Next**: Implement API Gateway and Auth Service
