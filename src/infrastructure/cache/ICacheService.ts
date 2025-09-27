/**
 * Type-safe cache service interface
 * Following TypeScript coding standards: explicit types, no any
 */

import { Result } from '../../services/types';

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  value: T;
  key: string;
  createdAt: Date;
  expiresAt?: Date;
  hits: number;
}

/**
 * Cache options for set operations
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Tags for grouping cache entries
  compress?: boolean; // Enable compression for large objects
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  memoryUsage?: number;
  keyCount?: number;
}

/**
 * Cache key pattern interface
 */
export interface CacheKeyPattern {
  prefix: string;
  params: Record<string, string | number>;
  version?: number;
}

/**
 * Type-safe cache service interface with generics
 */
export interface ICacheService {
  /**
   * Get a cached value with type safety
   */
  get<T>(key: string): Promise<Result<T | null>>;
  
  /**
   * Get multiple cached values
   */
  getMany<T>(keys: string[]): Promise<Result<Map<string, T>>>;
  
  /**
   * Set a cached value with options
   */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<Result<void>>;
  
  /**
   * Set multiple cached values
   */
  setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<Result<void>>;
  
  /**
   * Delete a cached value
   */
  delete(key: string): Promise<Result<void>>;
  
  /**
   * Delete multiple cached values
   */
  deleteMany(keys: string[]): Promise<Result<void>>;
  
  /**
   * Delete cached values by pattern
   */
  deleteByPattern(pattern: string): Promise<Result<number>>;
  
  /**
   * Delete cached values by tags
   */
  deleteByTags(tags: string[]): Promise<Result<number>>;
  
  /**
   * Check if a key exists
   */
  exists(key: string): Promise<Result<boolean>>;
  
  /**
   * Get remaining TTL for a key
   */
  ttl(key: string): Promise<Result<number>>;
  
  /**
   * Refresh TTL for a key
   */
  touch(key: string, ttl: number): Promise<Result<void>>;
  
  /**
   * Get cache entry with metadata
   */
  getEntry<T>(key: string): Promise<Result<CacheEntry<T> | null>>;
  
  /**
   * Get all keys matching a pattern
   */
  keys(pattern: string): Promise<Result<string[]>>;
  
  /**
   * Clear all cache entries
   */
  flush(): Promise<Result<void>>;
  
  /**
   * Get cache statistics
   */
  getStats(): Promise<Result<CacheStats>>;
  
  /**
   * Warm the cache with preloaded data
   */
  warm<T>(entries: Map<string, T>, options?: CacheOptions): Promise<Result<void>>;
  
  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string): Promise<Result<number>>;
  
  /**
   * Execute a function with caching
   */
  wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<Result<T>>;
  
  /**
   * Execute a function with cache-aside pattern
   */
  getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<Result<T>>;
}

/**
 * Cache service configuration
 */
export interface ICacheServiceConfig {
  defaultTTL?: number;
  maxKeys?: number;
  maxMemory?: string; // e.g., '100mb'
  evictionPolicy?: 'lru' | 'lfu' | 'ttl';
  enableCompression?: boolean;
  enableMetrics?: boolean;
  namespace?: string;
}

/**
 * Cache event types for monitoring
 */
export type CacheEvent = 
  | 'hit'
  | 'miss'
  | 'set'
  | 'delete'
  | 'eviction'
  | 'error'
  | 'flush';

/**
 * Cache event listener
 */
export interface ICacheEventListener {
  onEvent(event: CacheEvent, key?: string, metadata?: any): void;
}

/**
 * Extended cache service with monitoring
 */
export interface IMonitoredCacheService extends ICacheService {
  /**
   * Add event listener
   */
  addEventListener(listener: ICacheEventListener): void;
  
  /**
   * Remove event listener
   */
  removeEventListener(listener: ICacheEventListener): void;
  
  /**
   * Get detailed metrics
   */
  getMetrics(): Promise<Result<CacheMetrics>>;
}

/**
 * Detailed cache metrics
 */
export interface CacheMetrics {
  stats: CacheStats;
  topKeys: Array<{ key: string; hits: number }>;
  slowestKeys: Array<{ key: string; latency: number }>;
  largestKeys: Array<{ key: string; size: number }>;
  errorRate: number;
  averageLatency: number;
}