import pino from 'pino';

export interface LoggerConfig {
  level?: string;
  pretty?: boolean;
  service?: string;
}

/**
 * Creates a structured logger instance with consistent formatting
 * 
 * @param config - Logger configuration
 * @returns Configured Pino logger instance
 */
export function createLogger(config: LoggerConfig = {}) {
  const { level = 'info', pretty = process.env.NODE_ENV !== 'production', service } = config;

  const logger = pino({
    level,
    name: service,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  });

  return logger;
}

/**
 * Creates a child logger with additional context
 * 
 * @param parent - Parent logger instance
 * @param context - Additional context to include in all logs
 * @returns Child logger with bound context
 */
export function createChildLogger(parent: pino.Logger, context: Record<string, unknown>) {
  return parent.child(context);
}

export type Logger = pino.Logger;
