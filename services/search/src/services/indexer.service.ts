import { esClient } from '../config/elasticsearch';
import { config } from '../config';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'search-indexer' });

const INDEX_NAME = config.elasticsearch.index;

/**
 * Document to be indexed
 */
export interface DocumentToIndex {
  documentId: string;
  title: string;
  content: string;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Index a single document
 * 
 * Interview Topic: Indexing Strategy
 * 
 * Real-time vs Batch:
 * - Real-time: Index immediately (our choice for updates)
 * - Batch: Bulk index many docs (for initial load)
 * 
 * Trade-off:
 * - Real-time: Fresh data, slower
 * - Batch: Faster, slight delay
 */
export async function indexDocument(doc: DocumentToIndex): Promise<void> {
  try {
    await esClient.index({
      index: INDEX_NAME,
      id: doc.documentId,
      document: {
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdBy: doc.createdBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });

    logger.info({ documentId: doc.documentId }, 'Document indexed');
  } catch (error) {
    logger.error({ error, documentId: doc.documentId }, 'Failed to index document');
    throw error;
  }
}

/**
 * Bulk index multiple documents
 * 
 * Interview Topic: Bulk Operations
 * 
 * Why bulk?
 * - Single HTTP request for N documents
 * - ~10x faster than N individual requests
 * - Less network overhead
 * 
 * Use for:
 * - Initial data load
 * - Periodic re-indexing
 */
export async function bulkIndexDocuments(docs: DocumentToIndex[]): Promise<void> {
  if (docs.length === 0) return;

  try {
    const operations = docs.flatMap((doc) => [
      { index: { _index: INDEX_NAME, _id: doc.documentId } },
      {
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdBy: doc.createdBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    ]);

    const result = await esClient.bulk({
      operations,
      refresh: true, // Make searchable immediately
    });

    if (result.errors) {
      logger.error({ errors: result.items }, 'Bulk indexing had errors');
    } else {
      logger.info({ count: docs.length }, 'Bulk indexed documents');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to bulk index documents');
    throw error;
  }
}

/**
 * Delete document from index
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    await esClient.delete({
      index: INDEX_NAME,
      id: documentId,
    });

    logger.info({ documentId }, 'Document deleted from index');
  } catch (error) {
    logger.error({ error, documentId }, 'Failed to delete document');
    throw error;
  }
}

/**
 * Update document in index
 */
export async function updateDocument(
  documentId: string,
  updates: Partial<DocumentToIndex>
): Promise<void> {
  try {
    await esClient.update({
      index: INDEX_NAME,
      id: documentId,
      doc: updates,
    });

    logger.info({ documentId }, 'Document updated in index');
  } catch (error) {
    logger.error({ error, documentId }, 'Failed to update document');
    throw error;
  }
}
