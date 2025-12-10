import { Router, Request, Response, NextFunction } from 'express';
import { NotFoundError, ConflictError, UnauthorizedError, BadRequestError } from '@bookspace/common';
import { prisma } from '../config/database';
import {
  createUserSchema,
  updateUserSchema,
  updatePasswordSchema,
} from '../validators/user.validator';
import bcrypt from 'bcrypt';

const router = Router();

/**
 * GET /v1/users
 * 
 * List all users
 * 
 * Interview Topic: N+1 Problem Prevention with Prisma
 * 
 * Bad (N+1):
 * const users = await prisma.user.findMany();
 * for (user of users) {
 *   const posts = await prisma.post.findMany({ where: { userId: user.id } });
 * }
 * → 1 + N queries
 * 
 * Good (include/select):
 * const users = await prisma.user.findMany({
 *   include: { posts: true }
 * });
 * → 1 query with JOIN
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Soft-deleted users automatically excluded by middleware
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        // Exclude password
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    req.log.info({ count: users.length }, 'Users listed');

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/users
 * 
 * Create new user
 * 
 * Note: Typically called by Auth Service during signup
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, role } = createUserSchema.parse(req.body);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'USER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        // Exclude password
      },
    });

    req.log.info({ userId: user.id }, 'User created');

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/users/:id
 * 
 * Get user by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/users/email/:email
 * 
 * Get user by email (used by Auth Service)
 */
router.get('/email/:email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.params;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /v1/users/:id
 * 
 * Update user
 * 
 * Interview Topic: Optimistic Locking with Prisma
 * 
 * Problem: Two requests update user simultaneously
 * Request A: Read user (version 1)
 * Request B: Read user (version 1)
 * Request A: Update (version 2)
 * Request B: Update (overwrites A's changes!)
 * 
 * Solution: Version field
 * - Add version column
 * - WHERE id = ? AND version = ?
 * - If no rows updated → conflict
 * 
 * Prisma doesn't have built-in versioning,
 * but you can use updatedAt check or add version field
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = updateUserSchema.parse(req.body);

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundError('User not found');
    }

    // If email changed, check uniqueness
    if (updates.email && updates.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: updates.email },
      });
      if (emailTaken && !emailTaken.deletedAt) {
        throw new ConflictError('Email already in use');
      }
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    req.log.info({ userId: id }, 'User updated');

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /v1/users/:id/password
 * 
 * Update password
 */
router.put('/:id/password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);

    // Get user with password
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    req.log.info({ userId: id }, 'Password updated');

    res.json({
      success: true,
      data: { message: 'Password updated successfully' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/users/:id
 * 
 * Soft delete user
 * 
 * Middleware automatically converts to: UPDATE users SET deleted_at = NOW()
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundError('User not found');
    }

    // Soft delete (middleware converts to UPDATE)
    await prisma.user.delete({
      where: { id },
    });

    req.log.info({ userId: id }, 'User soft deleted');

    res.json({
      success: true,
      data: { message: 'User deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/users/:id/restore
 * 
 * Restore soft-deleted user
 */
router.post('/:id/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Find deleted user (bypass middleware)
    const user = await prisma.user.findFirst({
      where: {
        id,
        deletedAt: { not: null },
      },
    });

    if (!user) {
      throw new NotFoundError('Deleted user not found');
    }

    // Restore (set deletedAt to null)
    const restored = await prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    req.log.info({ userId: id }, 'User restored');

    res.json({
      success: true,
      data: restored,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
