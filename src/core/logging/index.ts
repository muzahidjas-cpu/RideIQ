// RideIQ Structured Logging
// Pino-based JSON logger. Application logs go to stderr (not stdout) so MCP STDIO
// protocol messages remain clean on stdout.

import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, levelFirst: true },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// MCP STDIO transport: stdout is reserved for protocol messages.
// All application logging must go through this logger (writes to stderr by default).

export { logger };
export type Logger = pino.Logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
