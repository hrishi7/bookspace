import { UserRegisteredEvent } from '@bookspace/common';
import { createLogger } from '@bookspace/logger';

const logger = createLogger({ service: 'worker-user-registered' });

/**
 * Handle user.registered event
 */
export async function handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
  logger.info({ userId: event.data.userId }, 'Processing user.registered event');

  try {
    // TODO: Send welcome email
    // Example: "Welcome to BookSpace, here's how to get started..."
    
    logger.info({
      userId: event.data.userId,
      email: event.data.email,
      name: event.data.name,
    }, 'Welcome email would be sent');

    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 200));

    logger.info({ userId: event.data.userId }, 'User registered event processed');
  } catch (error) {
    logger.error({ error, userId: event.data.userId }, 'Failed to process user.registered');
    throw error;
  }
}
