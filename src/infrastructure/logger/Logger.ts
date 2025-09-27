import * as fs from 'fs/promises';
import * as path from 'path';
import { ILogger, LogLevel, LogContext, LogEntry, LoggerConfig } from './ILogger';

/**
 * Logger implementation with buffering support
 * Following hybrid architecture: stateful infrastructure as class
 */
export class Logger implements ILogger {
  private buffer: LogEntry[] = [];
  private config: Required<LoggerConfig>;
  private flushTimer?: NodeJS.Timeout;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level || 'info',
      bufferSize: config.bufferSize || 100,
      flushInterval: config.flushInterval || 5000,
      outputFormat: config.outputFormat || 'pretty',
      enableBuffer: config.enableBuffer !== false,
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile || false,
      filePath: config.filePath || './logs/app.log',
      service: config.service || 'SwapWatch'
    };

    if (this.config.enableBuffer && this.config.flushInterval > 0) {
      this.startAutoFlush();
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorInfo = this.extractErrorInfo(error);
    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'error',
      message,
      context: { ...context, service: this.config.service },
      error: errorInfo
    };

    this.processLogEntry(entry);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getBufferedLogs(): LogEntry[] {
    return [...this.buffer];
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.buffer];
    this.buffer = [];

    if (this.config.enableFile) {
      await this.writeToFile(logsToFlush);
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: { ...context, service: this.config.service }
    };

    this.processLogEntry(entry);
  }

  private processLogEntry(entry: LogEntry): void {
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }

    if (this.config.enableBuffer) {
      this.addToBuffer(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= this.config.bufferSize) {
      this.flush().catch(error => {
        console.error('[Logger] Failed to flush buffer:', error);
      });
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const formatted = this.config.outputFormat === 'json'
      ? this.formatJson(entry)
      : this.formatPretty(entry);

    const logMethod = this.getConsoleMethod(entry.level);
    logMethod(formatted);
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      ...entry.context,
      ...(entry.error && { error: entry.error })
    });
  }

  private formatPretty(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const service = entry.context?.service || this.config.service;
    
    let output = `[${timestamp}] [${level}] [${service}] ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 1) {
      const contextWithoutService = { ...entry.context };
      delete contextWithoutService.service;
      
      if (Object.keys(contextWithoutService).length > 0) {
        output += ` ${JSON.stringify(contextWithoutService)}`;
      }
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case 'debug': return console.debug;
      case 'info': return console.info;
      case 'warn': return console.warn;
      case 'error': return console.error;
      default: return console.log;
    }
  }

  private extractErrorInfo(error: Error | unknown): LogEntry['error'] | undefined {
    if (!error) {
      return undefined;
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }

    return {
      message: String(error)
    };
  }

  private async writeToFile(entries: LogEntry[]): Promise<void> {
    if (!this.config.enableFile || !this.config.filePath) {
      return;
    }

    try {
      const dir = path.dirname(this.config.filePath);
      await fs.mkdir(dir, { recursive: true });

      const lines = entries.map(entry => 
        this.config.outputFormat === 'json' 
          ? this.formatJson(entry) 
          : this.formatPretty(entry)
      ).join('\n') + '\n';

      await fs.appendFile(this.config.filePath, lines, 'utf-8');
    } catch (error) {
      console.error('[Logger] Failed to write to file:', error);
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('[Logger] Auto-flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

/**
 * Factory function to create logger instance
 */
export const createLogger = (config?: LoggerConfig): ILogger => {
  return new Logger(config);
};

/**
 * Singleton logger instance for global use
 */
let globalLogger: ILogger | null = null;

export const getGlobalLogger = (config?: LoggerConfig): ILogger => {
  if (!globalLogger) {
    globalLogger = createLogger(config);
  }
  return globalLogger;
};

// Re-export types for convenience
export type { ILogger, LogLevel, LogContext, LogEntry, LoggerConfig } from './ILogger';