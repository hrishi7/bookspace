import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger, Logger } from '@bookspace/logger';

/**
 * Extend Express Request to include logger
 */
declare global {
  namespace Express {
    interface Request {
      log: Logger;
      id: string;
    }
  }
}

/**
 * Request Logging Middleware
 * 
 * Adds correlation ID and request-scoped logger
 * 
 * Interview Topic: Correlation IDs in Distributed Systems
 * 
 * Problem: When a request touches multiple services, how do you trace it?
 * 
 * Solution: Correlation ID (Request ID)
 * 1. Generate unique ID at gateway
 * 2. Pass it to all downstream services (via header)
 * 3. Include it in all logs
 * 4. Query logs by requestId to see full request flow
 * 
 * Example:
 * Gateway: {"requestId":"abc-123","msg":"Request received"}
 * Auth: {"requestId":"abc-123","msg":"Token validated"}
 * User: {"requestId":"abc-123","msg":"User fetched from DB"}
 * 
 * Now you can trace the entire request across all services!
 */
export const requestLogging = (logger: Logger) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate or extract request ID
    // If client sends X-Request-ID, use it (for client-side tracing)
    // Otherwise, generate new one
    req.id = (req.headers['x-request-id'] as string) || uuidv4();

    // Create child logger with request context
    req.log = createChildLogger(logger, {
      requestId: req.id,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Add request ID to response headers
    res.setHeader('X-Request-ID', req.id);

    // Log request start
    const startTime = Date.now();
    req.log.info('Request started');

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      req.log.info({
        statusCode: res.statusCode,
        duration,
        userId: req.user?.userId,
      }, 'Request completed');
    });

    next();
  };
};

/**
 * Error Logging Middleware
 * 
 * Must be registered AFTER all routes
 */
export const errorLogging = (logger: Logger) => {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Log error with full context
    const log = req.log || logger;
    
    log.error({
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      requestId: req.id,
      method: req.method,
      path: req.path,
      userId: req.user?.userId,
    }, 'Request error');

    next(err);
  };
};
