// Simple structured logger with file output support
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Configuration from environment
// Default to file logging in development for easier debugging
const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
const LOG_TO_FILE = process.env.LOG_TO_FILE !== 'false'; // Default true, set LOG_TO_FILE=false to disable
const LOG_DIR = process.env.LOG_DIR || 'logs';

// Ensure log directory exists
if (LOG_TO_FILE && !existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return join(LOG_DIR, `elise-${date}.log`);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatMessage(level: LogLevel, component: string, message: string, data?: object): string {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${dataStr}`;
}

function writeLog(level: LogLevel, component: string, message: string, data?: object): void {
  if (!shouldLog(level)) return;

  const formatted = formatMessage(level, component, message, data);

  // Console output (colored)
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[90m', // gray
    info: '\x1b[36m',  // cyan
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';

  if (level === 'error') {
    console.error(`${colors[level]}${formatted}${reset}`);
  } else {
    console.log(`${colors[level]}${formatted}${reset}`);
  }

  // File output
  if (LOG_TO_FILE) {
    try {
      appendFileSync(getLogFile(), formatted + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }
}

/**
 * Create a logger for a specific component.
 * Usage:
 *   const log = createLogger('Sync');
 *   log.info('Starting sync');
 *   log.error('Sync failed', { error: err.message });
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: object) => writeLog('debug', component, message, data),
    info: (message: string, data?: object) => writeLog('info', component, message, data),
    warn: (message: string, data?: object) => writeLog('warn', component, message, data),
    error: (message: string, data?: object) => writeLog('error', component, message, data),
  };
}

// Pre-configured loggers for common components
export const log = {
  sync: createLogger('Sync'),
  tools: createLogger('Tools'),
  booking: createLogger('Booking'),
  mrs: createLogger('MRS'),
  server: createLogger('Server'),
};
