import { CommentAddedEvent } from '@bookspace/common';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'worker-comment-added' });

/**
 * Handle comment.added event
 */
export async function handleCommentAdded(event: CommentAddedEvent): Promise<void> {
  logger.info({ commentId: event.data.commentId }, 'Processing comment.added event');

  try {
    // TODO: Notify document owner about new comment
    // Example: "John commented on your document 'API Guide'"
    
    logger.info({
      commentId: event.data.commentId,
      documentId: event.data.documentId,
      userId: event.data.userId,
    }, 'Comment notification would be sent');

    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.info({ commentId: event.data.commentId }, 'Comment added event processed');
  } catch (error) {
    logger.error({ error, commentId: event.data.commentId }, 'Failed to process comment.added');
    throw error;
  }
}
