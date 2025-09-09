/**
 * Token metadata service for fetching token information from multiple sources
 */

import { Result, success, failure } from '../types';
import { ICacheManager } from '../../infrastructure/cache/ICacheManager';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { IRateLimiter } from '../types';

export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
  logo?: string;
  website?: string;
  description?: string;
  tags?: string[];
}

export interface TokenMetadataServiceDependencies {
  cache: ICacheManager;
  logger: ILogger;
  rateLimiter: IRateLimiter;
}

export interface TokenMetadataService {
  getTokenMetadata(address: string): Promise<Result<TokenMetadata>>;
  getMultipleTokens(addresses: string[]): Promise<Result<Map<string, TokenMetadata>>>;
}

/**
 * Create token metadata service
 */
export const createTokenMetadataService = (
  deps: TokenMetadataServiceDependencies
): TokenMetadataService => {
  const { cache, logger, rateLimiter } = deps;

  /**
   * Get token metadata
   */
  const getTokenMetadata = async (address: string): Promise<Result<TokenMetadata>> => {
    try {
      // Check cache first
      const cacheKey = `token:metadata:${address}`;
      const cached = await cache.get<TokenMetadata>(cacheKey);
      
      if (cached) {
        return success(cached);
      }

      // Check rate limit
      try {
        await rateLimiter.acquire();
      } catch (error) {
        return failure(new Error('Rate limit exceeded'));
      }

      // For now, return mock data
      // In production, this would fetch from CoinGecko, Ethplorer, etc.
      const metadata: TokenMetadata = {
        address,
        name: 'Unknown Token',
        symbol: 'UNKNOWN',
        decimals: 18,
        totalSupply: '0'
      };

      // Cache the result
      await cache.set(cacheKey, metadata, 3600);

      logger.info('Fetched token metadata', { address });
      return success(metadata);
    } catch (error) {
      logger.error('Failed to fetch token metadata', error as Error);
      return failure(error as Error);
    }
  };

  /**
   * Get multiple token metadata
   */
  const getMultipleTokens = async (
    addresses: string[]
  ): Promise<Result<Map<string, TokenMetadata>>> => {
    try {
      const results = new Map<string, TokenMetadata>();
      
      // Fetch in parallel
      const promises = addresses.map(async (address) => {
        const result = await getTokenMetadata(address);
        if (result.success && result.data) {
          results.set(address, result.data);
        }
      });

      await Promise.all(promises);

      if (results.size === 0) {
        return failure(new Error('Failed to fetch any token metadata'));
      }

      return success(results);
    } catch (error) {
      logger.error('Failed to fetch multiple token metadata', error as Error);
      return failure(error as Error);
    }
  };

  return {
    getTokenMetadata,
    getMultipleTokens
  };
};