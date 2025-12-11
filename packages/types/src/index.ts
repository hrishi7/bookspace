/**
 * Shared TypeScript types and interfaces
 */

// User types
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Document types
export interface DocumentVersion {
  version: number;
  content: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  tags: string[];
  versions: DocumentVersion[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentDTO {
  id: string;
  title: string;
  content: string;
  tags: string[];
  currentVersion: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Comment types
export interface Comment {
  id: string;
  docId: string;
  userId: string;
  text: string;
  parentId?: string;
  level: number;
  createdAt: Date;
}

// Notification types
export enum NotificationType {
  DOC_CREATED = 'doc_created',
  DOC_UPDATED = 'doc_updated',
  COMMENT_ADDED = 'comment_added',
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

// Event types for message queue
export interface DocCreatedEvent {
  docId: string;
  userId: string;
  title: string;
  timestamp: Date;
}

export interface DocUpdatedEvent {
  docId: string;
  userId: string;
  title: string;
  version: number;
  timestamp: Date;
}

export interface CommentAddedEvent {
  commentId: string;
  docId: string;
  userId: string;
  parentId?: string;
  timestamp: Date;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Authentication types
export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  exp?: number; // JWT expiration timestamp
  iat?: number; // JWT issued at timestamp
  iss?: string; // JWT issuer
  aud?: string; // JWT audience
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
