import dotenv from 'dotenv';
import { getRequiredEnv } from '@bookspace/common';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  jwt: {
    accessSecret: getRequiredEnv('JWT_ACCESS_SECRET'),
    refreshSecret: getRequiredEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  userService: {
    url: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
