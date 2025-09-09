/**
 * Moralis service factory function
 * Following hybrid architecture: functions for business logic
 * Provides enhanced token metadata, prices, and NFT data
 */

import axios, { AxiosInstance } from 'axios';
import { 
  Result,
  success,
  failure,
  fromPromise
} from '../types';
import { ExtendedTokenInfo as TokenInfo } from '../types/extended';
import { MarketData } from '../types';
import { ICacheManager } from '../../infrastructure/cache/ICacheManager';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { IRateLimiter } from '../types';

export interface MoralisService {
  getTokenMetadata: (address: string) => Promise<Result<TokenInfo>>;
  getTokenPrice: (address: string) => Promise<Result<MarketData>>;
  getNativeBalance: (address: string) => Promise<Result<string>>;
  getTokenBalances: (address: string) => Promise<Result<any[]>>;
  getTokenTransfers: (address: string, limit?: number) => Promise<Result<any[]>>;
  getNFTs: (address: string, limit?: number) => Promise<Result<any[]>>;
  resolveENS: (domain: string) => Promise<Result<string>>;
}

export interface MoralisServiceConfig {
  apiKey: string;
  baseUrl?: string;
  chain?: string; // Default 'base'
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

interface MoralisDependencies {
  cache: ICacheManager;
  logger: ILogger;
  rateLimiter: IRateLimiter;
  config: MoralisServiceConfig;
}

/**
 * Moralis API response types
 */
interface MoralisTokenMetadata {
  name: string;
  symbol: string;
  decimals: string;
  logo?: string;
  logo_hash?: string;
  thumbnail?: string;
  total_supply?: string;
  total_supply_formatted?: string;
  fully_diluted_valuation?: string;
  block_number?: string;
  validated?: number;
  created_at?: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
}

interface MoralisTokenPrice {
  tokenAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogo?: string;
  tokenDecimals?: string;
  usdPrice: number;
  usdPriceFormatted?: string;
  '24hrPercentChange'?: string;
  exchangeAddress?: string;
  exchangeName?: string;
  nativePrice?: {
    value: string;
    decimals: number;
    name: string;
    symbol: string;
  };
}

/**
 * Create Moralis service with dependency injection
 * Factory function pattern for functional approach
 */
export const createMoralisService = (
  deps: MoralisDependencies
): MoralisService => {
  const { cache, logger, rateLimiter, config } = deps;
  
  if (!config.apiKey) {
    logger.warn('Moralis API key not provided, service will not function');
  }

  const chain = config.chain || 'base';
  const baseURL = config.baseUrl || 'https://deep-index.moralis.io/api/v2.2';

  // Configure axios instance
  const axiosInstance: AxiosInstance = axios.create({
    baseURL,
    timeout: config.timeout || 10000,
    headers: {
      'X-API-Key': config.apiKey,
      'accept': 'application/json'
    }
  });

  /**
   * Make API request with rate limiting and caching
   */
  const makeRequest = async <T>(
    endpoint: string,
    params?: Record<string, any>,
    cacheKey?: string,
    cacheTTL?: number
  ): Promise<Result<T>> => {
    // Check cache if key provided
    if (cacheKey) {
      const cached = await cache.get<T>(cacheKey);
      if (cached) {
        logger.debug('Moralis cache hit', { cacheKey });
        return success(cached);
      }
    }

    // Rate limited API call
    const result = await fromPromise(
      rateLimiter.execute(async () => {
        logger.info('Making Moralis API request', { endpoint, chain });
        const response = await axiosInstance.get<T>(endpoint, { params });
        return response.data;
      })
    );

    if (!result.success) {
      logger.error('Moralis API request failed', result.error);
      return failure(result.error);
    }

    // Cache successful result
    if (cacheKey && cacheTTL) {
      await cache.set(cacheKey, result.data, cacheTTL);
    }

    return success(result.data);
  };

  /**
   * Get comprehensive token metadata
   */
  const getTokenMetadata = async (address: string): Promise<Result<TokenInfo>> => {
    const cacheKey = `moralis:metadata:${chain}:${address.toLowerCase()}`;
    
    const result = await makeRequest<MoralisTokenMetadata[]>(
      '/erc20/metadata',
      { chain, addresses: [address] },
      cacheKey,
      7200 // Cache for 2 hours
    );

    if (!result.success) {
      return failure(result.error);
    }

    const data = Array.isArray(result.data) ? result.data[0] : result.data as any;
    
    if (!data) {
      return failure(new Error('No token metadata found'));
    }

    const tokenInfo: TokenInfo = {
      address,
      name: data.name || 'Unknown',
      symbol: data.symbol || 'UNKNOWN',
      decimals: parseInt(data.decimals || '18'),
      totalSupply: data.total_supply || '0',
      logo: data.logo,
      circulatingSupply: data.total_supply_formatted,
      description: undefined, // Moralis doesn't provide description
      website: undefined, // Would need to fetch from another source
      social: {} // Would need to fetch from another source
    };

    return success(tokenInfo);
  };

  /**
   * Get current token price and market data
   */
  const getTokenPrice = async (address: string): Promise<Result<MarketData>> => {
    const cacheKey = `moralis:price:${chain}:${address.toLowerCase()}`;
    
    const result = await makeRequest<MoralisTokenPrice>(
      `/erc20/${address}/price`,
      { chain },
      cacheKey,
      300 // Cache for 5 minutes
    );

    if (!result.success) {
      return failure(result.error);
    }

    const priceData = result.data;
    
    const marketData: MarketData = {
      price: priceData.usdPrice?.toString() || '0',
      priceChange24h: parseFloat(priceData['24hrPercentChange'] || '0'),
      volume24h: '0', // Moralis doesn't provide volume in price endpoint
      liquidity: '0', // Moralis doesn't provide liquidity
      marketCap: '0', // Would need to calculate from price * supply
      fdv: '0', // Moralis doesn't provide FDV
      holders: 0, // Moralis doesn't provide holder count in this endpoint
      lastUpdated: new Date()
    };

    return success(marketData);
  };

  /**
   * Get native balance (ETH on Base)
   */
  const getNativeBalance = async (address: string): Promise<Result<string>> => {
    const result = await makeRequest<{ balance: string }>(
      `/${address}/balance`,
      { chain }
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data.balance);
  };

  /**
   * Get all token balances for a wallet
   */
  const getTokenBalances = async (address: string): Promise<Result<any[]>> => {
    const result = await makeRequest<any[]>(
      `/${address}/erc20`,
      { chain }
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data);
  };

  /**
   * Get token transfer history
   */
  const getTokenTransfers = async (
    address: string,
    limit: number = 100
  ): Promise<Result<any[]>> => {
    const result = await makeRequest<{ result: any[] }>(
      `/erc20/${address}/transfers`,
      { chain, limit }
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data.result || []);
  };

  /**
   * Get NFTs owned by address
   */
  const getNFTs = async (
    address: string,
    limit: number = 100
  ): Promise<Result<any[]>> => {
    const result = await makeRequest<{ result: any[] }>(
      `/${address}/nft`,
      { chain, limit }
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data.result || []);
  };

  /**
   * Resolve ENS domain to address
   */
  const resolveENS = async (domain: string): Promise<Result<string>> => {
    const cacheKey = `moralis:ens:${domain.toLowerCase()}`;
    
    const result = await makeRequest<{ address: string }>(
      `/resolve/ens/${domain}`,
      {},
      cacheKey,
      86400 // Cache for 24 hours
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data.address);
  };

  // Return service interface
  return {
    getTokenMetadata,
    getTokenPrice,
    getNativeBalance,
    getTokenBalances,
    getTokenTransfers,
    getNFTs,
    resolveENS
  };
};

// Export types
export type { MoralisTokenMetadata, MoralisTokenPrice };