/**
 * Base error class for application errors with status codes
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Client sent invalid data
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(400, message);
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

/**
 * 403 Forbidden - User doesn't have permission
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(404, message);
  }
}

/**
 * 409 Conflict - Resource already exists or conflict state
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too Many Requests') {
    super(429, message);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error') {
    super(500, message, false);
  }
}
