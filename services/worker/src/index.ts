import { createLogger } from '@bookspace/logger';
import { getMessageBroker } from '@bookspace/common';
import { config } from './config';
import { handleEvent } from './handlers';

const logger = createLogger({
  service: 'worker-service',
  level: config.log.level,
});

/**
 * Worker Service
 * 
 * Interview Topic: Worker vs Web Server
 * 
 * Web Server:
 * - Handles HTTP requests
 * - Synchronous (responds immediately)
 * - Scales with request volume
 * 
 * Worker:
 * - Processes async jobs
 * - No HTTP (listens to queue)
 * - Scales with job volume
 * - Long-running tasks OK
 * 
 * Benefits:
 * - Don't block user requests
 * - Independent scaling
 * - Retry failed jobs
 * - Different deployment patterns
 */

async function start() {
  try {
    logger.info('Starting worker service');

    // Connect to RabbitMQ
    const broker = getMessageBroker(config.rabbitmq.url);
    await broker.connect();

    // Setup Dead Letter Queue
    await broker.assertDeadLetterQueue();

    // Subscribe to events
    await broker.subscribe('bookspace.notifications', handleEvent);

    logger.info('Worker service started - listening for events');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down worker');
      
      try {
        await broker.disconnect();
        logger.info('Worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled promise rejection');
    });

    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start worker service');
    process.exit(1);
  }
}

start();
