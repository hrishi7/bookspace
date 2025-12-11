import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { esClient } from '../config/elasticsearch';
import { config } from '../config';

const router = Router();
const INDEX_NAME = config.elasticsearch.index;

/**
 * Search Query Schema
 */
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  tags: z.string().optional(), // Comma-separated
  author: z.string().optional(),
  sortBy: z.enum(['relevance', 'date', 'title']).default('relevance'),
});

/**
 * GET /v1/search
 * 
 * Full-text search with relevance scoring
 * 
 * Interview Topic: Relevance Scoring (TF-IDF and BM25)
 * 
 * TF-IDF (Term Frequency - Inverse Document Frequency):
 * - TF: How often term appears in document
 * - IDF: How rare term is across all documents
 * - Score = TF * IDF
 * 
 * BM25 (Best Match 25) - Modern algorithm used by Elasticsearch:
 * - Improved TF-IDF
 * - Accounts for document length
 * - Saturation function (diminishing returns for repetition)
 * 
 * Example:
 * Query: "Node.js tutorial"
 * Doc A: "Node.js tutorial for beginners" (high score)
 * Doc B: "Node.js is great" (medium score)
 * Doc C: "JavaScript frameworks" (low score)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      q,
      page,
      pageSize,
      tags,
      author,
      sortBy,
    } = searchQuerySchema.parse(req.query);

    // Build Elasticsearch query
    const must: Array<{
      multi_match?: any;
      terms?: any;
      term?: any;
    }> = [
      {
        multi_match: {
          query: q,
          fields: ['title^3', 'content', 'tags^2'], // ^3 = 3x boost for title
          type: 'best_fields',
          fuzziness: 'AUTO', // Typo tolerance
        },
      },
    ];

    // Faceted search - filter by tags
    if (tags) {
      const tagArray = tags.split(',').map((t) => t.trim());
      must.push({
        terms: {
          tags: tagArray,
        },
      });
    }

    // Filter by author
    if (author) {
      must.push({
        term: {
          createdBy: author,
        },
      });
    }

    // Sorting
    let sort: Array<{ [key: string]: string }> = [];
    if (sortBy === 'date') {
      sort = [{ createdAt: 'desc' }];
    } else if (sortBy === 'title') {
      sort = [{ 'title.keyword': 'asc' }];
    }
    // relevance = default (score-based)

    // Execute search
    const result = await esClient.search({
      index: INDEX_NAME,
      from: (page - 1) * pageSize,
      size: pageSize,
      query: {
        bool: {
          must,
        },
      },
      sort: sort.length > 0 ? sort : undefined,
      highlight: {
        fields: {
          title: {},
          content: {
            fragment_size: 150,
            number_of_fragments: 3,
          },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      // Aggregations for faceted search
      aggs: {
        top_tags: {
          terms: {
            field: 'tags',
            size: 10,
          },
        },
        authors: {
          terms: {
            field: 'createdBy',
            size: 10,
          },
        },
      },
    });

    req.log.info({
      query: q,
      hits: result.hits.total,
      took: result.took,
    }, 'Search executed');

    res.json({
      success: true,
      data: {
        query: q,
        total: typeof result.hits.total === 'object' ? result.hits.total.value : result.hits.total,
        page,
        pageSize,
        results: result.hits.hits.map((hit: any) => ({
          documentId: hit._id,
          score: hit._score,
          ...(hit._source as object),
          highlights: hit.highlight,
        })),
        facets: {
          tags: (result.aggregations?.top_tags as { buckets: unknown[] })?.buckets || [],
          authors: (result.aggregations?.authors as { buckets: unknown[] })?.buckets || [],
        },
        took: result.took, // milliseconds
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/search/suggest
 * 
 * Auto-complete suggestions
 * 
 * Interview Topic: Auto-complete Implementation
 * 
 * Approaches:
 * 1. Prefix matching: "nod" → "node.js"
 * 2. N-grams: Break into chunks (slower but flexible)
 * 3. Completion suggester: Optimized for auto-complete (our choice)
 * 
 * Completion Suggester:
 * - Special data structure (FST - Finite State Transducer)
 * - Very fast (milliseconds)
 * - Returns top suggestions based on frequency/score
 */
router.get('/suggest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = z.object({
      q: z.string().min(1).max(100),
    }).parse(req.query);

    // Use completion suggester
    const result = await esClient.search({
      index: INDEX_NAME,
      suggest: {
        title_suggest: {
          prefix: q,
          completion: {
            field: 'title.completion',
            size: 10,
            skip_duplicates: true,
          },
        },
      },
    });

    const options = result.suggest?.title_suggest?.[0]?.options;
    const suggestions = Array.isArray(options)
      ? options.map((opt: any) => ({
          text: opt.text,
          score: opt._score,
          documentId: opt._id,
        }))
      : [];

    req.log.info({ query: q, count: suggestions.length }, 'Suggestions generated');

    res.json({
      success: true,
      data: {
        query: q,
        suggestions,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/search/analytics
 * 
 * Search analytics - most searched terms
 * 
 * Interview Topic: Search Analytics
 * 
 * Why track searches?
 * - Understand user intent
 * - Improve search relevance
 * - Identify content gaps
 * - A/B test ranking algorithms
 * 
 * What to track:
 * - Query terms
 * - Click-through rate (CTR)
 * - Zero-result queries
 * - Query refinements
 */
router.get('/analytics', async (_: Request, res: Response, next: NextFunction) => {
  try {
    // Get top search terms from Elasticsearch index
    // In production, you'd have a separate analytics index
    const result = await esClient.search({
      index: INDEX_NAME,
      size: 0, // Don't return documents
      aggs: {
        popular_terms: {
          terms: {
            field: 'title.keyword',
            size: 10,
          },
        },
        popular_tags: {
          terms: {
            field: 'tags',
            size: 10,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        popularTerms: (result.aggregations?.popular_terms as { buckets: unknown[] })?.buckets || [],
        popularTags: (result.aggregations?.popular_tags as { buckets: unknown[] })?.buckets || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
