import bcrypt from 'bcrypt';
import { config } from '../config';

/**
 * Password Hashing Service
 * 
 * Interview Topic: Password Security Best Practices
 * 
 * ❌ NEVER do this:
 * 1. Store passwords in plain text
 * 2. Use reversible encryption (AES, etc.)
 * 3. Use fast hashing (MD5, SHA256)
 * 4. Reuse same salt for all users
 * 
 * ✅ ALWAYS do this:
 * 1. Use slow, adaptive hashing (bcrypt, scrypt, argon2)
 * 2. Use random salt per password
 * 3. Use high work factor (12+ rounds for bcrypt)
 * 4. Increase work factor over time (as hardware improves)
 * 
 * Why bcrypt?
 * - Designed to be slow (prevents brute force)
 * - Adaptive (can increase rounds over time)
 * - Built-in salt generation
 * - Battle-tested (20+ years)
 */

/**
 * Hash a plaintext password
 * 
 * Interview Topic: How bcrypt works
 * 
 * 1. Generate random salt
 * 2. Combine password + salt
 * 3. Hash repeatedly (2^rounds times)
 * 4. Return: $2b$rounds$salt$hash
 * 
 * Cost factor (rounds):
 * - 10 = ~100ms (too fast for 2024)
 * - 12 = ~400ms (good for 2024)
 * - 14 = ~1.6s (paranoid mode)
 * 
 * Balance:
 * - Higher = more secure but slower login
 * - Lower = faster but easier to crack
 * 
 * 12 rounds = 4096 iterations
 * Means attacker must do 4096 hashes per password attempt!
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.security.bcryptRounds);
}

/**
 * Verify a password against a hash
 * 
 * Timing-safe comparison (prevents timing attacks)
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if hash needs rehashing (work factor increased)
 * 
 * Interview Topic: Password Hash Migration
 * 
 * Scenario: You increase bcrypt rounds from 10 to 12
 * How to upgrade existing passwords?
 * 
 * Solution:
 * 1. Check hash on login
 * 2. If using old rounds, rehash with new rounds
 * 3. Update database
 * 4. Gradual migration as users log in
 */
export function needsRehash(hash: string): boolean {
  // Extract rounds from hash: $2b$12$...
  const roundsMatch = hash.match(/^\$2[aby]\$(\d+)\$/);
  if (!roundsMatch) return true;

  const currentRounds = parseInt(roundsMatch[1], 10);
  return currentRounds < config.security.bcryptRounds;
}
