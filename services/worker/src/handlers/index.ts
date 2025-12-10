import { Event, EventType } from '@bookspace/common';
import { handleDocumentCreated } from './document-created.handler';
import { handleCommentAdded } from './comment-added.handler';
import { handleUserRegistered } from './user-registered.handler';
import { handleFileUploaded } from './file-uploaded.handler';

/**
 * Event Handler Registry
 * 
 * Interview Topic: Handler Pattern
 * 
 * Centralized router for events
 * - Maps event types to handlers
 * - Easy to add new handlers
 * - Type-safe with TypeScript
 */
export async function handleEvent(event: Event): Promise<void> {
  switch (event.type) {
    case EventType.DOCUMENT_CREATED:
      await handleDocumentCreated(event);
      break;

    case EventType.COMMENT_ADDED:
      await handleCommentAdded(event);
      break;

    case EventType.USER_REGISTERED:
      await handleUserRegistered(event);
      break;

    case EventType.FILE_UPLOADED:
      await handleFileUploaded(event);
      break;

    default:
      // Unknown event type - log and ignore
      console.warn(`Unknown event type: ${(event as Event).type}`);
  }
}
