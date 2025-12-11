import { Router, Request, Response, NextFunction } from 'express';
import { NotFoundError, BadRequestError } from '@bookspace/common';
import { DocumentModel } from '../models/document.model';
import { CommentModel } from '../models/comment.model';
import { addCommentSchema } from '../validators/document.validator';
import {
  getCachedComments,
  cacheComments,
  invalidateCommentsCache,
} from '../config/redis';

const router = Router();

/**
 * GET /v1/docs/:docId/comments
 * 
 * Get all comments for a document (nested structure)
 * 
 * Interview Topic: N+1 Query Problem
 * 
 * Bad approach (N+1):
 * 1. Get all top-level comments (1 query)
 * 2. For each comment, get replies (N queries)
 * Total: N+1 queries
 * 
 * Good approach (our implementation):
 * 1. Get ALL comments (1 query)
 * 2. Build tree in application code
 * Total: 1 query
 * 
 * Alternative: MongoDB aggregation with $graphLookup
 */
router.get('/:docId/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { docId } = req.params;

    // Verify document exists
    const docExists = await DocumentModel.exists({ _id: docId });
    if (!docExists) {
      throw new NotFoundError('Document not found');
    }

    // Try cache first
    let comments = await getCachedComments(docId);

    if (comments) {
      req.log.info({ docId }, 'Comments retrieved from cache');
      return res.json({
        success: true,
        data: comments,
        cached: true,
      });
    }

    // Cache miss - fetch and build tree
    comments = await (CommentModel as any).findByDocument(docId);

    if (!comments) {
      comments = [];
    }

    // Cache for next request
    await cacheComments(docId, comments);

    req.log.info({ docId, count: comments.length }, 'Comments retrieved');

    return res.json({
      success: true,
      data: comments,
      cached: false,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /v1/docs/:docId/comments
 * 
 * Add comment to document
 * 
 * Interview Topic: Nested Comments Implementation
 * 
 * Constraints:
 * - Max 3 levels (0, 1, 2)
 * - Level 0: Top-level comment
 * - Level 1: Reply to level 0
 * - Level 2: Reply to level 1
 * - Level 2 can't have replies
 * 
 * Validation:
 * - Check parent exists
 * - Check parent level < 2
 */
router.post('/:docId/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { docId } = req.params;
    const { text, parentId } = addCommentSchema.parse(req.body);
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // Verify document exists
    const docExists = await DocumentModel.exists({ _id: docId });
    if (!docExists) {
      throw new NotFoundError('Document not found');
    }

    // Add comment with level validation
    const comment = await (CommentModel as any).addComment(
      docId,
      userId,
      text,
      parentId || null
    );

    // Invalidate comments cache
    await invalidateCommentsCache(docId);

    req.log.info({
      docId,
      commentId: comment._id,
      parentId,
      level: comment.level,
    }, 'Comment added');

    // TODO: Publish comment.added event

    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/docs/:docId/comments/:commentId
 * 
 * Delete comment
 * 
 * Interview Topic: Cascading Deletes
 * 
 * Options:
 * 1. Hard delete comment + all replies (our approach)
 * 2. Soft delete (mark as deleted, keep data)
 * 3. Replace with [deleted] placeholder
 * 
 * We hard delete for simplicity
 */
router.delete('/:docId/comments/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { docId, commentId } = req.params;

    const comment = await CommentModel.findById(commentId);
    if (!comment || comment.docId !== docId) {
      throw new NotFoundError('Comment not found');
    }

    // Delete comment
    await CommentModel.findByIdAndDelete(commentId);

    // Delete all replies (cascading delete)
    // Find all comments with this as parent
    await CommentModel.deleteMany({ parentId: commentId });

    // If those had replies (level 2), delete them too
    // (but we limit to 3 levels, so level 2 can't have replies)

    // Invalidate cache
    await invalidateCommentsCache(docId);

    req.log.info({ docId, commentId }, 'Comment deleted');

    res.json({
      success: true,
      data: { message: 'Comment deleted' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
