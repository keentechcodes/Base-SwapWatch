/**
 * Swap Event Enricher - Orchestration Layer
 * Following hybrid architecture: Factory function for service creation
 */

import { Result, success, failure } from '../types';
import { WebhookEvent } from '../../types/webhook';
import { SwapData } from '../../utils/swapDetector';
import { ICacheService } from '../../infrastructure/cache/ICacheService';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { IRateLimiter } from '../../infrastructure/rateLimiter/IRateLimiter';
import { DexScreenerService } from '../dexscreener';
import { BaseScanService } from '../basescan';
import { TokenMetadataService } from '../tokenMetadata';
import { MoralisPnLService } from '../moralisPnLService';
import { CacheKeys } from '../../infrastructure/cache/CacheKeyBuilder';
import { TTL } from '../../infrastructure/cache/CacheTTLConfig';

/**
 * Enriched swap event with comprehensive market data
 */
export interface EnrichedSwapEvent extends SwapData {
  enrichedAt: Date;
  tokenInData?: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    price?: string;
    marketCap?: string;
    volume24h?: string;
    liquidity?: string;
    priceChange24h?: number;
    isVerified?: boolean;
    logo?: string;
  };
  tokenOutData?: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    price?: string;
    marketCap?: string;
    volume24h?: string;
    liquidity?: string;
    priceChange24h?: number;
    isVerified?: boolean;
    logo?: string;
  };
  usdValues?: {
    amountInUsd?: string;
    amountOutUsd?: string;
    slippage?: number;
    priceImpact?: number;
  };
  walletData?: {
    isExperiencedTrader?: boolean;
    totalProfit?: number;
    profitPercentage?: number;
    totalTrades?: number;
    winRate?: number;
  };
  enrichmentMetrics?: {
    latency: number;
    cacheHits: number;
    cacheMisses: number;
    apiCalls: number;
    fallbacksUsed: string[];
  };
}

/**
 * Dependencies for SwapEnricher
 */
export interface SwapEnricherDependencies {
  cache: ICacheService;
  logger: ILogger;
  rateLimiter: IRateLimiter;
  dexScreener: DexScreenerService;
  baseScan: BaseScanService;
  tokenMetadata: TokenMetadataService;
  moralisPnL?: MoralisPnLService;
}

/**
 * Configuration for SwapEnricher
 */
export interface SwapEnricherConfig {
  enablePnL?: boolean;
  enableVerification?: boolean;
  maxLatency?: number;
  fallbackOnError?: boolean;
  parallelFetch?: boolean;
}

/**
 * SwapEnricher service interface
 */
export interface SwapEnricher {
  enrichSwapEvent(event: WebhookEvent, swapData: SwapData): Promise<Result<EnrichedSwapEvent>>;
  enrichTokenData(tokenAddress: string): Promise<Result<any>>;
  calculateUsdValues(
    amountIn: string,
    amountOut: string,
    tokenInPrice: string,
    tokenOutPrice: string,
    decimalsIn: number,
    decimalsOut: number
  ): Result<any>;
  getEnrichmentMetrics(): EnrichmentMetrics;
  clearCache(): Promise<Result<void>>;
}

/**
 * Enrichment metrics for monitoring
 */
export interface EnrichmentMetrics {
  totalEnrichments: number;
  averageLatency: number;
  cacheHitRate: number;
  apiCallCount: number;
  errorCount: number;
  fallbackCount: number;
}

/**
 * Create SwapEnricher factory function
 * Following hybrid architecture: function-based service with dependency injection
 */
export const createSwapEnricher = (
  deps: SwapEnricherDependencies,
  config: SwapEnricherConfig = {}
): SwapEnricher => {
  // Configuration defaults
  const {
    enablePnL = false,
    enableVerification = true,
    maxLatency = 500,
    fallbackOnError = true,
    parallelFetch = true
  } = config;

  // Metrics tracking
  let metrics: EnrichmentMetrics = {
    totalEnrichments: 0,
    averageLatency: 0,
    cacheHitRate: 0,
    apiCallCount: 0,
    errorCount: 0,
    fallbackCount: 0
  };

  /**
   * Enrich a swap event with market data
   */
  const enrichSwapEvent = async (
    event: WebhookEvent,
    swapData: SwapData
  ): Promise<Result<EnrichedSwapEvent>> => {
    const startTime = Date.now();
    const enrichmentMetrics = {
      latency: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      fallbacksUsed: [] as string[]
    };

    try {
      deps.logger.info('Starting swap enrichment', {
        transactionHash: event.transactionHash,
        tokenIn: swapData.tokenIn,
        tokenOut: swapData.tokenOut
      });

      // Base enriched event
      const enrichedEvent: EnrichedSwapEvent = {
        ...swapData,
        enrichedAt: new Date()
      };

      // Fetch token data in parallel if enabled
      if (parallelFetch) {
        const [tokenInResult, tokenOutResult, walletResult] = await Promise.allSettled([
          swapData.tokenIn ? enrichTokenData(swapData.tokenIn) : Promise.resolve(null),
          swapData.tokenOut ? enrichTokenData(swapData.tokenOut) : Promise.resolve(null),
          enablePnL && swapData.from ? enrichWalletData(swapData.from) : Promise.resolve(null)
        ]);

        // Process token in data
        if (tokenInResult.status === 'fulfilled' && tokenInResult.value) {
          if (tokenInResult.value.success) {
            enrichedEvent.tokenInData = tokenInResult.value.data;
            enrichmentMetrics.cacheHits += tokenInResult.value.data.fromCache ? 1 : 0;
            enrichmentMetrics.cacheMisses += tokenInResult.value.data.fromCache ? 0 : 1;
          } else {
            enrichmentMetrics.fallbacksUsed.push('tokenIn');
          }
        }

        // Process token out data
        if (tokenOutResult.status === 'fulfilled' && tokenOutResult.value) {
          if (tokenOutResult.value.success) {
            enrichedEvent.tokenOutData = tokenOutResult.value.data;
            enrichmentMetrics.cacheHits += tokenOutResult.value.data.fromCache ? 1 : 0;
            enrichmentMetrics.cacheMisses += tokenOutResult.value.data.fromCache ? 0 : 1;
          } else {
            enrichmentMetrics.fallbacksUsed.push('tokenOut');
          }
        }

        // Process wallet data
        if (walletResult.status === 'fulfilled' && walletResult.value) {
          if (walletResult.value.success) {
            enrichedEvent.walletData = walletResult.value.data;
          } else {
            enrichmentMetrics.fallbacksUsed.push('wallet');
          }
        }
      } else {
        // Sequential fetch (slower but more controlled)
        if (swapData.tokenIn) {
          const tokenInResult = await enrichTokenData(swapData.tokenIn);
          if (tokenInResult.success) {
            enrichedEvent.tokenInData = tokenInResult.data;
          }
        }

        if (swapData.tokenOut) {
          const tokenOutResult = await enrichTokenData(swapData.tokenOut);
          if (tokenOutResult.success) {
            enrichedEvent.tokenOutData = tokenOutResult.data;
          }
        }
      }

      // Calculate USD values if we have price data
      if (enrichedEvent.tokenInData?.price && enrichedEvent.tokenOutData?.price &&
          swapData.amountIn && swapData.amountOut) {
        const usdResult = calculateUsdValues(
          swapData.amountIn,
          swapData.amountOut,
          enrichedEvent.tokenInData.price,
          enrichedEvent.tokenOutData.price,
          enrichedEvent.tokenInData.decimals,
          enrichedEvent.tokenOutData.decimals
        );
        
        if (usdResult.success) {
          enrichedEvent.usdValues = usdResult.data;
        }
      }

      // Add metrics to response
      enrichmentMetrics.latency = Date.now() - startTime;
      enrichmentMetrics.apiCalls = enrichmentMetrics.cacheMisses;
      enrichedEvent.enrichmentMetrics = enrichmentMetrics;

      // Update global metrics
      metrics.totalEnrichments++;
      metrics.averageLatency = 
        (metrics.averageLatency * (metrics.totalEnrichments - 1) + enrichmentMetrics.latency) / 
        metrics.totalEnrichments;
      metrics.apiCallCount += enrichmentMetrics.apiCalls;
      metrics.cacheHitRate = 
        enrichmentMetrics.cacheHits / (enrichmentMetrics.cacheHits + enrichmentMetrics.cacheMisses);

      deps.logger.info('Swap enrichment completed', {
        transactionHash: event.transactionHash,
        latency: enrichmentMetrics.latency,
        cacheHits: enrichmentMetrics.cacheHits,
        apiCalls: enrichmentMetrics.apiCalls
      });

      return success(enrichedEvent);

    } catch (error) {
      metrics.errorCount++;
      deps.logger.error('Failed to enrich swap event', error as Error);
      
      if (fallbackOnError) {
        // Return partial enrichment
        const enrichedEvent: EnrichedSwapEvent = {
          ...swapData,
          enrichedAt: new Date(),
          enrichmentMetrics: {
            latency: Date.now() - startTime,
            cacheHits: 0,
            cacheMisses: 0,
            apiCalls: 0,
            fallbacksUsed: ['error-fallback']
          }
        };
        return success(enrichedEvent);
      }
      
      return failure(error as Error);
    }
  };

  /**
   * Enrich individual token data
   */
  const enrichTokenData = async (tokenAddress: string): Promise<Result<any>> => {
    try {
      // Try cache first
      const cacheKey = CacheKeys.token.info(tokenAddress);
      const cached = await deps.cache.get<any>(cacheKey);
      
      if (cached.success && cached.data) {
        deps.logger.debug('Token data from cache', { tokenAddress });
        return success({ ...cached.data, fromCache: true });
      }

      // Fetch from APIs
      const tokenData: any = {
        address: tokenAddress,
        fromCache: false
      };

      // Get metadata
      const metadataResult = await deps.tokenMetadata.getTokenMetadata(tokenAddress);
      if (metadataResult.success) {
        Object.assign(tokenData, metadataResult.data);
      }

      // Get market data
      const marketResult = await deps.dexScreener.getTokenData(tokenAddress);
      if (marketResult.success) {
        Object.assign(tokenData, marketResult.data);
      }

      // Get verification status if enabled
      if (enableVerification) {
        const verificationResult = await deps.baseScan.getContractVerification(tokenAddress);
        if (verificationResult.success) {
          tokenData.isVerified = verificationResult.data.isVerified;
        }
      }

      // Cache the result
      await deps.cache.set(cacheKey, tokenData, { ttl: TTL.METADATA });

      return success(tokenData);

    } catch (error) {
      deps.logger.error('Failed to enrich token data', error as Error);
      return failure(error as Error);
    }
  };

  /**
   * Enrich wallet data with PnL information
   */
  const enrichWalletData = async (walletAddress: string): Promise<Result<any>> => {
    if (!deps.moralisPnL || !enablePnL) {
      return success(null);
    }

    try {
      const cacheKey = CacheKeys.wallet.pnl(walletAddress);
      const cached = await deps.cache.get<any>(cacheKey);
      
      if (cached.success && cached.data) {
        return success(cached.data);
      }

      const pnlResult = await deps.moralisPnL.getWalletPnLSummary(walletAddress);
      if (pnlResult.success) {
        const walletData = {
          isExperiencedTrader: pnlResult.data.totalTrades > 50,
          totalProfit: pnlResult.data.totalRealizedProfitUsd,
          profitPercentage: pnlResult.data.totalRealizedProfitPercentage,
          totalTrades: pnlResult.data.totalBuys + pnlResult.data.totalSells,
          winRate: pnlResult.data.winRate
        };
        
        await deps.cache.set(cacheKey, walletData, { ttl: TTL.MARKET });
        return success(walletData);
      }

      return failure(new Error('Failed to fetch wallet PnL'));

    } catch (error) {
      deps.logger.error('Failed to enrich wallet data', error as Error);
      return failure(error as Error);
    }
  };

  /**
   * Calculate USD values for swap amounts
   */
  const calculateUsdValues = (
    amountIn: string,
    amountOut: string,
    tokenInPrice: string,
    tokenOutPrice: string,
    decimalsIn: number,
    decimalsOut: number
  ): Result<any> => {
    try {
      // Convert amounts to actual values
      const actualAmountIn = parseFloat(amountIn) / Math.pow(10, decimalsIn);
      const actualAmountOut = parseFloat(amountOut) / Math.pow(10, decimalsOut);
      
      // Calculate USD values
      const amountInUsd = actualAmountIn * parseFloat(tokenInPrice);
      const amountOutUsd = actualAmountOut * parseFloat(tokenOutPrice);
      
      // Calculate slippage (difference between expected and actual)
      const expectedOutUsd = amountInUsd;
      const slippage = ((expectedOutUsd - amountOutUsd) / expectedOutUsd) * 100;
      
      // Estimate price impact (simplified)
      const priceImpact = Math.abs(slippage) > 1 ? Math.abs(slippage) * 0.5 : 0;

      return success({
        amountInUsd: amountInUsd.toFixed(2),
        amountOutUsd: amountOutUsd.toFixed(2),
        slippage: parseFloat(slippage.toFixed(4)),
        priceImpact: parseFloat(priceImpact.toFixed(4))
      });

    } catch (error) {
      deps.logger.error('Failed to calculate USD values', error as Error);
      return failure(error as Error);
    }
  };

  /**
   * Get enrichment metrics
   */
  const getEnrichmentMetrics = (): EnrichmentMetrics => {
    return { ...metrics };
  };

  /**
   * Clear cache (for testing or manual refresh)
   */
  const clearCache = async (): Promise<Result<void>> => {
    try {
      await deps.cache.flush();
      deps.logger.info('Cache cleared');
      return success(undefined);
    } catch (error) {
      deps.logger.error('Failed to clear cache', error as Error);
      return failure(error as Error);
    }
  };

  // Return service interface
  return {
    enrichSwapEvent,
    enrichTokenData,
    calculateUsdValues,
    getEnrichmentMetrics,
    clearCache
  };
};