/**
 * Security Audit Test Suite
 * Tests for common security vulnerabilities
 */

import request from 'supertest';
import { app } from '../../src/app';
import { cleanDatabase } from '@bookspace/shared/test/test-setup';

describe('Security Audit Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in email parameter', async () => {
      const maliciousEmails = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "admin'--",
        "' UNION SELECT * FROM passwords--",
      ];

      for (const email of maliciousEmails) {
        const response = await request(app)
          .post('/auth/login')
          .send({ email, password: 'test' });

        // Should handle gracefully without SQL errors
        expect([400, 401]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should prevent SQL injection in search queries', async () => {
      const maliciousQueries = [
        "test' OR '1'='1",
        "'; DELETE FROM documents; --",
      ];

      for (const query of maliciousQueries) {
        const response = await request(app)
          .get(`/api/search?q=${encodeURIComponent(query)}`);

        // Should return safe results
        expect(response.status).toBeLessThan(500);
      }
    });
  });

  describe('XSS Prevention', () => {
    let token: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test',
        });

      token = response.body.token;
    });

    it('should sanitize HTML in document content', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/documents')
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: 'Test',
            content: payload,
          });

        expect(response.status).toBe(201);

        // Content should be escaped
        expect(response.body.content).not.toContain('<script>');
        expect(response.body.content).not.toContain('javascript:');
      }
    });

    it('should sanitize user names', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'xss@example.com',
          password: 'Test123!',
          name: '<script>alert("XSS")</script>',
        });

      expect(response.body.user.name).not.toContain('<script>');
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const attempts = [];

      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'wrong' })
        );
      }

      const responses = await Promise.all(attempts);

      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });

    it('should rate limit API requests per user', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test',
        });

      const token = response.body.token;
      const requests = [];

      // Make 100 rapid requests
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app)
            .get('/api/documents')
            .set('Authorization', `Bearer ${token}`)
        );
      }

      const responses = await Promise.all(requests);

      // Should rate limit after threshold
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('JWT Security', () => {
    it('should reject tampered JWT tokens', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test',
        });

      const token = response.body.token;

      // Tamper with token
      const parts = token.split('.');
      parts[1] = Buffer.from('{"userId":"hacker"}').toString('base64');
      const tamperedToken = parts.join('.');

      const protectedResponse = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(protectedResponse.status).toBe(401);
    });

    it('should reject expired tokens', async() => {
      // This would require mocking time or using very short-lived tokens
      // Implementation depends on your JWT service
    });
  });

  describe('File Upload Security', () => {
    let token: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test',
        });

      token = response.body.token;
    });

    it('should reject executable files', async () => {
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('malicious content'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('file type not allowed');
    });

    it('should reject oversized files', async () => {
      const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB

      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', largeBuffer, 'large.txt');

      expect(response.status).toBe(413);
    });

    it('should validate file content matches extension', async () => {
      // Upload EXE with .jpg extension
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('MZ'), {
          filename: 'fake-image.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Sensitive Data Exposure', () => {
    it('should not expose password hashes', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test',
        });

      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('should not expose sensitive user data in errors', async () => {
      // Try to access non-existent user
      const token = 'valid-jwt'; // Would need real token

      const response = await request(app)
        .get('/api/users/999999')
        .set('Authorization', `Bearer ${token}`);

      // Error should be generic
      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('sql');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should not expose internal errors in production', async () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Trigger an error
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer invalid')
        .send({ title: 'test' });

      // Should not expose stack trace
      expect(response.body.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const response = await request(app).get('/');

      // Check for important security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should not expose server information', async () => {
      const response = await request(app).get('/');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });
});
