/**
 * Logger module exports
 */

import { ILogger } from './ILogger';
import { Logger } from './Logger';

/**
 * Create a new logger instance
 */
export const createLogger = (config?: any): ILogger => {
  if (typeof config === 'string') {
    return new Logger({ service: config });
  }
  return new Logger(config);
};

export { ILogger, Logger };
export * from './ILogger';