/**
 * Interface for cache management operations
 * Following the hybrid architecture pattern - stateful infrastructure as classes
 */
export interface ICacheManager {
  /**
   * Initialize the cache connection
   */
  initialize(): Promise<void>;

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Parsed value or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a value from cache
   * @param key Cache key
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a key exists in cache
   * @param key Cache key
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete multiple keys matching a pattern
   * @param pattern Pattern to match (e.g., "market:*")
   */
  deletePattern(pattern: string): Promise<number>;

  /**
   * Get multiple values at once
   * @param keys Array of cache keys
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values at once
   * @param items Array of key-value pairs with optional TTL
   */
  mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;

  /**
   * Check if the cache is connected
   */
  isConnected(): boolean;

  /**
   * Close the cache connection
   */
  close(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  memoryUsage?: number;
  keyCount?: number;
}

export interface CacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableOfflineQueue?: boolean;
}

export interface RequiredCacheConfig extends CacheConfig {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  keyPrefix: string;
  defaultTTL: number;
  maxRetries: number;
  retryDelay: number;
  enableOfflineQueue: boolean;
}