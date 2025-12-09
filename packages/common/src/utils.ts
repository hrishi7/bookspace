/**
 * Delays execution for specified milliseconds
 * Useful for retry mechanisms and rate limiting
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Implements exponential backoff for retries
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Calculated delay in milliseconds
 */
export function exponentialBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return delay + jitter;
}

/**
 * Retry a promise-returning function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param maxAttempts - Maximum number of attempts
 * @param onRetry - Optional callback on retry
 * @returns Result of the function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts - 1) {
        const delay = exponentialBackoff(attempt);
        onRetry?.(attempt + 1, lastError);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

/**
 * Generates a random string for IDs, tokens, etc.
 */
export function generateRandomString(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Type-safe way to check if environment is production
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Type-safe way to get required environment variable
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}
