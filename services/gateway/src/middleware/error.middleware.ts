import { Request, Response, NextFunction } from 'express';
import { AppError } from '@bookspace/common';
import { config } from '../config';

/**
 * Global Error Handler Middleware
 * 
 * Interview Topic: Centralized Error Handling
 * 
 * Benefits:
 * 1. Consistent error responses across all endpoints
 * 2. Security - don't leak internal errors to clients
 * 3. Logging - centralized error logging
 * 4. Monitoring - track error rates
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Default to 500 if not an AppError
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // In production, don't expose internal error details
  const response = {
    success: false,
    error: {
      message: isOperational ? message : 'Internal Server Error',
      ...(config.env === 'development' && {
        // Include stack trace in development
        stack: err.stack,
        originalMessage: err.message,
      }),
    },
  };

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found Handler
 * 
 * Catches all unmatched routes
 * Must be registered AFTER all other routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};
