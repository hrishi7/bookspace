import { Client } from '@elastic/elasticsearch';
import { createLogger } from '@bookspace/logger';
import { config } from './index';

const logger = createLogger({ service: 'search-elasticsearch' });

/**
 * Elasticsearch Client
 * 
 * Interview Topic: Inverted Index
 * 
 * How Elasticsearch works:
 * 1. Documents indexed → Inverted index created
 * 2. Search query → Lookup in inverted index
 * 3. Score results by relevance (TF-IDF, BM25)
 * 
 * Inverted Index Example:
 * Document 1: "Node.js is fast"
 * Document 2: "Node.js and Express"
 * 
 * Inverted Index:
 * "node.js" → [Doc 1, Doc 2]
 * "fast" → [Doc 1]
 * "express" → [Doc 2]
 * 
 * Search "Node.js" → Instant lookup → Returns [Doc 1, Doc 2]
 */
export const esClient = new Client({
  node: config.elasticsearch.node,
});

/**
 * Initialize Elasticsearch index with mappings
 * 
 * Interview Topic: Index Mappings
 * 
 * Mappings = Schema for Elasticsearch
 * - Define field types (text, keyword, date)
 * - Configure analyzers (how to tokenize text)
 * - Set up search optimization
 */
export async function initializeIndex(): Promise<void> {
  const indexName = config.elasticsearch.index;

  try {
    // Check if index exists
    const exists = await esClient.indices.exists({ index: indexName });

    if (!exists) {
      // Create index with mappings
      await esClient.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of replicas: 0,
            analysis: {
              analyzer: {
                // Custom analyzer for better search
                custom_text_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'stop', 'snowball'],
                },
              },
            },
          },
          mappings: {
            properties: {
              documentId: { type: 'keyword' }, // Exact match
              title: {
                type: 'text',
                analyzer: 'custom_text_analyzer',
                fields: {
                  keyword: { type: 'keyword' }, // For sorting/aggregation
                  completion: { type: 'completion' }, // For auto-complete
                },
              },
              content: {
                type: 'text',
                analyzer: 'custom_text_analyzer',
              },
              tags: {
                type: 'keyword', // For faceted search
              },
              createdBy: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });

      logger.info({ index: indexName }, 'Elasticsearch index created');
    } else {
      logger.info({ index: indexName }, 'Elasticsearch index already exists');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Elasticsearch index');
    throw error;
  }
}

/**
 * Health check
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const health = await esClient.cluster.health();
    return health.status !== 'red';
  } catch (error) {
    logger.error({ error }, 'Elasticsearch health check failed');
    return false;
  }
}

logger.info({ node: config.elasticsearch.node }, 'Elasticsearch client initialized');
