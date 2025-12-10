import { Request, Response, NextFunction, Router } from 'express';
import { BadRequestError, UnauthorizedError, ConflictError } from '@bookspace/common';
import { UserRole } from '@bookspace/types';
import { hashPassword, verifyPassword, needsRehash } from '../utils/password';
import { generateTokens, verifyRefreshToken as verifyRefreshTokenJWT, revokeToken } from '../utils/jwt';
import { verifyRefreshToken, invalidateRefreshToken, invalidateAllUserTokens } from '../utils/redis';
import { signupSchema, loginSchema, refreshTokenSchema } from '../validators/auth.validator';

const router = Router();

/**
 * POST /v1/auth/signup
 * 
 * Register new user
 * 
 * Interview Topic: Registration Flow
 * 
 * Security Considerations:
 * 1. Validate input (email format, password strength)
 * 2. Check for existing user (prevent duplicate emails)
 * 3. Hash password (never store plaintext)
 * 4. Create user in database
 * 5. Return tokens (auto-login after signup)
 */
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const { email, password, name } = signupSchema.parse(req.body);

    // Check if user already exists (call User Service)
    // For now, we'll simulate this - implement in Phase 2.2
    const existingUser = await checkUserExists(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user (call User Service)
    const user = await createUser({
      email,
      password: hashedPassword,
      name,
      role: UserRole.USER,
    });

    req.log.info({ userId: user.id }, 'User registered');

    // Generate tokens
    const tokens = await generateTokens(user.id, user.email, user.role);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/auth/login
 * 
 * Authenticate user
 * 
 * Interview Topic: Authentication Flow
 * 
 * Steps:
 * 1. Validate credentials
 * 2. Find user by email
 * 3. Verify password (timing-safe comparison)
 * 4. Generate tokens
 * 5. Return tokens
 * 
 * Security:
 * - Rate limit login attempts (done at gateway)
 * - Don't reveal if email exists (generic "invalid credentials")
 * - Use timing-safe password comparison
 * - Consider: Account lockout after N failed attempts
 * - Consider: 2FA (future enhancement)
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const { email, password } = loginSchema.parse(req.body);

    // Find user by email (call User Service)
    const user = await findUserByEmail(email);
    if (!user) {
      // Generic error - don't reveal if email exists
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if password needs rehashing (work factor increased)
    if (needsRehash(user.password)) {
      const newHash = await hashPassword(password);
      await updateUserPassword(user.id, newHash);
      req.log.info({ userId: user.id }, 'Password rehashed');
    }

    req.log.info({ userId: user.id }, 'User logged in');

    // Generate tokens
    const tokens = await generateTokens(user.id, user.email, user.role);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/auth/refresh
 * 
 * Refresh access token using refresh token
 * 
 * Interview Topic: Token Rotation
 * 
 * Why rotate refresh tokens?
 * - Detect token theft (old token reused)
 * - Limit damage if token stolen
 * - Force re-authentication periodically
 * 
 * Flow:
 * 1. Verify refresh token (JWT signature)
 * 2. Check token exists in Redis
 * 3. Invalidate old refresh token
 * 4. Generate NEW access + refresh token
 * 5. Store new refresh token
 * 
 * Theft Detection:
 * - If old refresh token reused → token theft detected
 * - Invalidate ALL user's tokens → force re-login
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    // Verify JWT signature
    let decoded;
    try {
      decoded = verifyRefreshTokenJWT(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check token exists in Redis (not revoked)
    const isValid = await verifyRefreshToken(decoded.userId, refreshToken);
    if (!isValid) {
      // Token reuse detected! Potential theft
      req.log.warn({ userId: decoded.userId }, 'Refresh token reuse detected');
      
      // Invalidate ALL user's tokens (security precaution)
      await invalidateAllUserTokens(decoded.userId);
      
      throw new UnauthorizedError('Token reuse detected. Please login again.');
    }

    // Invalidate old refresh token
    await invalidateRefreshToken(decoded.userId, refreshToken);

    req.log.info({ userId: decoded.userId }, 'Token refreshed');

    // Generate new tokens (rotation)
    const tokens = await generateTokens(decoded.userId, decoded.email, decoded.role);

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/auth/logout
 * 
 * Logout user (invalidate tokens)
 * 
 * Requires: Bearer token in Authorization header
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new BadRequestError('No token provided');
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer '
    const refreshToken = req.body.refreshToken;

    // Blacklist access token
    await revokeToken(accessToken);

    // Invalidate refresh token if provided
    if (refreshToken) {
      try {
        const decoded = verifyRefreshTokenJWT(refreshToken);
        await invalidateRefreshToken(decoded.userId, refreshToken);
      } catch {
        // Invalid token, ignore
      }
    }

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// Mock User Service Calls
// (Will be replaced with actual HTTP calls in Phase 2.3)
// ========================

interface MockUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

const mockUsers: MockUser[] = [];

async function checkUserExists(email: string): Promise<boolean> {
  return mockUsers.some(u => u.email === email);
}

async function createUser(data: Omit<MockUser, 'id'>): Promise<MockUser> {
  const user: MockUser = {
    id: `user_${Date.now()}`,
    ...data,
  };
  mockUsers.push(user);
  return user;
}

async function findUserByEmail(email: string): Promise<MockUser | undefined> {
  return mockUsers.find(u => u.email === email);
}

async function updateUserPassword(userId: string, newHash: string): Promise<void> {
  const user = mockUsers.find(u => u.id === userId);
  if (user) {
    user.password = newHash;
  }
}

export default router;
