/**
 * Core TypeScript type definitions for API enrichment services
 * Combines ScanTrack patterns with modern TypeScript best practices
 */

// ============================================================================
// Core Domain Types
// ============================================================================

/**
 * Base token information following ERC20 standard
 */
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
}

/**
 * Market data with real-time pricing information
 */
export interface MarketData {
  price: string;
  priceChange24h: number;
  marketCap: string;
  volume24h: string;
  liquidity: string;
  fdv?: string; // Fully diluted valuation
  age?: number; // Token age in days
  holders?: number;
  lastUpdated: Date;
}

/**
 * Contract verification status from BaseScan
 */
export interface VerificationData {
  isVerified: boolean;
  contractName?: string;
  compilerVersion?: string;
  optimizationUsed?: boolean;
  runs?: number;
  licenseType?: string;
  proxyContract?: string;
  implementation?: string;
  sourceCode?: string;
  abi?: string;
}

/**
 * DEX-specific information
 */
export interface DexInfo {
  dexId: string;
  dexName: string;
  pairAddress: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  priceUsd: string;
  priceNative: string;
  txCount24h: number;
  makers24h: number;
  createdAt: Date;
}

/**
 * Social and documentation links
 */
export interface TokenLinks {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
  docs?: string;
  coingecko?: string;
  coinmarketcap?: string;
}

/**
 * Complete enriched token data
 */
export interface EnrichedTokenData {
  token: TokenInfo;
  market?: MarketData;
  verification?: VerificationData;
  dex?: DexInfo;
  links?: TokenLinks;
  metadata: {
    source: DataSource;
    cached: boolean;
    timestamp: Date;
    responseTime: number;
  };
}

// ============================================================================
// Service Configuration Types
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  requestsPerSecond: number;
}

/**
 * Cache configuration with component-specific TTLs
 */
export interface CacheConfig {
  ttl: {
    market: number;      // Market data TTL in seconds
    metadata: number;    // Token metadata TTL
    verification: number; // Verification status TTL
    links: number;       // Social links TTL
  };
  keyPrefix: string;
  enabled: boolean;
}

/**
 * API service configuration
 */
export interface ApiServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  rateLimiter: RateLimiterConfig;
  headers?: Record<string, string>;
}

/**
 * Complete enrichment service configuration
 */
export interface EnrichmentConfig {
  dexscreener: ApiServiceConfig;
  basescan: ApiServiceConfig;
  cache: CacheConfig;
  fallbackEnabled: boolean;
  monitoring: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * DexScreener API response structure
 */
export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: Array<{
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
      m5: { buys: number; sells: number };
      h1: { buys: number; sells: number };
      h6: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    priceChange: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info?: {
      imageUrl?: string;
      header?: string;
      openGraph?: string;
      description?: string;
      socials?: Array<{
        type: string;
        url: string;
      }>;
    };
  }>;
}

/**
 * BaseScan API response structure
 */
export interface BaseScanResponse<T = any> {
  status: '0' | '1';
  message: string;
  result: T;
}

/**
 * BaseScan source code result
 */
export interface BaseScanSourceCode {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
}

// ============================================================================
// Service Interface Definitions
// ============================================================================

/**
 * Base interface for all API services
 */
export interface IApiService<TConfig = ApiServiceConfig> {
  readonly config: TConfig;
  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getMetrics(): ServiceMetrics;
}

/**
 * Cache service interface
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  flush(): Promise<void>;
  getMultiple<T>(keys: string[]): Promise<(T | null)[]>;
  setMultiple<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean[]>;
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
  acquire(): Promise<void>;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  reset(): void;
  getStats(): RateLimiterStats;
}

/**
 * Token enrichment service interface
 */
export interface IEnrichmentService {
  enrichToken(address: string, options?: EnrichmentOptions): Promise<EnrichedTokenData>;
  enrichBatch(addresses: string[], options?: EnrichmentOptions): Promise<EnrichedTokenData[]>;
  warmCache(addresses: string[]): Promise<void>;
  clearCache(): Promise<void>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Data source enumeration
 */
export enum DataSource {
  CACHE = 'cache',
  DEXSCREENER = 'dexscreener',
  BASESCAN = 'basescan',
  FALLBACK = 'fallback',
  COMPOSITE = 'composite'
}

/**
 * Service metrics for monitoring
 */
export interface ServiceMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
}

/**
 * Rate limiter statistics
 */
export interface RateLimiterStats {
  requests: number;
  throttled: number;
  retries: number;
  failures: number;
  averageWaitTime: number;
}

/**
 * Enrichment options for fine-grained control
 */
export interface EnrichmentOptions {
  includeMarket?: boolean;
  includeVerification?: boolean;
  includeLinks?: boolean;
  forceFresh?: boolean;
  timeout?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for API services
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends ApiError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT', 429, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Cache error
 */
export class CacheError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'CACHE_ERROR', undefined, false, details);
    this.name = 'CacheError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends ApiError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR', 400, false);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for checking if a value is an EnrichedTokenData
 */
export function isEnrichedTokenData(value: any): value is EnrichedTokenData {
  return (
    value &&
    typeof value === 'object' &&
    'token' in value &&
    'metadata' in value &&
    value.metadata.source &&
    value.metadata.timestamp instanceof Date
  );
}

/**
 * Type guard for checking if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }
  
  // Network errors are typically retryable
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
  return retryableCodes.includes(error.code);
}

/**
 * Type guard for BaseScan success response
 */
export function isBaseScanSuccess<T>(response: BaseScanResponse<T>): response is BaseScanResponse<T> & { status: '1' } {
  return response.status === '1';
}

// ============================================================================
// Utility Types for Better DX
// ============================================================================

/**
 * Make all properties in T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Make specific keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Omit multiple keys with better type inference
 */
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Re-export Result types for error handling
export * from '../../types/result';