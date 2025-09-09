/**
 * Cache TTL configuration for different components
 * Following requirements from spec: component-specific TTLs
 */

import { CacheNamespace } from './CacheKeyBuilder';

/**
 * TTL values in seconds
 */
export enum TTL {
  // Ultra short (for real-time data)
  REALTIME = 10,        // 10 seconds
  BALANCE = 30,         // 30 seconds
  
  // Short (for frequently changing data)
  PRICE = 60,           // 1 minute
  MARKET = 300,         // 5 minutes
  SWAP = 300,           // 5 minutes
  
  // Medium (for semi-static data)
  TRANSACTION = 3600,   // 1 hour
  NFT = 3600,           // 1 hour
  METADATA = 7200,      // 2 hours
  
  // Long (for rarely changing data)
  VERIFICATION = 86400, // 24 hours
  FACTORY = 86400,      // 24 hours
  ENS = 86400,          // 24 hours
  
  // Default fallback
  DEFAULT = 300         // 5 minutes
}

/**
 * TTL configuration by namespace
 */
export class CacheTTLConfig {
  private static readonly ttlMap: Map<CacheNamespace, number> = new Map([
    [CacheNamespace.MARKET, TTL.MARKET],
    [CacheNamespace.TOKEN, TTL.METADATA],
    [CacheNamespace.VERIFICATION, TTL.VERIFICATION],
    [CacheNamespace.TRANSACTION, TTL.TRANSACTION],
    [CacheNamespace.BALANCE, TTL.BALANCE],
    [CacheNamespace.NFT, TTL.NFT],
    [CacheNamespace.ENS, TTL.ENS],
    [CacheNamespace.SWAP, TTL.SWAP],
    [CacheNamespace.PRICE, TTL.PRICE],
    [CacheNamespace.METADATA, TTL.METADATA]
  ]);
  
  /**
   * Get TTL for namespace
   */
  static getTTL(namespace: CacheNamespace): number {
    return this.ttlMap.get(namespace) || TTL.DEFAULT;
  }
  
  /**
   * Get TTL for specific data type
   */
  static getSpecificTTL(dataType: CacheDataType): number {
    switch (dataType) {
      // Market data - 5 minutes
      case CacheDataType.TOKEN_PRICE:
      case CacheDataType.TOKEN_VOLUME:
      case CacheDataType.TOKEN_LIQUIDITY:
      case CacheDataType.DEX_PAIRS:
        return TTL.MARKET;
      
      // Token metadata - 2 hours
      case CacheDataType.TOKEN_INFO:
      case CacheDataType.TOKEN_METADATA:
      case CacheDataType.TOKEN_HOLDERS:
      case CacheDataType.TOKEN_SUPPLY:
        return TTL.METADATA;
      
      // Contract verification - 24 hours
      case CacheDataType.CONTRACT_VERIFICATION:
      case CacheDataType.CONTRACT_ABI:
      case CacheDataType.CONTRACT_SOURCE:
      case CacheDataType.IS_CONTRACT:
      case CacheDataType.FACTORY_INFO:
      case CacheDataType.DEPLOYER_INFO:
        return TTL.VERIFICATION;
      
      // Transaction data - 1 hour
      case CacheDataType.TRANSACTION_DETAILS:
      case CacheDataType.TRANSACTION_HISTORY:
      case CacheDataType.TOKEN_TRANSFERS:
        return TTL.TRANSACTION;
      
      // Balance data - 30 seconds
      case CacheDataType.NATIVE_BALANCE:
      case CacheDataType.TOKEN_BALANCE:
      case CacheDataType.ALL_BALANCES:
        return TTL.BALANCE;
      
      // Swap data - 5 minutes
      case CacheDataType.SWAP_EVENT:
      case CacheDataType.ENRICHED_SWAP:
      case CacheDataType.SWAP_METRICS:
        return TTL.SWAP;
      
      // NFT data - 1 hour
      case CacheDataType.NFT_METADATA:
      case CacheDataType.NFT_OWNED:
      case CacheDataType.NFT_COLLECTION:
        return TTL.NFT;
      
      // ENS data - 24 hours
      case CacheDataType.ENS_RESOLVE:
      case CacheDataType.ENS_REVERSE:
        return TTL.ENS;
      
      // Price oracle - 1 minute
      case CacheDataType.PRICE_USD:
      case CacheDataType.PRICE_ETH:
      case CacheDataType.PRICE_CHANGE_24H:
        return TTL.PRICE;
      
      default:
        return TTL.DEFAULT;
    }
  }
  
  /**
   * Get human-readable TTL description
   */
  static getTTLDescription(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(seconds / 86400);
      return `${days} day${days > 1 ? 's' : ''}`;
    }
  }
  
  /**
   * Check if TTL is expired
   */
  static isExpired(createdAt: Date, ttl: number): boolean {
    const now = Date.now();
    const created = createdAt.getTime();
    const expiresAt = created + (ttl * 1000);
    
    return now > expiresAt;
  }
  
  /**
   * Calculate remaining TTL
   */
  static getRemainingTTL(createdAt: Date, ttl: number): number {
    const now = Date.now();
    const created = createdAt.getTime();
    const expiresAt = created + (ttl * 1000);
    
    const remaining = Math.floor((expiresAt - now) / 1000);
    
    return Math.max(0, remaining);
  }
  
  /**
   * Get adaptive TTL based on data freshness requirements
   */
  static getAdaptiveTTL(
    dataType: CacheDataType,
    options?: AdaptiveTTLOptions
  ): number {
    const baseTTL = this.getSpecificTTL(dataType);
    
    if (!options) {
      return baseTTL;
    }
    
    let adjustedTTL = baseTTL;
    
    // Adjust based on data volatility
    if (options.volatility === 'high') {
      adjustedTTL = Math.floor(baseTTL * 0.5); // 50% of base TTL
    } else if (options.volatility === 'low') {
      adjustedTTL = Math.floor(baseTTL * 2); // 200% of base TTL
    }
    
    // Adjust based on access frequency
    if (options.accessFrequency === 'high') {
      adjustedTTL = Math.floor(adjustedTTL * 1.5); // Extend for frequently accessed
    } else if (options.accessFrequency === 'low') {
      adjustedTTL = Math.floor(adjustedTTL * 0.75); // Reduce for rarely accessed
    }
    
    // Apply min/max bounds
    if (options.minTTL) {
      adjustedTTL = Math.max(adjustedTTL, options.minTTL);
    }
    if (options.maxTTL) {
      adjustedTTL = Math.min(adjustedTTL, options.maxTTL);
    }
    
    return adjustedTTL;
  }
}

/**
 * Specific cache data types for fine-grained TTL control
 */
export enum CacheDataType {
  // Market data
  TOKEN_PRICE = 'token_price',
  TOKEN_VOLUME = 'token_volume',
  TOKEN_LIQUIDITY = 'token_liquidity',
  DEX_PAIRS = 'dex_pairs',
  
  // Token metadata
  TOKEN_INFO = 'token_info',
  TOKEN_METADATA = 'token_metadata',
  TOKEN_HOLDERS = 'token_holders',
  TOKEN_SUPPLY = 'token_supply',
  
  // Contract verification
  CONTRACT_VERIFICATION = 'contract_verification',
  CONTRACT_ABI = 'contract_abi',
  CONTRACT_SOURCE = 'contract_source',
  IS_CONTRACT = 'is_contract',
  FACTORY_INFO = 'factory_info',
  DEPLOYER_INFO = 'deployer_info',
  
  // Transaction data
  TRANSACTION_DETAILS = 'transaction_details',
  TRANSACTION_HISTORY = 'transaction_history',
  TOKEN_TRANSFERS = 'token_transfers',
  
  // Balance data
  NATIVE_BALANCE = 'native_balance',
  TOKEN_BALANCE = 'token_balance',
  ALL_BALANCES = 'all_balances',
  
  // Swap data
  SWAP_EVENT = 'swap_event',
  ENRICHED_SWAP = 'enriched_swap',
  SWAP_METRICS = 'swap_metrics',
  
  // NFT data
  NFT_METADATA = 'nft_metadata',
  NFT_OWNED = 'nft_owned',
  NFT_COLLECTION = 'nft_collection',
  
  // ENS data
  ENS_RESOLVE = 'ens_resolve',
  ENS_REVERSE = 'ens_reverse',
  
  // Price oracle
  PRICE_USD = 'price_usd',
  PRICE_ETH = 'price_eth',
  PRICE_CHANGE_24H = 'price_change_24h'
}

/**
 * Options for adaptive TTL calculation
 */
export interface AdaptiveTTLOptions {
  volatility?: 'low' | 'medium' | 'high';
  accessFrequency?: 'low' | 'medium' | 'high';
  minTTL?: number;
  maxTTL?: number;
}

/**
 * TTL presets for common use cases
 */
export class TTLPresets {
  // Real-time trading data
  static readonly TRADING = {
    price: TTL.PRICE,
    volume: TTL.MARKET,
    liquidity: TTL.MARKET,
    orderbook: TTL.REALTIME
  };
  
  // Token analysis
  static readonly TOKEN_ANALYSIS = {
    metadata: TTL.METADATA,
    holders: TTL.METADATA,
    supply: TTL.METADATA,
    verification: TTL.VERIFICATION
  };
  
  // Wallet tracking
  static readonly WALLET_TRACKING = {
    balance: TTL.BALANCE,
    transactions: TTL.TRANSACTION,
    nfts: TTL.NFT,
    tokens: TTL.BALANCE
  };
  
  // DeFi monitoring
  static readonly DEFI_MONITORING = {
    swaps: TTL.SWAP,
    pools: TTL.MARKET,
    yields: TTL.MARKET,
    tvl: TTL.MARKET
  };
}

/**
 * Cache warming priorities based on TTL
 */
export class CacheWarmingPriority {
  /**
   * Get warming priority (lower number = higher priority)
   */
  static getPriority(dataType: CacheDataType): number {
    const ttl = CacheTTLConfig.getSpecificTTL(dataType);
    
    // Shorter TTL = higher priority for warming
    if (ttl <= TTL.REALTIME) return 1;
    if (ttl <= TTL.BALANCE) return 2;
    if (ttl <= TTL.PRICE) return 3;
    if (ttl <= TTL.MARKET) return 4;
    if (ttl <= TTL.TRANSACTION) return 5;
    if (ttl <= TTL.METADATA) return 6;
    
    return 7; // Lowest priority for long TTL items
  }
  
  /**
   * Check if data type should be warmed
   */
  static shouldWarm(dataType: CacheDataType): boolean {
    const priority = this.getPriority(dataType);
    
    // Only warm high priority items (1-4)
    return priority <= 4;
  }
  
  /**
   * Get warming interval based on TTL
   */
  static getWarmingInterval(dataType: CacheDataType): number {
    const ttl = CacheTTLConfig.getSpecificTTL(dataType);
    
    // Warm at 80% of TTL to ensure fresh data
    return Math.floor(ttl * 0.8);
  }
}