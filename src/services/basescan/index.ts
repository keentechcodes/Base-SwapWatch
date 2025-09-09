/**
 * BaseScan service factory function
 * Following hybrid architecture: functions for business logic
 * Requires API key for BaseScan
 */

import axios, { AxiosInstance } from 'axios';
import { 
  BaseScanServiceConfig,
  BaseScanResponse,
  BaseScanContract,
  BaseScanTransaction,
  BaseScanTokenInfo,
  BaseScanTokenTransfer
} from './types';
import { 
  Result,
  success,
  failure,
  fromPromise
} from '../types';
import { ExtendedTokenInfo as TokenInfo, TransactionInfo, ExtendedVerificationData as VerificationData } from '../types/extended';
import { ICacheManager } from '../../infrastructure/cache/ICacheManager';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { IRateLimiter } from '../types';
import {
  transformContractToVerification,
  transformBaseScanTokenInfo,
  transformTransaction,
  transformTokenTransfer,
  isValidBaseScanResponse,
  isSuccessfulResponse,
  parseContractABI
} from './transformers';

export interface BaseScanService {
  getContractVerification: (address: string) => Promise<Result<VerificationData>>;
  getTokenInfo: (address: string) => Promise<Result<TokenInfo>>;
  getTransactionHistory: (address: string, limit?: number) => Promise<Result<TransactionInfo[]>>;
  getTokenTransfers: (address: string, tokenAddress?: string) => Promise<Result<any[]>>;
  getAccountBalance: (address: string) => Promise<Result<string>>;
  getContractABI: (address: string) => Promise<Result<any[]>>;
  isContract: (address: string) => Promise<Result<boolean>>;
}

interface BaseScanDependencies {
  cache: ICacheManager;
  logger: ILogger;
  rateLimiter: IRateLimiter;
  config: BaseScanServiceConfig;
}

/**
 * Create BaseScan service with dependency injection
 * Factory function pattern for functional approach
 */
export const createBaseScanService = (
  deps: BaseScanDependencies
): BaseScanService => {
  const { cache, logger, rateLimiter, config } = deps;
  
  if (!config.apiKey) {
    logger.warn('BaseScan API key not provided, service will have limited functionality');
  }

  // Configure axios instance
  const axiosInstance: AxiosInstance = axios.create({
    baseURL: config.baseUrl || 'https://api.basescan.org/api',
    timeout: config.timeout || 10000,
    params: {
      apikey: config.apiKey
    }
  });

  /**
   * Make API request with rate limiting and caching
   * Internal helper function
   */
  const makeRequest = async <T>(
    module: string,
    action: string,
    params: Record<string, string>,
    cacheKey?: string,
    cacheTTL?: number
  ): Promise<Result<T>> => {
    // Check cache if key provided
    if (cacheKey) {
      const cached = await cache.get<T>(cacheKey);
      if (cached) {
        logger.debug('BaseScan cache hit', { cacheKey });
        return success(cached);
      }
    }

    // Rate limited API call
    const result = await fromPromise(
      rateLimiter.execute(async () => {
        logger.info('Making BaseScan API request', { module, action });
        const response = await axiosInstance.get<BaseScanResponse<T>>('', {
          params: {
            module,
            action,
            ...params
          }
        });
        return response.data;
      })
    );

    if (!result.success) {
      logger.error('BaseScan API request failed', result.error);
      return failure(result.error);
    }

    if (!isValidBaseScanResponse<T>(result.data)) {
      return failure(new Error('Invalid BaseScan response format'));
    }

    if (!isSuccessfulResponse(result.data)) {
      return failure(new Error(`BaseScan API error: ${result.data.message}`));
    }

    // Cache successful result
    if (cacheKey && cacheTTL) {
      await cache.set(cacheKey, result.data.result, cacheTTL);
    }

    return success(result.data.result);
  };

  /**
   * Get contract verification status
   */
  const getContractVerification = async (
    address: string
  ): Promise<Result<VerificationData>> => {
    const cacheKey = `basescan:verification:${address.toLowerCase()}`;
    
    const result = await makeRequest<BaseScanContract[]>(
      'contract',
      'getsourcecode',
      { address },
      cacheKey,
      86400 // Cache for 24 hours
    );

    if (!result.success) {
      return failure(result.error);
    }

    if (!Array.isArray(result.data) || result.data.length === 0) {
      return failure(new Error('No contract data found'));
    }

    const verification = transformContractToVerification(result.data[0]);
    return success(verification);
  };

  /**
   * Get token information
   */
  const getTokenInfo = async (address: string): Promise<Result<TokenInfo>> => {
    const cacheKey = `basescan:tokeninfo:${address.toLowerCase()}`;
    
    const result = await makeRequest<BaseScanTokenInfo[]>(
      'token',
      'tokeninfo',
      { contractaddress: address },
      cacheKey,
      7200 // Cache for 2 hours
    );

    if (!result.success) {
      return failure(result.error);
    }

    if (!Array.isArray(result.data) || result.data.length === 0) {
      return failure(new Error('No token information found'));
    }

    const tokenInfo = transformBaseScanTokenInfo(result.data[0]);
    return success(tokenInfo);
  };

  /**
   * Get transaction history for an address
   */
  const getTransactionHistory = async (
    address: string,
    limit: number = 100
  ): Promise<Result<TransactionInfo[]>> => {
    const result = await makeRequest<BaseScanTransaction[]>(
      'account',
      'txlist',
      { 
        address,
        startblock: '0',
        endblock: '99999999',
        page: '1',
        offset: limit.toString(),
        sort: 'desc'
      }
    );

    if (!result.success) {
      return failure(result.error);
    }

    const transactions = result.data.map(transformTransaction);
    return success(transactions);
  };

  /**
   * Get token transfer events
   */
  const getTokenTransfers = async (
    address: string,
    tokenAddress?: string
  ): Promise<Result<any[]>> => {
    const params: Record<string, string> = {
      address,
      startblock: '0',
      endblock: '99999999',
      page: '1',
      offset: '100',
      sort: 'desc'
    };

    if (tokenAddress) {
      params.contractaddress = tokenAddress;
    }

    const result = await makeRequest<BaseScanTokenTransfer[]>(
      'account',
      tokenAddress ? 'tokentx' : 'tokentx',
      params
    );

    if (!result.success) {
      return failure(result.error);
    }

    const transfers = result.data.map(transformTokenTransfer);
    return success(transfers);
  };

  /**
   * Get account balance
   */
  const getAccountBalance = async (address: string): Promise<Result<string>> => {
    const result = await makeRequest<string>(
      'account',
      'balance',
      { address, tag: 'latest' }
    );

    if (!result.success) {
      return failure(result.error);
    }

    return success(result.data);
  };

  /**
   * Get contract ABI
   */
  const getContractABI = async (address: string): Promise<Result<any[]>> => {
    const cacheKey = `basescan:abi:${address.toLowerCase()}`;
    
    const result = await makeRequest<string>(
      'contract',
      'getabi',
      { address },
      cacheKey,
      86400 // Cache for 24 hours
    );

    if (!result.success) {
      return failure(result.error);
    }

    const abi = parseContractABI(result.data);
    if (!abi) {
      return failure(new Error('Failed to parse contract ABI'));
    }

    return success(abi);
  };

  /**
   * Check if address is a contract
   */
  const isContract = async (address: string): Promise<Result<boolean>> => {
    const cacheKey = `basescan:iscontract:${address.toLowerCase()}`;
    
    // Check cache first
    const cached = await cache.get<boolean>(cacheKey);
    if (cached !== null) {
      return success(cached);
    }

    // Get contract code
    const result = await makeRequest<string>(
      'proxy',
      'eth_getCode',
      { address, tag: 'latest' }
    );

    if (!result.success) {
      return failure(result.error);
    }

    const isContractAddress = result.data !== '0x' && result.data !== '';
    
    // Cache for 24 hours
    await cache.set(cacheKey, isContractAddress, 86400);
    
    return success(isContractAddress);
  };

  // Return service interface
  return {
    getContractVerification,
    getTokenInfo,
    getTransactionHistory,
    getTokenTransfers,
    getAccountBalance,
    getContractABI,
    isContract
  };
};

// Re-export types and transformers
export * from './types';
export * from './transformers';