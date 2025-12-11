import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from '@bookspace/logger';
import { config } from './config';
import { requestLogging, errorLogging } from './middleware/logging.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { createRateLimiter } from './middleware/rateLimit.middleware';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.middleware';
import proxyRoutes from './routes/proxy.routes';

/**
 * API Gateway Service
 * 
 * Responsibilities:
 * 1. Route requests to backend services
 * 2. Authenticate requests (JWT validation)
 * 3. Rate limiting
 * 4. Request logging with correlation IDs
 * 5. Metrics collection
 * 6. Error handling
 */

// Create logger
const logger = createLogger({
  service: 'api-gateway',
  level: config.log.level,
});

// Create Express app
const app = express();

/**
 * Security Middleware
 * 
 * Helmet sets various HTTP headers for security
 */
app.use(helmet());

/**
 * CORS Configuration
 * 
 * Interview Topic: CORS (Cross-Origin Resource Sharing)
 * 
 * Problem: Browser security prevents frontend (localhost:3000) from calling
 * API (localhost:3000) if domains differ
 * 
 * Solution: CORS headers tell browser which origins are allowed
 */
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

/**
 * Body Parsing
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request Logging & Metrics
 * These come before rate limiting so we track rate-limited requests
 */
app.use(requestLogging(logger));
app.use(metricsMiddleware);

/**
 * Rate Limiting
 * Apply to all routes except health and metrics
 */
app.use(createRateLimiter());

/**
 * Health Check Endpoint
 * Used by load balancers and Kubernetes
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Metrics Endpoint for Prometheus
 */
app.get('/metrics', metricsHandler);

/**
 * API Routes (proxied to microservices)
 */
app.use(proxyRoutes);

/**
 * Error Handling
 * Must come AFTER all routes
 */
app.use(errorLogging(logger));
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start Server
 */
const server = app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.env,
  }, 'API Gateway started');
});

/**
 * Graceful Shutdown
 * 
 * Interview Topic: Why Graceful Shutdown?
 * 
 * Without graceful shutdown:
 * 1. Process killed immediately
 * 2. In-flight requests fail
 * 3. Database connections not closed
 * 4. Resources leaked
 * 
 * With graceful shutdown:
 * 1. Stop accepting new requests
 * 2. Wait for in-flight requests to complete
 * 3. Close database connections
 * 4. Exit cleanly
 */
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  // Stop accepting new connections
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});
