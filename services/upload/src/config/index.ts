import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3004', 10),

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucketName: process.env.S3_BUCKET_NAME || 'bookspace-uploads',
  },

  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024,
    allowedMimeTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png').split(','),
  },

  thumbnail: {
    width: parseInt(process.env.THUMBNAIL_WIDTH || '300', 10),
    height: parseInt(process.env.THUMBNAIL_HEIGHT || '300', 10),
    quality: parseInt(process.env.THUMBNAIL_QUALITY || '80', 10),
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
