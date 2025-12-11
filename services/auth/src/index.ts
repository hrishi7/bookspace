import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from '@bookspace/logger';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import { AppError } from '@bookspace/common';

const logger = createLogger({
  service: 'auth-service',
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
app.use((req, _res, next) => {
  req.log = logger.child({
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  req.log.info('Request received');
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/v1/auth', authRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found' },
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Auth service started');
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  
  server.close(async () => {
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

declare global {
  namespace Express {
    interface Request {
      log: any;
    }
  }
}
