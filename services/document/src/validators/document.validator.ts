import { z } from 'zod';
import { paginationSchema } from '@bookspace/common';

/**
 * Create Document Schema
 */
export const createDocumentSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title too long'),
  content: z.string()
    .min(1, 'Content is required'),
  tags: z.array(z.string())
    .max(10, 'Maximum 10 tags')
    .default([]),
});

export type CreateDocumentRequest = z.infer<typeof createDocumentSchema>;

/**
 * Update Document Schema
 */
export const updateDocumentSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title too long')
    .optional(),
  content: z.string()
    .min(1, 'Content is required')
    .optional(),
  tags: z.array(z.string())
    .max(10, 'Maximum 10 tags')
    .optional(),
}).refine(
  (data) => data.title || data.content || data.tags,
  { message: 'At least one field must be provided' }
);

export type UpdateDocumentRequest = z.infer<typeof updateDocumentSchema>;

/**
 * Search Documents Schema
 */
export const searchDocumentsSchema = paginationSchema.extend({
  q: z.string().optional(), // Search query
  tags: z.string().optional(), // Comma-separated tags
  userId: z.string().optional(), // Filter by creator
});

export type SearchDocumentsQuery = z.infer<typeof searchDocumentsSchema>;

/**
 * Add Comment Schema
 */
export const addCommentSchema = z.object({
  text: z.string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment too long'),
  parentId: z.string().optional(), // For nested comments
});

export type AddCommentRequest = z.infer<typeof addCommentSchema>;
