import mongoose from 'mongoose';
import { createLogger } from '@bookspace/logger';
import { config } from '../config';

const logger = createLogger({ service: 'document-mongodb' });

/**
 * MongoDB Connection
 * 
 * Interview Topic: MongoDB Connection Best Practices
 * 
 * Connection pooling:
 * - Mongoose maintains a connection pool by default
 * - Reuses connections instead of creating new ones
 * - Configured via mongoose options
 */

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  try {
    await mongoose.connect(config.mongodb.uri, {
      // Connection pool size (default: 100)
      maxPoolSize: 10,
      minPoolSize: 5,
      
      // Server selection timeout
      serverSelectionTimeoutMS: 5000,
      
      // Socket timeout
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    logger.info('MongoDB connected successfully');

    // Handle connection events
    mongoose.connection.on('error', (error) => {
      logger.error({ error }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      isConnected = true;
    });
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting from MongoDB');
    throw error;
  }
}
