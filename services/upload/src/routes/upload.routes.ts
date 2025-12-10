import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestError, NotFoundError, getMessageBroker } from '@bookspace/common';
import { s3Client, S3_BUCKET } from '../config/s3';
import { config } from '../config';
import { validateFileType, validateFileSize, isImageFile, getFileExtension } from '../validators/upload.validator';
import { FileUploadedEvent } from '../types/events';

const router = Router();

/**
 * Multer Configuration
 * 
 * Interview Topic: Streaming vs Buffering
 * 
 * Streaming (our approach):
 * - Process file chunk-by-chunk
 * - Low memory usage (constant, regardless of file size)
 * - Can handle HUGE files
 * - Example: 10GB file uses ~10MB RAM
 * 
 * Buffering (bad for large files):
 * - Load entire file into memory
 * - Memory usage = file size
 * - Example: 10GB file uses 10GB RAM → crash!
 * 
 * multer-s3: Streams directly to S3 (no disk/memory storage)
 */
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: S3_BUCKET,
    metadata: (req, file, cb) => {
      cb(null, {
        uploadedBy: req.headers['x-user-id'] as string || 'unknown',
        originalName: file.originalname,
      });
    },
    key: (req, file, cb) => {
      // Generate unique S3 key: uploads/{userId}/{uuid}-{filename}
      const userId = req.headers['x-user-id'] as string || 'unknown';
      const fileId = uuidv4();
      const ext = getFileExtension(file.originalname);
      const key = `uploads/${userId}/${fileId}.${ext}`;
      cb(null, key);
    },
  }),
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (!validateFileType(file.mimetype)) {
      return cb(new BadRequestError(`File type ${file.mimetype} not allowed`));
    }
    cb(null, true);
  },
});

/**
 * POST /v1/upload
 * 
 * Single file upload
 * 
 * Interview Topic: Multipart Form Data
 * 
 * Why multipart/form-data for file uploads?
 * - Can send binary data + metadata in one request
 * - Efficient for large files
 * - Standard for file uploads
 * 
 * Alternative (bad): Base64 encode file in JSON
 * - 33% size increase
 * - More CPU to encode/decode
 * - Worse for large files
 */
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new BadRequestError('No file uploaded');
    }

    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // @ts-ignore - multer-s3 adds these properties
    const fileUrl = req.file.location;
    // @ts-ignore
    const s3Key = req.file.key;

    const fileId = s3Key.split('/').pop()?.split('.')[0] || uuidv4();

    req.log.info({
      fileId,
      fileName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    }, 'File uploaded to S3');

    // Publish file.uploaded event (for thumbnail generation)
    if (isImageFile(req.file.mimetype)) {
      try {
        const broker = getMessageBroker();
        const event: FileUploadedEvent = {
          type: 'file.uploaded' as any,
          timestamp: new Date().toISOString(),
          data: {
            fileId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            s3Key,
            uploadedBy: userId,
            isImage: true,
          },
        };
        await broker.publish(event as any);
        req.log.info({ fileId }, 'file.uploaded event published');
      } catch (error) {
        req.log.error({ error }, 'Failed to publish file.uploaded event');
      }
    }

    res.status(201).json({
      success: true,
      data: {
        fileId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        url: fileUrl,
        s3Key,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/upload/:fileId
 * 
 * Get signed URL for file download
 * 
 * Interview Topic: Signed URLs
 * 
 * Why signed URLs?
 * - S3 buckets should be private (not public)
 * - Signed URL = temporary access grant
 * - No need to proxy file through server
 * - Expires after X seconds (security)
 * 
 * How it works:
 * 1. Client requests download
 * 2. Server generates signed URL (valid for 1 hour)
 * 3. Client downloads directly from S3
 * 4. URL expires after 1 hour
 * 
 * Benefits:
 * - Server doesn't handle file transfer (saves bandwidth)
 * - Faster downloads (direct from S3)
 * - Scalable (S3 handles load)
 */
router.get('/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // Construct S3 key (we need to know the extension)
    // In real app, store file metadata in database
    // For now, we'll search for common extensions
    const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx'];
    
    let s3Key: string | null = null;
    for (const ext of extensions) {
      const key = `uploads/${userId}/${fileId}.${ext}`;
      try {
        // Check if file exists
        await s3Client.send(new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }));
        s3Key = key;
        break;
      } catch (error) {
        // File doesn't exist with this extension, try next
        continue;
      }
    }

    if (!s3Key) {
      throw new NotFoundError('File not found');
    }

    // Generate signed URL (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    req.log.info({ fileId, s3Key }, 'Generated signed URL');

    res.json({
      success: true,
      data: {
        fileId,
        url: signedUrl,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/upload/:fileId
 * 
 * Delete file from S3
 */
router.delete('/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new BadRequestError('User ID required');
    }

    // Find and delete file (same extension search as GET)
    const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx'];
    
    let deleted = false;
    for (const ext of extensions) {
      const key = `uploads/${userId}/${fileId}.${ext}`;
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }));
        deleted = true;
        req.log.info({ fileId, s3Key: key }, 'File deleted from S3');
        break;
      } catch (error) {
        continue;
      }
    }

    if (!deleted) {
      throw new NotFoundError('File not found');
    }

    res.json({
      success: true,
      data: { message: 'File deleted' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
