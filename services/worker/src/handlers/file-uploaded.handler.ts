import { FileUploadedEvent } from '@bookspace/common';
import { createLogger } from '@bookspace/logger';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { Readable } from 'stream';

const logger = createLogger({ service: 'worker-thumbnail' });

// S3 configuration (same as upload service)
import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'bookspace-uploads';

/**
 * Handle file.uploaded event - Generate thumbnails for images
 * 
 * Interview Topic: Image Processing with Sharp
 * 
 * Sharp vs ImageMagick:
 * - Sharp: Node.js native, faster, less memory
 * - ImageMagick: CLI tool, slower, mature
 * 
 * Sharp benefits:
 * - 4-5x faster than ImageMagick
 * - Streaming support
 * - No external dependencies
 * - Perfect for Node.js
 */
export async function handleFileUploaded(event: FileUploadedEvent): Promise<void> {
  logger.info({ fileId: event.data.fileId }, 'Processing file.uploaded event');

  // Only process images
  if (!event.data.isImage) {
    logger.info({ fileId: event.data.fileId }, 'Skipping non-image file');
    return;
  }

  try {
    // Download original image from S3
    logger.info({ s3Key: event.data.s3Key }, 'Downloading original from S3');
    
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: event.data.s3Key,
    });

    const response = await s3Client.send(getCommand);
    
    if (!response.Body) {
      throw new Error('Empty file');
    }

    // Convert stream to buffer
    const imageBuffer = await streamToBuffer(response.Body as Readable);

    // Generate thumbnail using sharp
    logger.info({ fileId: event.data.fileId }, 'Generating thumbnail');
    
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: 'cover', // Crop to fill dimensions
        position: 'center',
      })
      .jpeg({
        quality: 80,
        progressive: true, // Progressive JPEG (better for web)
      })
      .toBuffer();

    // Upload thumbnail to S3
    const thumbnailKey = event.data.s3Key.replace(
      /\/([^/]+)$/,
      '/thumbnails/$1'
    ).replace(/\.\w+$/, '.jpg'); // Always JPEG for thumbnails

    logger.info({ thumbnailKey }, 'Uploading thumbnail to S3');

    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
      Metadata: {
        originalFileId: event.data.fileId,
        generatedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(putCommand);

    logger.info({
      fileId: event.data.fileId,
      thumbnailKey,
      originalSize: imageBuffer.length,
      thumbnailSize: thumbnailBuffer.length,
      compressionRatio: ((1 - thumbnailBuffer.length / imageBuffer.length) * 100).toFixed(2) + '%',
    }, 'Thumbnail generated successfully');

  } catch (error) {
    logger.error({ error, fileId: event.data.fileId }, 'Failed to generate thumbnail');
    throw error; // Will trigger retry
  }
}

/**
 * Helper: Convert stream to buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
