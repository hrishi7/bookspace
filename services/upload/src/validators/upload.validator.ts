import { z } from 'zod';

/**
 * File Upload Validation
 * 
 * Interview Topic: Input Validation for File Uploads
 * 
 * Security considerations:
 * 1. File size limits (prevent DoS)
 * 2. MIME type validation (prevent malicious files)
 * 3. File extension validation (double-check)
 * 4. Content inspection (not just trust client)
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
];

export function isImageFile(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mimeType);
}

export function validateFileType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

export function validateFileSize(size: number, maxSizeBytes: number): boolean {
  return size > 0 && size <= maxSizeBytes;
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export const uploadMetadataSchema = z.object({
  userId: z.string().min(1),
  documentId: z.string().optional(),
  description: z.string().max(500).optional(),
});

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;
