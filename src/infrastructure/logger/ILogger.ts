/**
 * Logger interface for structured logging
 * Following hybrid architecture: stateful infrastructure as classes
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  flush(): Promise<void>;
  setLevel(level: LogLevel): void;
  getBufferedLogs(): LogEntry[];
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
  service?: string;
  operation?: string;
  tokenAddress?: string;
  transactionHash?: string;
  responseTime?: number;
  cached?: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

export interface LoggerConfig {
  level?: LogLevel;
  bufferSize?: number;
  flushInterval?: number;
  outputFormat?: 'json' | 'pretty';
  enableBuffer?: boolean;
  enableConsole?: boolean;
  enableFile?: boolean;
  filePath?: string;
  service?: string;
}