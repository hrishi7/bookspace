import { Router, Request, Response, NextFunction } from 'express';
import { NotFoundError, BadRequestError } from '@bookspace/common';
import { createPaginatedResponse } from '@bookspace/common';
import { DocumentModel } from '../models/document.model';
import { CommentModel } from '../models/comment.model';
import {
  createDocumentSchema,
  updateDocumentSchema,
  searchDocumentsSchema,
  addCommentSchema,
} from '../validators/document.validator';
import {
  getCachedDocument,
  cacheDocument,
  invalidateDocumentCache,
  getCachedComments,
  cacheComments,
  invalidateCommentsCache,
} from '../config/redis';

const router = Router();

/**
 * GET /v1/docs
 * 
 * List documents with pagination and filtering
 * 
 * Interview Topic: Pagination Strategies
 * 
 * 1. Offset-based (our approach)
 *    - page=1&limit=20
 *    - SQL: OFFSET 0 LIMIT 20
 *    - Pros: Simple, can jump to any page
 *    - Cons: Slow for large offsets, misses data if items added/deleted
 * 
 * 2. Cursor-based
 *    - cursor=lastId&limit=20
 *    - Query: WHERE id > cursor LIMIT 20
 *    - Pros: Consistent results, fast for any position
 *    - Cons: Can't jump to page, more complex
 * 
 * 3. Keyset pagination
 *    - after=2024-10-15&limit=20
 *    - Query: WHERE created_at > after LIMIT 20
 *    - Pros: Very fast, consistent
 *    - Cons: Requires sortable key
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, q, tags, userId } = searchDocumentsSchema.parse(req.query);

    // Build query
    const query: any = {};

    if (userId) {
      query.createdBy = userId;
    }

    if (tags) {
      query.tags = { $in: tags.split(',') };
    }

    if (q) {
      // Text search
      query.$text = { $search: q };
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const [documents, total] = await Promise.all([
      DocumentModel.find(query)
        .select('-versions') // Exclude versions from list
        .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DocumentModel.countDocuments(query),
    ]);

    req.log.info({ total, page, limit }, 'Documents listed');

    res.json({
      success: true,
      data: createPaginatedResponse(documents, page, limit, total),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/docs
 * 
 * Create new document
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, content, tags } = createDocumentSchema.parse(req.body);
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // Create document with initial version
    const document = await DocumentModel.create({
      title,
      content,
      tags,
      createdBy: userId,
      versions: [{
        version: 1,
        content,
        updatedAt: new Date(),
        updatedBy: userId,
      }],
    });

    req.log.info({ docId: document._id, userId }, 'Document created');

    // TODO: Publish doc.created event to RabbitMQ

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/docs/:id
 * 
 * Get single document by ID (with caching)
 * 
 * Interview Topic: Cache-Aside Pattern
 * 
 * Flow:
 * 1. Check cache
 * 2. If hit → return cached data
 * 3. If miss → fetch from DB
 * 4. Store in cache
 * 5. Return data
 * 
 * Also called: Lazy Loading
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Try cache first
    let document = await getCachedDocument(id);

    if (document) {
      req.log.info({ docId: id }, 'Document retrieved from cache');
      return res.json({
        success: true,
        data: document,
        cached: true,
      });
    }

    // Cache miss - fetch from DB
    document = await DocumentModel.findById(id).lean();

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Cache for next request
    await cacheDocument(id, document);

    req.log.info({ docId: id }, 'Document retrieved from database');

    res.json({
      success: true,
      data: document,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /v1/docs/:id
 * 
 * Update document (creates new version)
 * 
 * Interview Topic: Optimistic vs Pessimistic Locking
 * 
 * Optimistic locking:
 * - Don't lock during read
 * - Check version before write
 * - If version changed → conflict
 * - Pros: Better concurrency
 * - Cons: Conflicts need handling
 * 
 * Pessimistic locking:
 * - Lock during read
 * - Prevent concurrent updates
 * - Pros: No conflicts
 * - Cons: Lower concurrency
 * 
 * For document edits, optimistic is better
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = updateDocumentSchema.parse(req.body);
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // Find document
    const document = await DocumentModel.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Update fields
    if (updates.title) document.title = updates.title;
    if (updates.tags) document.tags = updates.tags;

    // If content changed, create new version
    if (updates.content && updates.content !== document.content) {
      document.addVersion(updates.content, userId);
    }

    await document.save();

    // Invalidate cache
    await invalidateDocumentCache(id);

    req.log.info({ docId: id, userId, version: document.currentVersion }, 'Document updated');

    // TODO: Publish doc.updated event

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/docs/:id
 * 
 * Delete document
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const document = await DocumentModel.findByIdAndDelete(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Invalidate cache
    await invalidateDocumentCache(id);

    // Also delete all comments
    await CommentModel.deleteMany({ docId: id });
    await invalidateCommentsCache(id);

    req.log.info({ docId: id }, 'Document deleted');

    res.json({
      success: true,
      data: { message: 'Document deleted' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/docs/:id/versions
 * 
 * Get document version history
 */
router.get('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const document = await DocumentModel.findById(id)
      .select('versions title')
      .lean();

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      data: {
        title: document.title,
        versions: document.versions,
        currentVersion: document.versions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/docs/:id/versions/:version
 * 
 * Get specific version content
 */
router.get('/:id/versions/:version', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, version } = req.params;
    const versionNum = parseInt(version, 10);

    const document = await DocumentModel.findById(id).lean();
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const versionData = document.versions.find(v => v.version === versionNum);
    if (!versionData) {
      throw new NotFoundError('Version not found');
    }

    res.json({
      success: true,
      data: versionData,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
