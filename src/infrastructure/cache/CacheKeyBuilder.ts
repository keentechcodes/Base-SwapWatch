/**
 * Type-safe cache key builders
 * Following TypeScript coding standards: explicit types, no any
 */

/**
 * Cache key namespace types
 */
export enum CacheNamespace {
  MARKET = 'market',
  TOKEN = 'token',
  VERIFICATION = 'verification',
  TRANSACTION = 'tx',
  BALANCE = 'balance',
  NFT = 'nft',
  ENS = 'ens',
  SWAP = 'swap',
  PRICE = 'price',
  METADATA = 'metadata',
  WALLET = 'wallet'
}

/**
 * Cache key builder configuration
 */
export interface CacheKeyConfig {
  namespace: CacheNamespace;
  version?: number;
  chain?: string;
  separator?: string;
}

/**
 * Type-safe cache key builder
 */
export class CacheKeyBuilder {
  private readonly config: Required<CacheKeyConfig>;
  
  constructor(config: CacheKeyConfig) {
    this.config = {
      namespace: config.namespace,
      version: config.version || 1,
      chain: config.chain || 'base',
      separator: config.separator || ':'
    };
  }
  
  /**
   * Build a cache key with parameters
   */
  build(...params: (string | number)[]): string {
    const parts = [
      this.config.namespace,
      `v${this.config.version}`,
      this.config.chain,
      ...params.map(p => String(p).toLowerCase())
    ];
    
    return parts.join(this.config.separator);
  }
  
  /**
   * Build a pattern for wildcard matching
   */
  pattern(...params: (string | number | '*')[]): string {
    const parts = [
      this.config.namespace,
      `v${this.config.version}`,
      this.config.chain,
      ...params.map(p => String(p).toLowerCase())
    ];
    
    return parts.join(this.config.separator);
  }
  
  /**
   * Parse a cache key back to components
   */
  parse(key: string): CacheKeyComponents | null {
    const parts = key.split(this.config.separator);
    
    if (parts.length < 3) {
      return null;
    }
    
    const [namespace, version, chain, ...params] = parts;
    
    return {
      namespace: namespace as CacheNamespace,
      version: parseInt(version.replace('v', '')) || 1,
      chain,
      params
    };
  }
}

/**
 * Parsed cache key components
 */
export interface CacheKeyComponents {
  namespace: CacheNamespace;
  version: number;
  chain: string;
  params: string[];
}

/**
 * Pre-configured key builders for each namespace
 */
export class CacheKeys {
  private static readonly DEFAULT_CHAIN = 'base';
  
  /**
   * Market data keys (5 minute TTL)
   */
  static readonly market = {
    price: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.MARKET, chain })
        .build('price', address),
    
    volume: (address: string, period: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.MARKET, chain })
        .build('volume', address, period),
    
    liquidity: (address: string, dex: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.MARKET, chain })
        .build('liquidity', address, dex),
    
    pairs: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.MARKET, chain })
        .build('pairs', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.MARKET, chain })
        .pattern('*')
  };
  
  /**
   * Token metadata keys (2 hour TTL)
   */
  static readonly token = {
    info: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TOKEN, chain })
        .build('info', address),
    
    metadata: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.METADATA, chain })
        .build(address),
    
    holders: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TOKEN, chain })
        .build('holders', address),
    
    supply: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TOKEN, chain })
        .build('supply', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TOKEN, chain })
        .pattern('*')
  };
  
  /**
   * Contract verification keys (24 hour TTL)
   */
  static readonly verification = {
    status: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.VERIFICATION, chain })
        .build('status', address),
    
    abi: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.VERIFICATION, chain })
        .build('abi', address),
    
    source: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.VERIFICATION, chain })
        .build('source', address),
    
    isContract: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.VERIFICATION, chain })
        .build('iscontract', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.VERIFICATION, chain })
        .pattern('*')
  };
  
  /**
   * Transaction keys (1 hour TTL)
   */
  static readonly transaction = {
    details: (hash: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TRANSACTION, chain })
        .build(hash),
    
    history: (address: string, page: number, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TRANSACTION, chain })
        .build('history', address, page),
    
    transfers: (address: string, token: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TRANSACTION, chain })
        .build('transfers', address, token),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.TRANSACTION, chain })
        .pattern('*')
  };
  
  /**
   * Balance keys (30 second TTL)
   */
  static readonly balance = {
    native: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.BALANCE, chain })
        .build('native', address),
    
    token: (address: string, token: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.BALANCE, chain })
        .build('token', address, token),
    
    all: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.BALANCE, chain })
        .build('all', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.BALANCE, chain })
        .pattern('*')
  };
  
  /**
   * Swap event keys (5 minute TTL)
   */
  static readonly swap = {
    event: (txHash: string, logIndex: number, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.SWAP, chain })
        .build(txHash, logIndex),
    
    enriched: (txHash: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.SWAP, chain })
        .build('enriched', txHash),
    
    metrics: (txHash: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.SWAP, chain })
        .build('metrics', txHash),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.SWAP, chain })
        .pattern('*')
  };
  
  /**
   * NFT keys (1 hour TTL)
   */
  static readonly nft = {
    metadata: (contract: string, tokenId: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.NFT, chain })
        .build('metadata', contract, tokenId),
    
    owned: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.NFT, chain })
        .build('owned', address),
    
    collection: (contract: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.NFT, chain })
        .build('collection', contract),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.NFT, chain })
        .pattern('*')
  };
  
  /**
   * ENS keys (24 hour TTL)
   */
  static readonly ens = {
    resolve: (domain: string) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.ENS, chain: 'mainnet' })
        .build('resolve', domain),
    
    reverse: (address: string) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.ENS, chain: 'mainnet' })
        .build('reverse', address),
    
    pattern: () =>
      new CacheKeyBuilder({ namespace: CacheNamespace.ENS, chain: 'mainnet' })
        .pattern('*')
  };
  
  /**
   * Price oracle keys (1 minute TTL)
   */
  static readonly price = {
    usd: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.PRICE, chain })
        .build('usd', address),
    
    eth: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.PRICE, chain })
        .build('eth', address),
    
    change24h: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.PRICE, chain })
        .build('change24h', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.PRICE, chain })
        .pattern('*')
  };
  
  /**
   * Wallet data keys (5 minute TTL)
   */
  static readonly wallet = {
    pnl: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.WALLET, chain })
        .build('pnl', address),
    
    portfolio: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.WALLET, chain })
        .build('portfolio', address),
    
    history: (address: string, chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.WALLET, chain })
        .build('history', address),
    
    pattern: (chain = this.DEFAULT_CHAIN) =>
      new CacheKeyBuilder({ namespace: CacheNamespace.WALLET, chain })
        .pattern('*')
  };
  
  /**
   * Build custom key
   */
  static custom(namespace: CacheNamespace, ...params: (string | number)[]): string {
    return new CacheKeyBuilder({ namespace }).build(...params);
  }
  
  /**
   * Build custom pattern
   */
  static customPattern(namespace: CacheNamespace, ...params: (string | number | '*')[]): string {
    return new CacheKeyBuilder({ namespace }).pattern(...params);
  }
}

/**
 * Cache key validator
 */
export class CacheKeyValidator {
  /**
   * Check if key is valid
   */
  static isValid(key: string): boolean {
    const parts = key.split(':');
    
    // Minimum: namespace:version:chain
    if (parts.length < 3) {
      return false;
    }
    
    // Check namespace is valid
    const namespace = parts[0];
    if (!Object.values(CacheNamespace).includes(namespace as CacheNamespace)) {
      return false;
    }
    
    // Check version format
    const version = parts[1];
    if (!/^v\d+$/.test(version)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Extract namespace from key
   */
  static getNamespace(key: string): CacheNamespace | null {
    const parts = key.split(':');
    
    if (parts.length < 1) {
      return null;
    }
    
    const namespace = parts[0];
    
    if (Object.values(CacheNamespace).includes(namespace as CacheNamespace)) {
      return namespace as CacheNamespace;
    }
    
    return null;
  }
  
  /**
   * Check if key matches pattern
   */
  static matchesPattern(key: string, pattern: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .split(':')
      .map(part => part === '*' ? '[^:]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join(':');
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    return regex.test(key);
  }
}