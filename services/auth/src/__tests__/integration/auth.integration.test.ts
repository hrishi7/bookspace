/**
 * Integration Tests for Auth API
 * Tests complete authentication flows with real database
 */

import request from 'supertest';
import { app } from '../../app';
import { cleanDatabase, TestDataFactory } from '@bookspace/shared/test/test-setup';

describe('Auth API Integration Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /auth/register', () => {
    it('should register new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        name: 'New User',
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        user: {
          email: userData.email,
          name: userData.name,
        },
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('should reject duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'User',
      };

      // Register first time
      await request(app).post('/auth/register').send(userData).expect(201);

      // Try to register again with same email
      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: '12345',
          name: 'Test',
        })
        .expect(400);

      expect(response.body.error).toContain('password');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!',
          name: 'Test',
        })
        .expect(400);

      expect(response.body.error).toContain('email');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create test user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'TestPassword123!',
          name: 'Test User',
        });
    });

    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        user: {
          email: 'testuser@example.com',
          name: 'Test User',
        },
        token: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('should reject wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should rate limit login attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            email: 'testuser@example.com',
            password: 'WrongPassword',
          });
      }

      // Next attempt should be rate limited
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'TestPassword123!',
        })
        .expect(429);

      expect(response.body.error).toContain('Too many attempts');
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and get refresh token
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test',
        });

      refreshToken = response.body.refreshToken;
    });

    it('should generate new access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // New tokens should be different
      expect(response.body.refrefreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.error).toContain('Invalid refresh token');
    });

    it('should reject reused refresh token', async () => {
      // Use refresh token once
      await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Try to use same token again
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error).toContain('Token already used');
    });
  });

  describe('POST /auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test',
        });

      accessToken = response.body.token;
      refreshToken = response.body.refreshToken;
    });

    it('should logout and invalidate tokens', async () => {
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Tokens should be invalidated
      await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    let token: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test User',
        });

      token = response.body.token;
    });

    it('should return current user info', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(response.body.password).toBeUndefined();
    });

    it('should reject request without token', async () => {
      await request(app)
        .get('/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
