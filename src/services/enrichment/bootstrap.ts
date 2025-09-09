/**
 * Bootstrap module for dependency injection and service initialization
 * Following hybrid architecture: Classes for infrastructure, Functions for services
 */

import { Result, success, failure } from '../types';
import { ILogger, createLogger } from '../../infrastructure/logger/ILogger';
import { ICacheService } from '../../infrastructure/cache/ICacheService';
import { RedisCacheService } from '../../infrastructure/cache/RedisCacheService';
import { IRateLimiter, RateLimiter } from '../../infrastructure/rateLimiter/IRateLimiter';
import { CacheWarmer, CacheWarmerConfig } from '../../infrastructure/cache/CacheWarmer';
import { CacheInvalidator } from '../../infrastructure/cache/CacheInvalidator';
import { createDexScreenerService } from '../dexscreener';
import { createBaseScanService } from '../basescan';
import { createTokenMetadataService } from '../tokenMetadata';
import { MoralisPnLService } from '../moralisPnLService';
import { createSwapEnricher, SwapEnricher, SwapEnricherConfig } from './SwapEnricher';
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
    
    // Create cache service
    const cache = new RedisCacheService(
      {
        defaultTTL: config.cache?.defaultTTL || 300,
        enableCompression: config.cache?.enableCompression !== false,
        enableMetrics: config.cache?.enableMetrics !== false,
        namespace: config.cache?.namespace || 'swapwatch'
      },
      logger,
      config.redis?.url || process.env.REDIS_URL || 'redis://localhost:6379'
    );
    
    // Initialize cache connection
    await cache.connect();
    logger.info('Redis cache connected');
    
    // Create rate limiter
    const rateLimiter = new RateLimiter({
      requestsPerSecond: config.rateLimiter?.requestsPerSecond || 5,
      burst: config.rateLimiter?.burst || 10
    });
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
      strategy: 'immediate'
    });
    
    invalidator.addRule({
      trigger: 'token-update',
      patterns: ['token:*', 'metadata:*'],
      strategy: 'lazy'
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
      cache,
      logger,
      rateLimiter,
      config: {
        apiUrl: process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com/latest',
        apiKey: config.apis?.dexScreenerApiKey || process.env.DEXSCREENER_API_KEY,
        timeout: 5000
      }
    });
    logger.info('DexScreener service created');
    
    // Create BaseScan service
    const baseScan = createBaseScanService({
      cache,
      logger,
      rateLimiter,
      config: {
        apiKey: config.apis?.baseScanApiKey || process.env.BASESCAN_API_KEY || '',
        network: 'base',
        timeout: 10000
      }
    });
    logger.info('BaseScan service created');
    
    // Create Token Metadata service
    const tokenMetadata = createTokenMetadataService({
      cache,
      logger,
      rateLimiter,
      config: {
        providers: ['coingecko', 'ethplorer'],
        timeout: 5000
      }
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
          const result = await moralisPnL.getWalletPnLSummary('0x0000000000000000000000000000000000000000');
          checks.moralis = result.success;
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