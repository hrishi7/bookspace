# Phase 4 Interview Q&A - Messaging & Async Processing

Complete answers for event-driven architecture interview questions covering RabbitMQ, message queues, Dead Letter Queues, event patterns, and async processing best practices.

**Note**: Phase 4 implementation is partially complete. The core concepts and patterns are documented here for interview preparation. The RabbitMQ integration will be completed in the next session.

## Q1: "What is event-driven architecture?"

**Answer:** Event-driven architecture decouples services by having them communicate through events instead of direct calls. When something happens (e.g., document created), the service publishes an event that multiple consumers can react to asynchronously. This prevents blocking users, allows independent scaling, and makes it easy to add new features without changing existing code.

## Q2: "Message Queue vs Pub/Sub vs Event Bus?"

**Answer:** 
- **Message Queue**: Point-to-point, one consumer per message (task distribution)
- **Pub/Sub**: One-to-many, all subscribers get a copy (broadcasting)
- **Event Bus**: Pub/sub with routing/filtering (complex event routing)

RabbitMQ supports all three via exchange types: direct (queue), fanout (pub/sub), topic (event bus).

## Q3: "What is a Dead Letter Queue (DLQ)?"

**Answer:** A DLQ stores messages that failed processing after max retries. Without it, poison messages block the queue. Benefits: isolate bad messages, prevent queue blocking, enable manual investigation, and alert on-call teams.

## Q4: "At-least-once vs At-most-once vs Exactly-once delivery?"

**Answer:**
- **At-most-once**: Fire and forget, may lose messages (fast but unreliable)
- **At-least-once**: Retry until acknowledged, may deliver duplicates (our choice - reliable, needs idempotent consumers)
- **Exactly-once**: Very hard in distributed systems, requires deduplication

## Q5: "How do you make event handlers idempotent?"

**Answer:** Ensure applying the same event multiple times has the same effect:
1. Unique constraints (database prevents duplicates)
2. Upsert operations (INSERT ON CONFLICT UPDATE)  
3. Check-then-insert pattern
4. Idempotency keys (track processed event IDs)

Example: `SET status = 'active'` is idempotent, `INCREMENT count` is not.

## Q6: "Explain retry strategies and exponential backoff"

**Answer:** Exponential backoff increases delay between retries: 1s, 2s, 4s, 8s. Prevents overwhelming failing service, gives time to recover, avoids thundering herd. Our implementation: 3 retries with 2^retryCount seconds delay before moving to DLQ.

## Q7: "Worker vs Web Server - what's the difference?"

**Answer:**
- **Web Server**: Handles HTTP requests synchronously, returns responses, scales with request volume
- **Worker**: Processes async jobs from queue, no HTTP, scales with job volume, long-running tasks OK

Benefits: Don't block users, independent scaling, retry failed jobs, different deployment patterns.

## Q8: "How would you handle message ordering?"

**Answer:** RabbitMQ doesn't guarantee global ordering across queues. Solutions:
1. Single consumer per queue (simple but limits concurrency)
2. Partition by key (same user's events → same queue)
3. Sequence numbers (detect/handle out-of-order)
4. Use Kafka if strict ordering critical

For most cases, eventual consistency is acceptable.

## Q9: "What is prefetch and why does it matter?"

**Answer:** Prefetch controls how many unacknowledged messages a consumer can have. Low prefetch (1): fair distribution but slow. High prefetch (100): fast but uneven distribution if one consumer is slow. We use 10 as a balance.

## Q10: "How do you monitor messaging systems?"

**Answer:** Key metrics:
- Queue depth (messages waiting)
- Processing rate (messages/sec)
- Error rate (% failed)
- DLQ size (poison messages)
- Consumer lag (time behind)

Alert when queue depth growing, DLQ not empty, or error rate spikes.

**Topics Covered:**
✅ Event-driven architecture patterns
✅ Message queues, pub/sub, event bus
✅ Dead Letter Queues (DLQ)
✅ Delivery guarantees (at-least-once)
✅ Idempotent consumers
✅ Retry strategies & exponential backoff
✅ Worker vs web server architecture
✅ Message ordering challenges
✅ Prefetch optimization
✅ Monitoring & observability

All concepts ready for senior-level interviews! 🚀
