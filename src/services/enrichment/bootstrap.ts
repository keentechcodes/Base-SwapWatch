/**
 * Bootstrap module for dependency injection and service initialization
 * Following hybrid architecture: Classes for infrastructure, Functions for services
 */

import { Result, success, failure } from '../types';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { createLogger } from '../../infrastructure/logger';
import { ICacheService } from '../../infrastructure/cache/ICacheService';
// import { RedisCacheService } from '../../infrastructure/cache/RedisCacheService';
import { RateLimiter } from '../../infrastructure/rateLimiter/IRateLimiter';
import { RateLimiterAdapter } from '../../infrastructure/rateLimiter/RateLimiterAdapter';
import { CacheWarmer, CacheWarmerConfig } from '../../infrastructure/cache/CacheWarmer';
import { CacheInvalidator, InvalidationStrategy } from '../../infrastructure/cache/CacheInvalidator';
import { createDexScreenerService } from '../dexscreener';
import { createBaseScanService } from '../basescan';
import { createTokenMetadataService } from '../tokenMetadata';
import { MoralisPnLService } from '../moralisPnLService';
import { createSwapEnricher, SwapEnricher, SwapEnricherConfig } from './SwapEnricher';
import { IRateLimiter } from '../types';
import { FREQUENT_BASE_TOKENS } from '../../infrastructure/cache/CacheWarmer';

/**
 * Bootstrap configuration
 */
export interface BootstrapConfig {
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  apis?: {
    dexScreenerApiKey?: string;
    baseScanApiKey?: string;
    moralisApiKey?: string;
    enableMoralis?: boolean;
  };
  cache?: {
    defaultTTL?: number;
    enableCompression?: boolean;
    enableMetrics?: boolean;
    namespace?: string;
  };
  rateLimiter?: {
    requestsPerSecond?: number;
    burst?: number;
  };
  warmer?: CacheWarmerConfig;
  enricher?: SwapEnricherConfig;
  logger?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    pretty?: boolean;
  };
}

/**
 * Infrastructure components (stateful)
 */
export interface Infrastructure {
  logger: ILogger;
  cache: ICacheService;
  rateLimiter: IRateLimiter;
  warmer?: CacheWarmer;
  invalidator?: CacheInvalidator;
}

/**
 * Service components (stateless functions)
 */
export interface Services {
  dexScreener: ReturnType<typeof createDexScreenerService>;
  baseScan: ReturnType<typeof createBaseScanService>;
  tokenMetadata: ReturnType<typeof createTokenMetadataService>;
  moralisPnL?: MoralisPnLService;
  enricher: SwapEnricher;
}

/**
 * Bootstrap result
 */
export interface BootstrapResult {
  infrastructure: Infrastructure;
  services: Services;
  healthCheck: () => Promise<HealthCheckResult>;
  shutdown: () => Promise<void>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  services: {
    redis: boolean;
    dexScreener: boolean;
    baseScan: boolean;
    moralis?: boolean;
  };
  metrics?: {
    cacheHitRate: number;
    enrichmentLatency: number;
    apiCallCount: number;
  };
}

/**
 * Bootstrap the application with all dependencies
 */
export const bootstrap = async (
  config: BootstrapConfig = {}
): Promise<Result<BootstrapResult>> => {
  try {
    // ===========================
    // 1. Initialize Infrastructure (Classes)
    // ===========================
    
    // Create logger
    const logger = createLogger({
      level: config.logger?.level || 'info',
      pretty: config.logger?.pretty !== false
    });
    
    logger.info('Starting bootstrap process');
    
    // Create cache service - Using in-memory cache instead of Redis for now
    // const cache = new RedisCacheService(
    //   {
    //     defaultTTL: config.cache?.defaultTTL || 300,
    //     enableCompression: config.cache?.enableCompression !== false,
    //     enableMetrics: config.cache?.enableMetrics !== false,
    //     namespace: config.cache?.namespace || 'swapwatch'
    //   },
    //   logger,
    //   config.redis?.url || process.env.REDIS_URL || 'redis://localhost:6379'
    // );
    
    // Simple in-memory cache implementation with minimal ICacheService compliance
    const cacheStore = new Map<string, { value: any, expiry: number }>();
    const cache: any = {
      async get<T>(key: string): Promise<Result<T | null>> {
        try {
          const item = cacheStore.get(key);
          if (!item) return success(null);
          if (item.expiry < Date.now()) {
            cacheStore.delete(key);
            return success(null);
          }
          return success(item.value as T);
        } catch (error: any) {
          return failure(error);
        }
      },
      async set<T>(key: string, value: T, options?: any): Promise<Result<void>> {
        try {
          const ttl = typeof options === 'number' ? options : options?.ttl || 300;
          const expiry = Date.now() + (ttl * 1000);
          cacheStore.set(key, { value, expiry });
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async delete(key: string): Promise<Result<void>> {
        try {
          cacheStore.delete(key);
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async flush(): Promise<Result<void>> {
        try {
          cacheStore.clear();
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async ping(): Promise<Result<boolean>> {
        return success(true);
      },
      async mget<T>(keys: string[]): Promise<Result<(T | null)[]>> {
        try {
          const results = await Promise.all(
            keys.map(async key => {
              const result = await cache.get(key);
              return result.success ? result.data as T : null;
            })
          );
          return success(results);
        } catch (error: any) {
          return failure(error);
        }
      },
      async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<Result<void>> {
        try {
          await Promise.all(
            entries.map(e => cache.set(e.key, e.value, { ttl: e.ttl }))
          );
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async exists(key: string): Promise<Result<boolean>> {
        try {
          return success(cacheStore.has(key));
        } catch (error: any) {
          return failure(error);
        }
      },
      async ttl(key: string): Promise<Result<number>> {
        try {
          const item = cacheStore.get(key);
          if (!item) return success(-1);
          return success(Math.max(0, Math.floor((item.expiry - Date.now()) / 1000)));
        } catch (error: any) {
          return failure(error);
        }
      },
      async keys(pattern: string): Promise<Result<string[]>> {
        try {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return success(Array.from(cacheStore.keys()).filter(key => regex.test(key)));
        } catch (error: any) {
          return failure(error);
        }
      },
      // Additional required methods for ICacheService
      async getMany<T>(keys: string[]): Promise<Result<Map<string, T>>> {
        try {
          const map = new Map<string, T>();
          for (const key of keys) {
            const result = await cache.get(key);
            if (result.success && result.data !== null) {
              map.set(key, result.data as T);
            }
          }
          return success(map);
        } catch (error: any) {
          return failure(error);
        }
      },
      async setMany<T>(entries: Map<string, T>, options?: any): Promise<Result<void>> {
        try {
          for (const [key, value] of entries) {
            await cache.set(key, value, options);
          }
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async deleteMany(keys: string[]): Promise<Result<void>> {
        try {
          for (const key of keys) {
            cacheStore.delete(key);
          }
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async deleteByPattern(pattern: string): Promise<Result<number>> {
        try {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          let count = 0;
          for (const key of cacheStore.keys()) {
            if (regex.test(key)) {
              cacheStore.delete(key);
              count++;
            }
          }
          return success(count);
        } catch (error: any) {
          return failure(error);
        }
      },
      async deleteByTags(_tags: string[]): Promise<Result<number>> {
        return success(0); // Tags not implemented in simple cache
      },
      async touch(key: string, ttl: number): Promise<Result<void>> {
        try {
          const item = cacheStore.get(key);
          if (item) {
            item.expiry = Date.now() + (ttl * 1000);
          }
          return success(undefined);
        } catch (error: any) {
          return failure(error);
        }
      },
      async getEntry(key: string): Promise<Result<any | null>> {
        try {
          const item = cacheStore.get(key);
          if (!item) return success(null);
          return success({
            value: item.value,
            key,
            createdAt: new Date(),
            expiresAt: new Date(item.expiry),
            hits: 0
          });
        } catch (error: any) {
          return failure(error);
        }
      },
      async getStats(): Promise<Result<any>> {
        return success({
          hits: 0,
          misses: 0,
          sets: cacheStore.size,
          deletes: 0,
          evictions: 0,
          hitRate: 0,
          keyCount: cacheStore.size
        });
      },
      async warm<T>(entries: Map<string, T>, options?: any): Promise<Result<void>> {
        return cache.setMany(entries, options);
      },
      async invalidate(pattern: string): Promise<Result<number>> {
        return cache.deleteByPattern(pattern);
      },
      async wrap<T>(key: string, fn: () => Promise<T>, options?: any): Promise<Result<T>> {
        try {
          const cached = await cache.get(key);
          if (cached.success && cached.data !== null) {
            return success(cached.data as T);
          }
          const value = await fn();
          await cache.set(key, value, options);
          return success(value);
        } catch (error: any) {
          return failure(error);
        }
      },
      async getOrSet<T>(key: string, factory: () => Promise<T>, options?: any): Promise<Result<T>> {
        return cache.wrap(key, factory, options);
      },
      // Custom disconnect for cleanup
      async disconnect(): Promise<void> {
        // No-op for in-memory cache
        return Promise.resolve();
      }
    };
    
    logger.info('In-memory cache initialized (Redis disabled)');
    
    // Create rate limiter
    const baseRateLimiter = new RateLimiter({
      requestsPerSecond: config.rateLimiter?.requestsPerSecond || 5,
      burstSize: config.rateLimiter?.burst || 10
    });
    const rateLimiter = new RateLimiterAdapter(baseRateLimiter);
    logger.info('Rate limiter initialized');
    
    // Create cache warmer (optional)
    let warmer: CacheWarmer | undefined;
    if (config.warmer?.enabled) {
      warmer = new CacheWarmer(
        cache,
        logger,
        {
          ...config.warmer,
          frequentTokens: config.warmer.frequentTokens || FREQUENT_BASE_TOKENS
        }
      );
      warmer.start();
      logger.info('Cache warmer started');
    }
    
    // Create cache invalidator
    const invalidator = new CacheInvalidator(cache, logger);
    
    // Add default invalidation rules
    invalidator.addRule({
      trigger: 'price-update',
      patterns: ['market:*', 'price:*'],
      strategy: InvalidationStrategy.IMMEDIATE
    });
    
    invalidator.addRule({
      trigger: 'token-update',
      patterns: ['token:*', 'metadata:*'],
      strategy: InvalidationStrategy.LAZY
    });
    
    logger.info('Cache invalidator configured');
    
    const infrastructure: Infrastructure = {
      logger,
      cache,
      rateLimiter,
      warmer,
      invalidator
    };
    
    // ===========================
    // 2. Create Services (Functions)
    // ===========================
    
    // Create DexScreener service
    const dexScreener = createDexScreenerService({
      cache: cache as any, // Type compatibility wrapper
      logger,
      rateLimiter,
      config: {
        timeout: 5000
      }
    });
    logger.info('DexScreener service created');
    
    // Create BaseScan service
    const baseScan = createBaseScanService({
      cache: cache as any, // Type compatibility wrapper
      logger,
      rateLimiter,
      config: {
        apiKey: config.apis?.baseScanApiKey || process.env.BASESCAN_API_KEY || '',
        timeout: 10000
      }
    });
    logger.info('BaseScan service created');
    
    // Create Token Metadata service
    const tokenMetadata = createTokenMetadataService({
      cache: cache as any, // Type compatibility wrapper
      logger,
      rateLimiter
    });
    logger.info('Token metadata service created');
    
    // Create Moralis PnL service (optional)
    let moralisPnL: MoralisPnLService | undefined;
    if (config.apis?.enableMoralis && config.apis?.moralisApiKey) {
      moralisPnL = new MoralisPnLService({
        apiKey: config.apis.moralisApiKey,
        chains: ['base'],
        timeout: 5000
      });
      logger.info('Moralis PnL service created');
    }
    
    // Create Swap Enricher (orchestration)
    const enricher = createSwapEnricher(
      {
        cache,
        logger,
        rateLimiter,
        dexScreener,
        baseScan,
        tokenMetadata,
        moralisPnL
      },
      {
        enablePnL: config.apis?.enableMoralis || false,
        enableVerification: true,
        maxLatency: config.enricher?.maxLatency || 500,
        fallbackOnError: config.enricher?.fallbackOnError !== false,
        parallelFetch: config.enricher?.parallelFetch !== false
      }
    );
    logger.info('Swap enricher created');
    
    const services: Services = {
      dexScreener,
      baseScan,
      tokenMetadata,
      moralisPnL,
      enricher
    };
    
    // ===========================
    // 3. Create Helper Functions
    // ===========================
    
    /**
     * Health check function
     */
    const healthCheck = async (): Promise<HealthCheckResult> => {
      const checks = {
        redis: false,
        dexScreener: false,
        baseScan: false,
        moralis: false
      };
      
      // Check Redis
      try {
        const testKey = 'health:check';
        await cache.set(testKey, 'ok', { ttl: 10 });
        const result = await cache.get(testKey);
        checks.redis = result.success && result.data === 'ok';
      } catch {
        checks.redis = false;
      }
      
      // Check DexScreener
      try {
        // Test with a known token (USDC on Base)
        const result = await dexScreener.getTokenData('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
        checks.dexScreener = result.success;
      } catch {
        checks.dexScreener = false;
      }
      
      // Check BaseScan
      try {
        const result = await baseScan.getContractVerification('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
        checks.baseScan = result.success;
      } catch {
        checks.baseScan = false;
      }
      
      // Check Moralis (if enabled)
      if (moralisPnL) {
        try {
          const result = await moralisPnL.getWalletSummary('0x0000000000000000000000000000000000000000');
          checks.moralis = result !== null;
        } catch {
          checks.moralis = false;
        }
      }
      
      // Get metrics
      const enrichmentMetrics = enricher.getEnrichmentMetrics();
      const cacheStats = await cache.getStats();
      
      return {
        healthy: checks.redis && (checks.dexScreener || checks.baseScan),
        services: checks,
        metrics: {
          cacheHitRate: cacheStats.success ? cacheStats.data.hitRate : 0,
          enrichmentLatency: enrichmentMetrics.averageLatency,
          apiCallCount: enrichmentMetrics.apiCallCount
        }
      };
    };
    
    /**
     * Shutdown function for graceful cleanup
     */
    const shutdown = async (): Promise<void> => {
      logger.info('Starting shutdown process');
      
      // Stop cache warmer
      if (warmer) {
        warmer.stop();
        logger.info('Cache warmer stopped');
      }
      
      // Disconnect from Redis
      await cache.disconnect();
      logger.info('Redis disconnected');
      
      logger.info('Shutdown complete');
    };
    
    // ===========================
    // 4. Return Bootstrap Result
    // ===========================
    
    logger.info('Bootstrap complete');
    
    return success({
      infrastructure,
      services,
      healthCheck,
      shutdown
    });
    
  } catch (error) {
    return failure(new Error(`Bootstrap failed: ${(error as Error).message}`));
  }
};

/**
 * Create a minimal bootstrap for testing
 */
export const createTestBootstrap = async (
  overrides: Partial<BootstrapConfig> = {}
): Promise<Result<BootstrapResult>> => {
  return bootstrap({
    redis: {
      url: 'redis://localhost:6379/1' // Use different DB for tests
    },
    cache: {
      defaultTTL: 60,
      enableCompression: false,
      enableMetrics: true,
      namespace: 'test'
    },
    rateLimiter: {
      requestsPerSecond: 10,
      burst: 20
    },
    warmer: {
      enabled: false // Disable warmer for tests
    },
    logger: {
      level: 'error', // Less verbose for tests
      pretty: false
    },
    ...overrides
  });
};