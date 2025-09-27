/**
 * Logger utility - re-exports infrastructure logger for backward compatibility
 */
export { 
  createLogger as Logger,
  getGlobalLogger
} from '../infrastructure/logger/Logger';

export type {
  ILogger,
  LogLevel,
  LogContext,
  LogEntry,
  LoggerConfig
} from '../infrastructure/logger/Logger';