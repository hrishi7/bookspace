/**
 * Event Types and Payloads
 * 
 * Interview Topic: Event-Driven Architecture
 * 
 * Why events?
 * - Decouple services (Document Service doesn't know about notifications)
 * - Async processing (don't block user request)
 * - Multiple consumers (notifications, analytics, search indexing)
 * - Audit trail (event log)
 * 
 * Event naming convention: noun.verb
 * - document.created
 * - user.updated
 * - payment.processed
 */

export enum EventType {
  // Document events
  DOCUMENT_CREATED = 'document.created',
  DOCUMENT_UPDATED = 'document.updated',
  DOCUMENT_DELETED = 'document.deleted',
  
  // Comment events
  COMMENT_ADDED = 'comment.added',
  COMMENT_DELETED = 'comment.deleted',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
}

/**
 * Base Event Interface
 */
export interface BaseEvent {
  type: EventType;
  timestamp: string; // ISO 8601
  correlationId?: string; // For tracing
}

/**
 * Document Events
 */
export interface DocumentCreatedEvent extends BaseEvent {
  type: EventType.DOCUMENT_CREATED;
  data: {
    documentId: string;
    title: string;
    createdBy: string;
    tags: string[];
  };
}

export interface DocumentUpdatedEvent extends BaseEvent {
  type: EventType.DOCUMENT_UPDATED;
  data: {
    documentId: string;
    title: string;
    updatedBy: string;
    version: number;
  };
}

export interface DocumentDeletedEvent extends BaseEvent {
  type: EventType.DOCUMENT_DELETED;
  data: {
    documentId: string;
    deletedBy: string;
  };
}

/**
 * Comment Events
 */
export interface CommentAddedEvent extends BaseEvent {
  type: EventType.COMMENT_ADDED;
  data: {
    commentId: string;
    documentId: string;
    userId: string;
    text: string;
    parentId?: string;
  };
}

/**
 * User Events
 */
export interface UserRegisteredEvent extends BaseEvent {
  type: EventType.USER_REGISTERED;
  data: {
    userId: string;
    email: string;
    name: string;
  };
}

/**
 * Union type of all events
 */
export type Event =
  | DocumentCreatedEvent
  | DocumentUpdatedEvent
  | DocumentDeletedEvent
  | CommentAddedEvent
  | UserRegisteredEvent;
