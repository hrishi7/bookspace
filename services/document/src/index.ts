import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from '@bookspace/logger';
import { AppError } from '@bookspace/common';
import { config } from './config';
import { connectMongoDB, disconnectMongoDB } from './config/mongodb';
import documentRoutes from './routes/document.routes';
import commentRoutes from './routes/comment.routes';

const logger = createLogger({
  service: 'document-service',
  level: config.log.level,
});

const app = express();

// Security
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  req.log = logger.child({
    requestId: req.headers['x-request-id'],
    method: req.method,
    path: req.path,
  });
  req.log.info('Request received');
  next();
});

// Health check
app.get('/health', async(req, res) => {
  res.json({
    status: 'healthy',
    service: 'document-service',
    timestamp: new Date().toISOString(),
    mongodb: 'connected', // Could check actual connection
  });
});

// Routes
app.use('/v1/docs', documentRoutes);
app.use('/v1/docs', commentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found' },
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const log = req.log || logger;
  log.error({ error: err.message, stack: err.stack }, 'Request error');

  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    error: { message },
  });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectMongoDB();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Document service started');
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(async () => {
        try {
          await disconnectMongoDB();
          logger.info('Shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start service');
    process.exit(1);
  }
}

start();

declare global {
  namespace Express {
    interface Request {
      log: any;
    }
  }
}
