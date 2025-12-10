import dotenv from 'dotenv';
import { getRequiredEnv } from '@bookspace/common';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3003', 10),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bookspace',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10), // 5 minutes
    enabled: process.env.CACHE_ENABLED !== 'false',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
