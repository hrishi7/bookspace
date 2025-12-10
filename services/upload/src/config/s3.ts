import { S3Client } from '@aws-sdk/client-s3';
import { config } from './index';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'upload-s3' });

/**
 * AWS S3 Client
 * 
 * Interview Topic: AWS SDK Configuration
 * 
 * Best practices:
 * - Use environment variables for credentials (never hardcode!)
 * - Single client instance (reuse connections)
 * - Configure region (latency optimization)
 * - Enable retry logic (built-in with SDK v3)
 */
export const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

logger.info({ 
  region: config.aws.region, 
  bucket: config.aws.bucketName 
}, 'S3 client initialized');

export const S3_BUCKET = config.aws.bucketName;
