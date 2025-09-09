/**
 * Extended types for API services
 * Supplements the main types file with additional interfaces
 */

import { TokenInfo as BaseTokenInfo, VerificationData, MarketData } from './index';

/**
 * Extended token info with additional fields
 */
export interface ExtendedTokenInfo extends BaseTokenInfo {
  circulatingSupply?: string;
  logo?: string;
  description?: string;
  website?: string;
  social?: {
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
    reddit?: string;
  };
}

/**
 * Transaction information
 */
export interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: Date;
  gasUsed: string;
  gasPrice: string;
  status: 'success' | 'failed' | 'pending';
  methodId?: string;
  functionName?: string;
}

/**
 * Swap event data
 */
export interface SwapEvent {
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  from: string;
  to: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  router?: string;
  pair?: string;
  gasUsed?: string;
  gasPrice?: string;
}

/**
 * Enriched swap event with market data
 */
export interface EnrichedSwapEvent extends SwapEvent {
  enrichment: {
    tokenIn: EnrichedTokenData;
    tokenOut: EnrichedTokenData;
    metrics: {
      tokenInUsd: string;
      tokenOutUsd: string;
      priceImpact: string;
      gasUsedUsd: string;
      totalValueUsd: string;
      profitLossUsd: string;
    };
    timestamp: Date;
  };
}

/**
 * Enriched token data combining all sources
 */
export interface EnrichedTokenData {
  token: ExtendedTokenInfo;
  market?: MarketData;
  verification?: ExtendedVerificationData;
  dex?: any; // Can be DexInfo or DexScreenerDexInfo
  links?: TokenLinks;
  metadata: {
    source: DataSource;
    cached: boolean;
    timestamp: Date;
    responseTime: number;
  };
}

/**
 * Extended verification data
 */
export interface ExtendedVerificationData extends VerificationData {
  verified: boolean;
  compiler?: string;
  optimized?: boolean;
  sourceAvailable?: boolean;
  verifiedAt?: Date;
}

/**
 * Token links and resources
 */
export interface TokenLinks {
  explorer?: string;
  dexScreener?: string;
  coingecko?: string;
  coinmarketcap?: string;
  website?: string;
  whitepaper?: string;
  github?: string;
}

/**
 * Data source indicator
 */
export type DataSource = 'cache' | 'api' | 'hybrid' | 'mixed';

// Re-export types for convenience
export type {
  VerificationData,
  MarketData
} from './index';