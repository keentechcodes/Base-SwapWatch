/**
 * Infrastructure initialization module
 * Following hybrid architecture: wiring together stateful infrastructure
 */
import { createCacheManager } from './cache/CacheManager';
import { ICacheManager, CacheConfig } from './cache/ICacheManager';
import { Logger, createLogger } from './logger/Logger';
import { ILogger, LoggerConfig } from './logger/ILogger';
import { RateLimiter } from '../services/base/RateLimiter';
import { IRateLimiter, RateLimiterConfig } from '../services/types';

export interface InfrastructureConfig {
  cache?: CacheConfig;
  logger?: LoggerConfig;
  rateLimiter?: RateLimiterConfig;
  enableRedis?: boolean;
}

export interface Infrastructure {
  cache: ICacheManager;
  logger: ILogger;
  rateLimiter: IRateLimiter;
}

/**
 * Initialize all infrastructure components
 * Returns configured instances ready for dependency injection
 */
export const initializeInfrastructure = async (
  config: InfrastructureConfig = {}
): Promise<Infrastructure> => {
  const logger = createLogger({
    level: config.logger?.level || 'info',
    bufferSize: config.logger?.bufferSize || 100,
    flushInterval: config.logger?.flushInterval || 5000,
    outputFormat: config.logger?.outputFormat || 'pretty',
    enableBuffer: config.logger?.enableBuffer !== false,
    enableConsole: config.logger?.enableConsole !== false,
    enableFile: config.logger?.enableFile || false,
    filePath: config.logger?.filePath || './logs/swapwatch.log',
    service: config.logger?.service || 'SwapWatch'
  });

  logger.info('Initializing infrastructure components', {
    operation: 'infrastructure.init'
  });

  let cache: ICacheManager;
  
  if (config.enableRedis !== false) {
    try {
      cache = await createCacheManager({
        host: config.cache?.host || process.env.REDIS_HOST || 'localhost',
        port: config.cache?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
        password: config.cache?.password || process.env.REDIS_PASSWORD,
        db: config.cache?.db || 0,
        keyPrefix: config.cache?.keyPrefix || 'swapwatch:',
        defaultTTL: config.cache?.defaultTTL || 300,
        maxRetries: config.cache?.maxRetries || 3,
        retryDelay: config.cache?.retryDelay || 1000,
        enableOfflineQueue: config.cache?.enableOfflineQueue !== false
      });
      
      logger.info('Cache manager initialized successfully', {
        operation: 'cache.init',
        connected: cache.isConnected()
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis cache, using null cache', {
        operation: 'cache.init',
        error: (error as Error).message
      });
      
      cache = await createCacheManager();
    }
  } else {
    logger.info('Redis disabled, using null cache', {
      operation: 'cache.init'
    });
    cache = await createCacheManager();
  }

  const rateLimiter = new RateLimiter(
    config.rateLimiter || {
      requestsPerSecond: 5,
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000
    }
  );

  logger.info('Rate limiter initialized', {
    operation: 'rateLimiter.init',
    config: config.rateLimiter
  });

  logger.info('Infrastructure initialization complete', {
    operation: 'infrastructure.init',
    components: {
      cache: cache.isConnected() ? 'redis' : 'null',
      logger: 'active',
      rateLimiter: 'active'
    }
  });

  return {
    cache,
    logger,
    rateLimiter
  };
};

/**
 * Shutdown all infrastructure components gracefully
 */
export const shutdownInfrastructure = async (
  infrastructure: Infrastructure
): Promise<void> => {
  const { cache, logger } = infrastructure;

  logger.info('Shutting down infrastructure components', {
    operation: 'infrastructure.shutdown'
  });

  try {
    await cache.close();
    logger.info('Cache manager closed', {
      operation: 'cache.shutdown'
    });
  } catch (error) {
    logger.error('Error closing cache manager', error as Error);
  }

  if (logger instanceof Logger) {
    await logger.destroy();
  }
};

/**
 * Health check for infrastructure components
 */
export const checkInfrastructureHealth = async (
  infrastructure: Infrastructure
): Promise<{
  healthy: boolean;
  components: {
    cache: { healthy: boolean; connected: boolean };
    logger: { healthy: boolean };
    rateLimiter: { healthy: boolean };
  };
}> => {
  const cacheHealthy = infrastructure.cache.isConnected();
  
  return {
    healthy: true,
    components: {
      cache: {
        healthy: true,
        connected: cacheHealthy
      },
      logger: {
        healthy: true
      },
      rateLimiter: {
        healthy: true
      }
    }
  };
};

export * from './cache/ICacheManager';
export * from './cache/CacheManager';
export * from './logger/ILogger';
export * from './logger/Logger';