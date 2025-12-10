import dotenv from 'dotenv';
import { getRequiredEnv } from '@bookspace/common';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  jwt: {
    accessSecret: getRequiredEnv('JWT_ACCESS_SECRET'),
    refreshSecret: getRequiredEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    document: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3003',
    file: process.env.FILE_SERVICE_URL || 'http://localhost:3004',
    search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3005',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
