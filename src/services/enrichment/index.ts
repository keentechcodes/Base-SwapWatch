/**
 * Enrichment orchestration service
 * Following hybrid architecture: functions for business logic
 * Coordinates multiple API services for comprehensive data enrichment
 */

import { 
  Result,
  success,
  failure
} from '../types';
import {
  SwapEvent,
  EnrichedSwapEvent,
  EnrichedTokenData,
  DataSource
} from '../types/extended';
import { DexScreenerService } from '../dexscreener';
import { BaseScanService } from '../basescan';
import { ILogger } from '../../infrastructure/logger/ILogger';
import BigNumber from 'bignumber.js';

export interface EnrichmentService {
  enrichSwapEvent: (event: SwapEvent) => Promise<Result<EnrichedSwapEvent>>;
  enrichTokenData: (address: string) => Promise<Result<EnrichedTokenData>>;
  enrichMultipleTokens: (addresses: string[]) => Promise<Result<EnrichedTokenData[]>>;
  calculateSwapMetrics: (event: SwapEvent, enrichedData: EnrichedTokenData) => SwapMetrics;
}

export interface SwapMetrics {
  amountInUsd: string;
  amountOutUsd: string;
  priceImpact: string;
  gasUsedUsd: string;
  totalValueUsd: string;
  profitLossUsd: string;
}

interface EnrichmentDependencies {
  dexScreener: DexScreenerService;
  basescan: BaseScanService;
  logger: ILogger;
}

/**
 * Create enrichment service with dependency injection
 * Factory function pattern for orchestration
 */
export const createEnrichmentService = (
  deps: EnrichmentDependencies
): EnrichmentService => {
  const { dexScreener, basescan, logger } = deps;

  /**
   * Enrich a single token with all available data
   * Uses Promise.allSettled for parallel fetching
   */
  const enrichTokenData = async (
    address: string
  ): Promise<Result<EnrichedTokenData>> => {
    logger.info('Enriching token data', { address });
    const startTime = Date.now();

    // Parallel fetch from all sources
    const [
      marketResult,
      tokenInfoResult,
      dexInfoResult,
      verificationResult
    ] = await Promise.allSettled([
      dexScreener.getTokenData(address),
      dexScreener.getTokenInfo(address),
      dexScreener.getDexInfo(address),
      basescan.getContractVerification(address)
    ]);

    // Process results
    const enrichedData: EnrichedTokenData = {
      token: tokenInfoResult.status === 'fulfilled' && tokenInfoResult.value.success
        ? tokenInfoResult.value.data
        : {
            address,
            name: 'Unknown',
            symbol: 'UNKNOWN',
            decimals: 18,
            totalSupply: '0'
          },
      market: marketResult.status === 'fulfilled' && marketResult.value.success
        ? marketResult.value.data
        : undefined,
      verification: verificationResult.status === 'fulfilled' && verificationResult.value.success
        ? verificationResult.value.data
        : undefined,
      dex: dexInfoResult.status === 'fulfilled' && dexInfoResult.value.success
        ? dexInfoResult.value.data
        : undefined,
      metadata: {
        source: 'mixed' as DataSource,
        cached: false,
        timestamp: new Date(),
        responseTime: Date.now() - startTime
      }
    };

    // Log enrichment stats
    const successCount = [
      marketResult.status === 'fulfilled' && marketResult.value.success,
      tokenInfoResult.status === 'fulfilled' && tokenInfoResult.value.success,
      dexInfoResult.status === 'fulfilled' && dexInfoResult.value.success,
      verificationResult.status === 'fulfilled' && verificationResult.value.success
    ].filter(Boolean).length;

    logger.info('Token enrichment complete', {
      address,
      successRate: `${successCount}/4`,
      responseTime: enrichedData.metadata.responseTime
    });

    return success(enrichedData);
  };

  /**
   * Enrich multiple tokens in parallel
   * Batch operation for efficiency
   */
  const enrichMultipleTokens = async (
    addresses: string[]
  ): Promise<Result<EnrichedTokenData[]>> => {
    logger.info('Enriching multiple tokens', { count: addresses.length });

    const results = await Promise.allSettled(
      addresses.map(address => enrichTokenData(address))
    );

    const enrichedTokens: EnrichedTokenData[] = [];
    const errors: Error[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        enrichedTokens.push(result.value.data);
      } else {
        const error = result.status === 'rejected' 
          ? result.reason 
          : (result.value as any).error;
        errors.push(new Error(`Failed to enrich ${addresses[index]}: ${error.message}`));
      }
    });

    if (enrichedTokens.length === 0) {
      return failure(new Error(`All token enrichments failed: ${errors[0]?.message}`));
    }

    logger.info('Multiple token enrichment complete', {
      total: addresses.length,
      successful: enrichedTokens.length,
      failed: errors.length
    });

    return success(enrichedTokens);
  };

  /**
   * Calculate swap metrics using enriched data
   * Pure function for metric calculations
   */
  const calculateSwapMetrics = (
    event: SwapEvent,
    enrichedData: EnrichedTokenData
  ): SwapMetrics => {
    const price = enrichedData.market?.price || '0';
    const decimals = enrichedData.token.decimals;

    // Calculate USD values
    const amountInUsd = calculateUsdValue(
      event.amountIn,
      price,
      decimals
    );

    const amountOutUsd = calculateUsdValue(
      event.amountOut,
      price,
      decimals
    );

    // Calculate price impact (simplified)
    const priceImpact = calculatePriceImpact(
      event.amountIn,
      event.amountOut,
      enrichedData.market?.liquidity || '0'
    );

    // Calculate gas cost in USD (assuming ETH price)
    const gasUsedUsd = calculateGasUsd(
      event.gasUsed || '0',
      event.gasPrice || '0'
    );

    // Total value and P&L
    const totalValueUsd = new BigNumber(amountInUsd)
      .plus(amountOutUsd)
      .toFixed(2);

    const profitLossUsd = new BigNumber(amountOutUsd)
      .minus(amountInUsd)
      .minus(gasUsedUsd)
      .toFixed(2);

    return {
      amountInUsd,
      amountOutUsd,
      priceImpact,
      gasUsedUsd,
      totalValueUsd,
      profitLossUsd
    };
  };

  /**
   * Enrich a swap event with market data and calculations
   */
  const enrichSwapEvent = async (
    event: SwapEvent
  ): Promise<Result<EnrichedSwapEvent>> => {
    logger.info('Enriching swap event', { 
      tokenIn: event.tokenIn,
      tokenOut: event.tokenOut,
      transactionHash: event.transactionHash
    });

    // Enrich both tokens in parallel
    const tokensResult = await enrichMultipleTokens([
      event.tokenIn,
      event.tokenOut
    ]);

    if (!tokensResult.success) {
      return failure(tokensResult.error);
    }

    const [tokenInData, tokenOutData] = tokensResult.data;

    // Calculate metrics for both sides
    const tokenInMetrics = calculateSwapMetrics(event, tokenInData);
    const tokenOutMetrics = calculateSwapMetrics(
      { ...event, amountIn: event.amountOut, amountOut: event.amountIn },
      tokenOutData
    );

    // Create enriched event
    const enrichedEvent: EnrichedSwapEvent = {
      ...event,
      enrichment: {
        tokenIn: tokenInData,
        tokenOut: tokenOutData,
        metrics: {
          tokenInUsd: tokenInMetrics.amountInUsd,
          tokenOutUsd: tokenOutMetrics.amountOutUsd,
          priceImpact: tokenInMetrics.priceImpact,
          gasUsedUsd: tokenInMetrics.gasUsedUsd,
          totalValueUsd: new BigNumber(tokenInMetrics.amountInUsd)
            .plus(tokenOutMetrics.amountOutUsd)
            .toFixed(2),
          profitLossUsd: new BigNumber(tokenOutMetrics.amountOutUsd)
            .minus(tokenInMetrics.amountInUsd)
            .minus(tokenInMetrics.gasUsedUsd)
            .toFixed(2)
        },
        timestamp: new Date()
      }
    };

    logger.info('Swap enrichment complete', {
      transactionHash: event.transactionHash,
      tokenInUsd: enrichedEvent.enrichment.metrics.tokenInUsd,
      tokenOutUsd: enrichedEvent.enrichment.metrics.tokenOutUsd,
      profitLossUsd: enrichedEvent.enrichment.metrics.profitLossUsd
    });

    return success(enrichedEvent);
  };

  // Return service interface
  return {
    enrichSwapEvent,
    enrichTokenData,
    enrichMultipleTokens,
    calculateSwapMetrics
  };
};

/**
 * Helper function to calculate USD value
 * Pure function
 */
const calculateUsdValue = (
  amount: string,
  price: string,
  decimals: number
): string => {
  if (!amount || !price || price === '0') return '0';
  
  return new BigNumber(amount)
    .dividedBy(new BigNumber(10).pow(decimals))
    .multipliedBy(price)
    .toFixed(2);
};

/**
 * Calculate price impact
 * Pure function
 */
const calculatePriceImpact = (
  amountIn: string,
  amountOut: string,
  liquidity: string
): string => {
  if (!liquidity || liquidity === '0') return '0';
  
  // Calculate the expected amount out without price impact
  const expectedRatio = new BigNumber(amountIn).dividedBy(liquidity);
  const actualRatio = new BigNumber(amountIn).dividedBy(amountOut);
  
  // Price impact = (actual - expected) / expected * 100
  const impact = actualRatio.minus(expectedRatio)
    .dividedBy(expectedRatio.isZero() ? 1 : expectedRatio)
    .abs()
    .multipliedBy(100)
    .toFixed(2);
  
  return impact;
};

/**
 * Calculate gas cost in USD
 * Pure function
 */
const calculateGasUsd = (
  gasUsed: string,
  gasPrice: string,
  ethPrice: string = '2500' // Default ETH price
): string => {
  return new BigNumber(gasUsed)
    .multipliedBy(gasPrice)
    .dividedBy(1e18)
    .multipliedBy(ethPrice)
    .toFixed(2);
};