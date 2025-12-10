import { DocumentCreatedEvent, DocumentUpdatedEvent } from '@bookspace/common';
import { createLogger } from '@bookspace/logger';
import { Client } from '@elastic/elasticsearch';

const logger = createLogger({ service: 'worker-search-indexer' });

// Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
});

const INDEX_NAME = process.env.ELASTICSEARCH_INDEX || 'bookspace_documents';

/**
 * Handle document.created event - Index into Elasticsearch
 * 
 * Interview Topic: Real-time Search Indexing
 * 
 * Event-driven indexing:
 * 1. Document created in MongoDB
 * 2. Event published to RabbitMQ
 * 3. Worker receives event
 * 4. Index document in Elasticsearch
 * 
 * Benefits:
 * - Decoupled (Document Service doesn't know about search)
 * - Async (doesn't slow down document creation)
 * - Reliable (retry on failure)
 */
export async function handleDocumentIndexing(
  event: DocumentCreatedEvent | DocumentUpdatedEvent
): Promise<void> {
  logger.info({ documentId: event.data.documentId }, 'Indexing document');

  try {
    // Index document into Elasticsearch
    const createdEvent = event.type === 'document.created' ? (event as DocumentCreatedEvent) : null;
    const updatedEvent = event.type === 'document.updated' ? (event as DocumentUpdatedEvent) : null;

    await esClient.index({
      index: INDEX_NAME,
      id: event.data.documentId,
      document: {
        documentId: event.data.documentId,
        title: event.data.title,
        content: createdEvent ? undefined : undefined, // content not available in event
        tags: createdEvent ? createdEvent.data.tags : [],
        createdBy: createdEvent ? createdEvent.data.createdBy : updatedEvent!.data.updatedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info({ documentId: event.data.documentId }, 'Document indexed in Elasticsearch');
  } catch (error) {
    logger.error({ error, documentId: event.data.documentId }, 'Failed to index document');
    throw error; // Will trigger retry
  }
}
