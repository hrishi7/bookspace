/**
 * Unit Tests for JWT Service
 * Tests token generation, validation, and expiration
 */

import { JWTService } from '../../services/jwt.service';

describe('JWTService', () => {
  let jwtService: JWTService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '15m';
    jwtService = new JWTService();
  });

  describe('generateToken', () => {
    it('should generate valid JWT token', () => {
      const payload = { userId: '123', role: 'user' };
      
      const token = jwtService.generateToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include payload in token', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      
      const token = jwtService.generateToken(payload);
      const decoded = jwtService.verifyToken(token);
      
      expect(decoded.userId).toBe('123');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should set expiration time', () => {
      const payload = { userId: '123' };
      
      const token = jwtService.generateToken(payload);
      const decoded = jwtService.verifyToken(token);
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const payload = { userId: '123' };
      const token = jwtService.generateToken(payload);
      
      const decoded = jwtService.verifyToken(token);
      
      expect(decoded.userId).toBe('123');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      
      expect(() => {
        jwtService.verifyToken(invalidToken);
      }).toThrow();
    });

    it('should throw error for expired token', () => {
      // Generate token with 1ms expiration
      process.env.JWT_EXPIRES_IN = '1ms';
      const shortLivedService = new JWTService();
      
      const token = shortLivedService.generateToken({ userId: '123' });
      
      // Wait for expiration
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => {
            jwtService.verifyToken(token);
          }).toThrow('Token expired');
          resolve(undefined);
        }, 100);
      });
    });

    it('should throw error for tampered token', () => {
      const payload = { userId: '123' };
      const token = jwtService.generateToken(payload);
      
      // Tamper with token
      const parts = token.split('.');
      parts[1] = Buffer.from('{"userId":"456"}').toString('base64');
      const tamperedToken = parts.join('.');
      
      expect(() => {
        jwtService.verifyToken(tamperedToken);
      }).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token', () => {
      const token = jwtService.generateRefreshToken({ userId: '123' });
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should have longer expiration than access token', () => {
      const accessToken = jwtService.generateToken({ userId: '123' });
      const refreshToken = jwtService.generateRefreshToken({ userId: '123' });
      
      const accessDecoded = jwtService.verifyToken(accessToken);
      const refreshDecoded = jwtService.verifyRefreshToken(refreshToken);
      
      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new access token from refresh token', () => {
      const refreshToken = jwtService.generateRefreshToken({ userId: '123' });
      
      const newAccessToken = jwtService.refreshAccessToken(refreshToken);
      const decoded = jwtService.verifyToken(newAccessToken);
      
      expect(decoded.userId).toBe('123');
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => {
        jwtService.refreshAccessToken('invalid-refresh-token');
      }).toThrow();
    });
  });
});
