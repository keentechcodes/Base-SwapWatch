/**
 * DexScreener service factory function
 * Following hybrid architecture: functions for business logic
 * No API key required for DexScreener
 */

import axios, { AxiosInstance } from 'axios';
import { 
  DexScreenerServiceConfig, 
  DexScreenerTokenResponse,
  DexScreenerPair 
} from './types';
import { 
  MarketData, 
  Result,
  success,
  failure,
  fromPromise
} from '../types';
import { ExtendedTokenInfo as TokenInfo } from '../types/extended';
import { DexScreenerDexInfo as DexInfo } from './dex-types';
import { ICacheManager } from '../../infrastructure/cache/ICacheManager';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { IRateLimiter } from '../types';
import {
  transformPairToMarketData,
  transformPairToTokenInfo,
  transformPairToDexInfo,
  selectBestPair,
  calculateUsdValue,
  isValidDexScreenerResponse
} from './transformers';

export interface DexScreenerService {
  getTokenData: (address: string) => Promise<Result<MarketData>>;
  getTokenInfo: (address: string) => Promise<Result<TokenInfo>>;
  getDexInfo: (address: string) => Promise<Result<DexInfo>>;
  getFullTokenData: (address: string) => Promise<Result<{
    market: MarketData;
    token: TokenInfo;
    dex: DexInfo;
  }>>;
  calculateTokenUsdValue: (address: string, amount: string, decimals?: number) => Promise<Result<string>>;
}

interface DexScreenerDependencies {
  cache: ICacheManager;
  logger: ILogger;
  rateLimiter: IRateLimiter;
  config?: DexScreenerServiceConfig;
}

/**
 * Create DexScreener service with dependency injection
 * Factory function pattern for functional approach
 */
export const createDexScreenerService = (
  deps: DexScreenerDependencies
): DexScreenerService => {
  const { cache, logger, rateLimiter, config } = deps;
  
  // Configure axios instance
  const axiosInstance: AxiosInstance = axios.create({
    baseURL: config?.baseUrl || 'https://api.dexscreener.com/latest',
    timeout: config?.timeout || 10000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SwapWatch/1.0'
    }
  });

  /**
   * Fetch token data from DexScreener API
   * Internal helper with caching and rate limiting
   */
  const fetchTokenPairs = async (address: string): Promise<Result<DexScreenerPair[]>> => {
    const cacheKey = `dexscreener:pairs:${address.toLowerCase()}`;
    
    // Check cache first
    const cached = await cache.get<DexScreenerPair[]>(cacheKey);
    if (cached) {
      logger.debug('DexScreener cache hit', { address, cacheKey });
      return success(cached);
    }

    // Rate limited API call
    const result = await fromPromise(
      rateLimiter.execute(async () => {
        logger.info('Fetching DexScreener data', { address });
        const response = await axiosInstance.get<DexScreenerTokenResponse>(
          `/dex/tokens/${address}`
        );
        return response.data;
      })
    );

    if (result.success) {
      if (!isValidDexScreenerResponse(result.data)) {
        return failure(new Error('Invalid DexScreener response format'));
      }

      const pairs = result.data.pairs.filter(
        pair => pair.chainId === 'base' // Filter for Base network only
      );

      // Cache for 5 minutes (market data TTL)
      await cache.set(cacheKey, pairs, 300);
      
      logger.info('DexScreener data fetched and cached', { 
        address, 
        pairCount: pairs.length 
      });
      
      return success(pairs);
    }

    logger.error('Failed to fetch DexScreener data', result.error);
    return result as Result<DexScreenerPair[], Error>;
  };

  /**
   * Get market data for a token
   */
  const getTokenData = async (address: string): Promise<Result<MarketData>> => {
    const pairsResult = await fetchTokenPairs(address);
    
    if (!pairsResult.success) {
      return failure(pairsResult.error);
    }

    const bestPair = selectBestPair(pairsResult.data);
    if (!bestPair) {
      return failure(new Error(`No pairs found for token ${address}`));
    }

    const marketData = transformPairToMarketData(bestPair);
    return success(marketData);
  };

  /**
   * Get token info
   */
  const getTokenInfo = async (address: string): Promise<Result<TokenInfo>> => {
    const pairsResult = await fetchTokenPairs(address);
    
    if (!pairsResult.success) {
      return failure(pairsResult.error);
    }

    const bestPair = selectBestPair(pairsResult.data);
    if (!bestPair) {
      return failure(new Error(`No pairs found for token ${address}`));
    }

    const tokenInfo = transformPairToTokenInfo(bestPair);
    return success(tokenInfo);
  };

  /**
   * Get DEX info for a token
   */
  const getDexInfo = async (address: string): Promise<Result<DexInfo>> => {
    const pairsResult = await fetchTokenPairs(address);
    
    if (!pairsResult.success) {
      return failure(pairsResult.error);
    }

    const bestPair = selectBestPair(pairsResult.data);
    if (!bestPair) {
      return failure(new Error(`No pairs found for token ${address}`));
    }

    const dexInfo = transformPairToDexInfo(bestPair);
    return success(dexInfo);
  };

  /**
   * Get all token data in one call
   */
  const getFullTokenData = async (address: string): Promise<Result<{
    market: MarketData;
    token: TokenInfo;
    dex: DexInfo;
  }>> => {
    const pairsResult = await fetchTokenPairs(address);
    
    if (!pairsResult.success) {
      return failure(pairsResult.error);
    }

    const bestPair = selectBestPair(pairsResult.data);
    if (!bestPair) {
      return failure(new Error(`No pairs found for token ${address}`));
    }

    return success({
      market: transformPairToMarketData(bestPair),
      token: transformPairToTokenInfo(bestPair),
      dex: transformPairToDexInfo(bestPair)
    });
  };

  /**
   * Calculate USD value for a token amount
   */
  const calculateTokenUsdValue = async (
    address: string, 
    amount: string, 
    decimals: number = 18
  ): Promise<Result<string>> => {
    const marketResult = await getTokenData(address);
    
    if (!marketResult.success) {
      return failure(marketResult.error);
    }

    const usdValue = calculateUsdValue(amount, marketResult.data.price, decimals);
    return success(usdValue);
  };

  // Return service interface
  return {
    getTokenData,
    getTokenInfo,
    getDexInfo,
    getFullTokenData,
    calculateTokenUsdValue
  };
};

// Re-export types and transformers
export * from './types';
export * from './transformers';