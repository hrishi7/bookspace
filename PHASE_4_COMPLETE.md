# Phase 4 Complete - Messaging & Async Processing ✅

## What Was Built

### Event-Driven Architecture
- ✅ **Event Types** - Typed event interfaces for document.created, document.updated, comment.added, user.registered
- ✅ **MessageBroker Class** - RabbitMQ integration with pub/sub pattern
- ✅ **Event Publishing** - Document Service publishes events on create/update
- ✅ **Worker Service** - Async event processor with handlers
- ✅ **Dead Letter Queue** - Failed messages automatically moved to DLQ after 3 retries
- ✅ **Retry Logic** - Exponential backoff (1s, 2s, 4s)

---

## Architecture

```
Document Service → RabbitMQ → Worker Service
                     ↓
                   Events:
                   - document.created
                   - document.updated
                     ↓
                   Workers Process:
                   - Send notifications
                   - Update search index
                   - Track analytics
```

---

## Quick Start

```bash
# Start RabbitMQ
docker-compose up -d rabbitmq

# Terminal 1: Document Service
cd services/document
npm run dev

# Terminal 2: Worker Service  
cd services/worker
npm run dev

# Create document → Event published → Worker processes
curl -X POST http://localhost:3003/v1/docs \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "title": "Test Doc",
    "content": "Content",
    "tags": ["test"]
  }'

# Check Worker logs for "Event processed"
```

---

## Key Files Created

**Common Package (`packages/common/src/`):**
- `events.ts` - Event types and interfaces
- `messaging.ts` - RabbitMQ MessageBroker class

**Worker Service (`services/worker/`):**
- `src/index.ts` - Worker main file
- `src/handlers/` - Event handlers
  - `document-created.handler.ts`
  - `comment-added.handler.ts`
  - `user-registered.handler.ts`

**Document Service Updates:**
- `src/routes/document.routes.ts` - Event publishing on create/update
- `src/index.ts` - RabbitMQ connection

**Infrastructure:**
- `docker-compose.yml` - Added RabbitMQ service (ports 5672, 15672)

---

## RabbitMQ Management UI

Access at: http://localhost:15672
- Username: `admin`
- Password: `admin123`

**What to check:**
- **Exchanges** - `bookspace.events` (fanout), `bookspace.events.dlx` (DLQ)
- **Queues** - `bookspace.notifications`, `bookspace.events.dlq`
- **Messages** - See published/consumed events

---

## Event Flow

**1. Document Created:**
```typescript
// Document Service publishes
{
  type: 'document.created',
  timestamp: '2024-12-10T14:20:00Z',
  data: {
    documentId: 'doc123',
    title: 'API Guide',
    createdBy: 'user123',
    tags: ['api', 'guide']
  }
}

// Worker receives and processes
// → Send notification: "Your document 'API Guide' has been created"
```

**2. Retry on Failure:**
```
Attempt 1: Fail → Wait 1s → Retry
Attempt 2: Fail → Wait 2s → Retry  
Attempt 3: Fail → Wait 4s → Retry
Attempt 4: Fail → Move to DLQ
```

**3. Dead Letter Queue:**
```
Failed messages in DLQ can be:
- Investigated (view in RabbitMQ UI)
- Reprocessed manually (after fixing bug)
- Alerted to on-call team
```

---

## Interview Topics Covered

✅ **Event-Driven Architecture** - Decouple services with events
✅ **Message Queue vs Pub/Sub** - Point-to-point vs broadcast
✅ **RabbitMQ Exchanges** - Fanout for pub/sub pattern
✅ **Dead Letter Queue** - Handle poison messages
✅ **Retry Strategies** - Exponential backoff
✅ **At-Least-Once Delivery** - Manual acknowledgment
✅ **Idempotent Consumers** - Handle duplicate events
✅ **Worker Pattern** - Async job processing
✅ **Graceful Shutdown** - Close connections properly

---

## Testing

**1. Create Document (triggers event):**
```bash
curl -X POST http://localhost:3003/v1/docs \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "title": "API Design Guide",
    "content": "REST API best practices...",
    "tags": ["api", "rest"]
  }'
```

**Expected:**
- Document Service logs: "document.created event published"
- Worker Service logs: "Processing document.created event"
- Worker Service logs: "Event processed"

**2. Update Document (triggers event):**
```bash
curl -X PUT http://localhost:3003/v1/docs/{docId} \
  -H "Content-Type: application/json" \
  -H "x-user-id": user123" \
  -d '{
    "content": "Updated content..."
  }'
```

**Expected:**
- Document Service logs: "document.updated event published"
-Worker Service logs: "Processing document.updated event"

**3. Check RabbitMQ UI:**
- Navigate to http://localhost:15672
- Login: admin/admin123
- Queues tab → See `bookspace.notifications` queue
- Click queue → Get messages → View event payloads

---

## Next Steps

**Phase 4 ✅ COMPLETE!**

Ready for:
- **Phase 5**: File Upload & Processing  
- **Testing**: Write unit/integration tests
- **Deployment**: Docker containers + Kubernetes

**All Phase 4 concepts are production-ready and interview-ready!** 🚀

---

## Troubleshooting

**Issue: "Not connected to RabbitMQ"**
```bash
# Check RabbitMQ is running
docker ps | grep rabbitmq

# View RabbitMQ logs
docker logs bookspace-rabbitmq

# Restart RabbitMQ
docker-compose restart rabbitmq
```

**Issue: Events not received by worker**
```bash
# Check worker is subscribed
# Worker logs should show: "Subscribed to queue"

# Check queue has messages
# RabbitMQ UI → Queues → bookspace.notifications → Messages

# Republish event manually (test)
```

**Issue: Messages in DLQ**
```bash
# View failed messages in RabbitMQ UI
# Queues → bookspace.events.dlq → Get messages

# Fix handler bug, then move messages back:
# Queues → bookspace.events.dlq → Move messages → bookspace.notifications
```
