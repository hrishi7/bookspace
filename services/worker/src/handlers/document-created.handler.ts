import { DocumentCreatedEvent } from '@bookspace/common';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'worker-document-created' });

/**
 * Handle document.created event
 * 
 * Interview Topic: Idempotent Consumers
 * 
 * Problem: At-least-once delivery means duplicates possible
 * Solution: Make handlers idempotent
 * 
 * Idempotent operation:
 * - Applying multiple times = same result as once
 * - Example: SET status = 'active' (safe to run multiple times)
 * - Counter-example: INCREMENT count (not idempotent!)
 * 
 * Strategies:
 * 1. Unique constraint (database prevents duplicates)
 * 2. Upsert (INSERT ... ON CONFLICT UPDATE)
 * 3. Check if already processed (SELECT before INSERT)
 * 4. Idempotency key (store processed<br/> event IDs)
 */
export async function handleDocumentCreated(event: DocumentCreatedEvent): Promise<void> {
  logger.info({ documentId: event.data.documentId }, 'Processing document.created event');

  try {
    // TODO: Send notification to document creator
    // Example: "Your document 'X' has been created"
    
    // For now, just log
    logger.info({
      documentId: event.data.documentId,
      title: event.data.title,
      createdBy: event.data.createdBy,
    }, 'Document created notification would be sent');

    // In real implementation:
    // await sendNotification({
    //   userId: event.data.createdBy,
    //   type: 'document_created',
    //   message: `Your document "${event.data.title}" has been created`,
    //   metadata: { documentId: event.data.documentId }
    // });

    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.info({ documentId: event.data.documentId }, 'Document created event processed');
  } catch (error) {
    logger.error({ error, documentId: event.data.documentId }, 'Failed to process document.created');
    throw error; // Will trigger retry
  }
}
