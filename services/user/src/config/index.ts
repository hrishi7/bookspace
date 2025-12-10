import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3002', 10),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
