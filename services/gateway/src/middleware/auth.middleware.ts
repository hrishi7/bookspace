import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '@bookspace/common';
import { TokenPayload, UserRole } from '@bookspace/types';
import { config } from '../config';

/**
 * Extend Express Request to include user from JWT
 */
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * JWT Authentication Middleware
 * 
 * Validates JWT access token from Authorization header
 * Attaches decoded user payload to request.user
 * 
 * Interview Topic: JWT Authentication Pattern
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;

    // Ensure it's an access token (not refresh token)
    if (decoded.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Optional Authentication Middleware
 * 
 * Attaches user if token is valid, but doesn't fail if missing
 * Useful for endpoints that work for both authenticated and anonymous users
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token, continue without user
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;

    if (decoded.type === 'access') {
      req.user = decoded;
    }
    next();
  } catch {
    // Token invalid or expired, continue without user
    next();
  }
};

/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Ensures authenticated user has required role
 * Must be used AFTER authenticate middleware
 * 
 * Interview Topic: Authorization vs Authentication
 * - Authentication: "Who are you?" (JWT validates identity)
 * - Authorization: "What can you do?" (RBAC checks permissions)
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Requires role: ${roles.join(' or ')}`)
      );
    }

    next();
  };
};

/**
 * Admin-only middleware (shorthand for requireRole)
 */
export const requireAdmin = requireRole(UserRole.ADMIN);
