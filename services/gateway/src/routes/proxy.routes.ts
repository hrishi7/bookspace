import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';

/**
 * API Gateway Proxy Routes
 * 
 * Interview Topic: API Gateway Pattern
 * 
 * Why API Gateway?
 * 1. Single entry point - clients hit one URL
 * 2. Centralized auth - validate JWT once at gateway
 * 3. Rate limiting - protect all services
 * 4. Service discovery - clients don't need to know service URLs
 * 5. Load balancing - gateway can distribute requests
 * 6. Protocol translation - REST to gRPC, etc.
 * 
 * Trade-offs:
 * ✅ Simplifies client code
 * ✅ Centralized cross-cutting concerns
 * ❌ Single point of failure (need HA setup)
 * ❌ Additional hop (adds latency)
 */

const router = Router();

/**
 * Create proxy middleware with common options
 */
const createProxy = (target: string, auth: 'required' | 'optional' | 'none' = 'none') => {
  return [
    // Apply auth middleware if needed
    ...(auth === 'required' ? [authenticate] : []),
    ...(auth === 'optional' ? [optionalAuth] : []),
    
    // Proxy to backend service
    createProxyMiddleware({
      target,
      changeOrigin: true,
      
      // Forward request ID for distributed tracing
      onProxyReq: (proxyReq, req) => {
        if (req.id) {
          proxyReq.setHeader('X-Request-ID', req.id);
        }
        
        // Forward user info to backend services
        if (req.user) {
          proxyReq.setHeader('X-User-ID', req.user.userId);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },

      // Log proxy errors
      onError: (err, req, res) => {
        req.log?.error({ error: err.message }, 'Proxy error');
        
        res.status(502).json({
          success: false,
          error: { message: 'Service temporarily unavailable' },
        });
      },
    }),
  ];
};

/**
 * Auth Service Routes (public - no auth required)
 * POST /v1/auth/signup
 * POST /v1/auth/login  
 * POST /v1/auth/refresh
 */
router.use('/v1/auth', createProxy(config.services.auth));

/**
 * User Service Routes (auth required)
 * GET /v1/users/:id
 * PUT /v1/users/:id
 * DELETE /v1/users/:id
 */
router.use('/v1/users', ...createProxy(config.services.user, 'required'));

/**
 * Document Service Routes (auth required)
 * GET /v1/docs
 * POST /v1/docs
 * GET /v1/docs/:id
 * PUT /v1/docs/:id
 * DELETE /v1/docs/:id
 * POST /v1/docs/:id/comments
 * GET /v1/docs/:id/comments
 */
router.use('/v1/docs', ...createProxy(config.services.document, 'required'));

/**
 * File Service Routes (auth required)
 * POST /v1/files/upload
 * GET /v1/files/:id
 */
router.use('/v1/files', ...createProxy(config.services.file, 'required'));

/**
 * Search Service Routes (optional auth - results may vary by user)
 * GET /v1/search?q=...
 */
router.use('/v1/search', ...createProxy(config.services.search, 'optional'));

export default router;
