import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

/**
 * Prometheus Metrics for API Gateway
 * 
 * Interview Topic: RED Metrics (Rate, Errors, Duration)
 * 
 * These are the "Golden Signals" for monitoring services:
 * 1. Rate: How many requests per second?
 * 2. Errors: How many requests are failing?
 * 3. Duration: How long do requests take?
 */

// Create a Registry for metrics
export const register = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

/**
 * HTTP Request Duration Histogram
 * 
 * Histogram tracks distribution of values
 * Useful for: latency (p50, p95, p99 percentiles)
 */
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], // seconds
  registers: [register],
});

/**
 * HTTP Request Counter
 * 
 * Counter only goes up (never decreases)
 * Useful for: total requests, error count
 */
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Active Requests Gauge
 * 
 * Gauge can go up and down
 * Useful for: current connections, queue size
 */
const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently in progress',
  labelNames: ['method'],
  registers: [register],
});

/**
 * Metrics Middleware
 * 
 * Records RED metrics for each request
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { method } = req;

  // Increment in-progress gauge
  httpRequestsInProgress.inc({ method });

  // When response finishes, record metrics
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode.toString();

    // Record duration
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);

    // Increment request counter
    httpRequestTotal.inc({ method, route, status_code: statusCode });

    // Decrement in-progress gauge
    httpRequestsInProgress.dec({ method });
  });

  next();
};

/**
 * Metrics endpoint handler
 * 
 * Prometheus scrapes this endpoint to collect metrics
 */
export const metricsHandler = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};
