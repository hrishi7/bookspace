import dotenv from 'dotenv';

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
    enabled: process.env.CACHE_ENABLED === 'true',
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
