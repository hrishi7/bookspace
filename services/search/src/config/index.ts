import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3006', 10),

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    index: process.env.ELASTICSEARCH_INDEX || 'bookspace_documents',
  },

  search: {
    maxResults: parseInt(process.env.MAX_RESULTS || '100', 10),
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    fuzzyDistance: parseInt(process.env.FUZZY_DISTANCE || '2', 10),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
