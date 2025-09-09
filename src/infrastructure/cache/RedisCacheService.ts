/**
 * Redis implementation of ICacheService
 * Following hybrid architecture: class for stateful Redis connection
 */

import { RedisClientType, createClient } from 'redis';
import { 
  ICacheService, 
  ICacheServiceConfig,
  CacheOptions,
  CacheStats,
  CacheEntry,
  ICacheEventListener,
  CacheEvent,
  IMonitoredCacheService,
  CacheMetrics
} from './ICacheService';
import { Result, success, failure } from '../../services/types';
import { ILogger } from '../logger/ILogger';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Redis cache service implementation
 * Stateful class managing Redis connection and cache operations
 */
export class RedisCacheService implements IMonitoredCacheService {
  private client: RedisClientType | null = null;
  private config: Required<ICacheServiceConfig>;
  private logger: ILogger;
  private stats: CacheStats;
  private eventListeners: Set<ICacheEventListener>;
  private metricsCollector: MetricsCollector;
  
  constructor(
    config: ICacheServiceConfig,
    logger: ILogger,
    redisUrl?: string
  ) {
    this.config = {
      defaultTTL: config.defaultTTL || 300,
      maxKeys: config.maxKeys || 10000,
      maxMemory: config.maxMemory || '100mb',
      evictionPolicy: config.evictionPolicy || 'lru',
      enableCompression: config.enableCompression || false,
      enableMetrics: config.enableMetrics || true,
      namespace: config.namespace || 'cache'
    };
    
    this.logger = logger;
    this.eventListeners = new Set();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0
    };
    
    this.metricsCollector = new MetricsCollector();
    
    if (redisUrl) {
      this.initializeClient(redisUrl);
    }
  }
  
  /**
   * Initialize Redis client
   */
  private async initializeClient(url: string): Promise<void> {
    try {
      this.client = createClient({ url });
      
      this.client.on('error', (err) => {
        this.logger.error('Redis client error', { error: err });
        this.emitEvent('error', undefined, { error: err });
      });
      
      this.client.on('ready', () => {
        this.logger.info('Redis client connected');
      });
      
      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis client', error as Error);
      throw error;
    }
  }
  
  /**
   * Ensure client is connected
   */
  private ensureClient(): RedisClientType {
    if (!this.client || !this.client.isReady) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }
  
  /**
   * Build namespaced key
   */
  private buildKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }
  
  /**
   * Compress value if enabled
   */
  private async compress<T>(value: T): Promise<string> {
    const json = JSON.stringify(value);
    
    if (this.config.enableCompression && json.length > 1024) {
      const compressed = await gzip(json);
      return compressed.toString('base64');
    }
    
    return json;
  }
  
  /**
   * Decompress value if needed
   */
  private async decompress<T>(value: string): Promise<T> {
    try {
      // Check if it's compressed (base64)
      if (this.config.enableCompression && /^[A-Za-z0-9+/]+=*$/.test(value)) {
        const buffer = Buffer.from(value, 'base64');
        const decompressed = await gunzip(buffer);
        return JSON.parse(decompressed.toString());
      }
      
      return JSON.parse(value);
    } catch {
      // Fallback to direct parse
      return JSON.parse(value);
    }
  }
  
  /**
   * Emit cache event
   */
  private emitEvent(event: CacheEvent, key?: string, metadata?: any): void {
    this.eventListeners.forEach(listener => {
      listener.onEvent(event, key, metadata);
    });
  }
  
  /**
   * Update statistics
   */
  private updateStats(event: CacheEvent): void {
    switch (event) {
      case 'hit':
        this.stats.hits++;
        break;
      case 'miss':
        this.stats.misses++;
        break;
      case 'set':
        this.stats.sets++;
        break;
      case 'delete':
        this.stats.deletes++;
        break;
      case 'eviction':
        this.stats.evictions++;
        break;
    }
    
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
  
  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<Result<T | null>> {
    const startTime = Date.now();
    
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      const value = await client.get(fullKey);
      
      if (value === null) {
        this.updateStats('miss');
        this.emitEvent('miss', key);
        this.metricsCollector.recordMiss(key);
        return success(null);
      }
      
      const parsed = await this.decompress<T>(value);
      
      // Update hit count
      await client.hIncrBy(`${fullKey}:meta`, 'hits', 1);
      
      this.updateStats('hit');
      this.emitEvent('hit', key);
      this.metricsCollector.recordHit(key, Date.now() - startTime);
      
      return success(parsed);
    } catch (error) {
      this.logger.error('Cache get error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Get multiple values
   */
  async getMany<T>(keys: string[]): Promise<Result<Map<string, T>>> {
    try {
      const client = this.ensureClient();
      const fullKeys = keys.map(k => this.buildKey(k));
      const values = await client.mGet(fullKeys);
      
      const result = new Map<string, T>();
      
      for (let i = 0; i < keys.length; i++) {
        if (values[i] !== null) {
          const parsed = await this.decompress<T>(values[i]!);
          result.set(keys[i], parsed);
          this.updateStats('hit');
        } else {
          this.updateStats('miss');
        }
      }
      
      return success(result);
    } catch (error) {
      this.logger.error('Cache getMany error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Set cached value
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      const compressed = await this.compress(value);
      const ttl = options?.ttl || this.config.defaultTTL;
      
      // Set value with TTL
      await client.setEx(fullKey, ttl, compressed);
      
      // Store metadata
      const metadata = {
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        hits: 0,
        size: compressed.length
      };
      
      await client.hSet(`${fullKey}:meta`, metadata as any);
      
      // Store tags if provided
      if (options?.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          await client.sAdd(`${this.config.namespace}:tag:${tag}`, fullKey);
        }
      }
      
      this.updateStats('set');
      this.emitEvent('set', key);
      this.metricsCollector.recordSet(key, compressed.length);
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache set error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Set multiple values
   */
  async setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const ttl = options?.ttl || this.config.defaultTTL;
      
      const pipeline = client.multi();
      
      for (const [key, value] of entries) {
        const fullKey = this.buildKey(key);
        const compressed = await this.compress(value);
        
        pipeline.setEx(fullKey, ttl, compressed);
        this.updateStats('set');
      }
      
      await pipeline.exec();
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache setMany error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Delete cached value
   */
  async delete(key: string): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      
      await client.del([fullKey, `${fullKey}:meta`]);
      
      this.updateStats('delete');
      this.emitEvent('delete', key);
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache delete error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Delete multiple values
   */
  async deleteMany(keys: string[]): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const fullKeys = keys.flatMap(k => {
        const fullKey = this.buildKey(k);
        return [fullKey, `${fullKey}:meta`];
      });
      
      await client.del(fullKeys);
      
      keys.forEach(() => this.updateStats('delete'));
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache deleteMany error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Delete by pattern
   */
  async deleteByPattern(pattern: string): Promise<Result<number>> {
    try {
      const client = this.ensureClient();
      const fullPattern = this.buildKey(pattern);
      const keys = await client.keys(fullPattern);
      
      if (keys.length > 0) {
        await client.del(keys);
      }
      
      return success(keys.length);
    } catch (error) {
      this.logger.error('Cache deleteByPattern error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Delete by tags
   */
  async deleteByTags(tags: string[]): Promise<Result<number>> {
    try {
      const client = this.ensureClient();
      let totalDeleted = 0;
      
      for (const tag of tags) {
        const tagKey = `${this.config.namespace}:tag:${tag}`;
        const keys = await client.sMembers(tagKey);
        
        if (keys.length > 0) {
          await client.del(keys);
          await client.del(tagKey);
          totalDeleted += keys.length;
        }
      }
      
      return success(totalDeleted);
    } catch (error) {
      this.logger.error('Cache deleteByTags error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Check if key exists
   */
  async exists(key: string): Promise<Result<boolean>> {
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      const exists = await client.exists(fullKey);
      
      return success(exists === 1);
    } catch (error) {
      this.logger.error('Cache exists error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<Result<number>> {
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      const ttl = await client.ttl(fullKey);
      
      return success(ttl);
    } catch (error) {
      this.logger.error('Cache ttl error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Touch key to refresh TTL
   */
  async touch(key: string, ttl: number): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      
      await client.expire(fullKey, ttl);
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache touch error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Get cache entry with metadata
   */
  async getEntry<T>(key: string): Promise<Result<CacheEntry<T> | null>> {
    try {
      const valueResult = await this.get<T>(key);
      
      if (!valueResult.success || !valueResult.data) {
        return success(null);
      }
      
      const client = this.ensureClient();
      const fullKey = this.buildKey(key);
      const metadata = await client.hGetAll(`${fullKey}:meta`);
      
      const entry: CacheEntry<T> = {
        value: valueResult.data,
        key,
        createdAt: new Date(parseInt(metadata.createdAt || '0')),
        expiresAt: metadata.expiresAt ? new Date(parseInt(metadata.expiresAt)) : undefined,
        hits: parseInt(metadata.hits || '0')
      };
      
      return success(entry);
    } catch (error) {
      this.logger.error('Cache getEntry error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<Result<string[]>> {
    try {
      const client = this.ensureClient();
      const fullPattern = this.buildKey(pattern);
      const keys = await client.keys(fullPattern);
      
      // Remove namespace prefix
      const cleanKeys = keys.map(k => k.replace(`${this.config.namespace}:`, ''));
      
      return success(cleanKeys);
    } catch (error) {
      this.logger.error('Cache keys error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Flush all cache entries
   */
  async flush(): Promise<Result<void>> {
    try {
      const client = this.ensureClient();
      const pattern = `${this.config.namespace}:*`;
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        await client.del(keys);
      }
      
      this.emitEvent('flush');
      
      return success(undefined);
    } catch (error) {
      this.logger.error('Cache flush error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<Result<CacheStats>> {
    try {
      const client = this.ensureClient();
      const info = await client.info('memory');
      
      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : undefined;
      
      // Count keys
      const keys = await client.keys(`${this.config.namespace}:*`);
      const keyCount = keys.filter(k => !k.endsWith(':meta')).length;
      
      return success({
        ...this.stats,
        memoryUsage,
        keyCount
      });
    } catch (error) {
      this.logger.error('Cache getStats error', error as Error);
      return failure(error as Error);
    }
  }
  
  /**
   * Warm cache with preloaded data
   */
  async warm<T>(entries: Map<string, T>, options?: CacheOptions): Promise<Result<void>> {
    return this.setMany(entries, options);
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<Result<number>> {
    return this.deleteByPattern(pattern);
  }
  
  /**
   * Wrap function with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<Result<T>> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    
    if (cached.success && cached.data !== null) {
      return success(cached.data);
    }
    
    // Execute function
    try {
      const result = await fn();
      
      // Cache the result
      await this.set(key, result, options);
      
      return success(result);
    } catch (error) {
      return failure(error as Error);
    }
  }
  
  /**
   * Get or set with factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<Result<T>> {
    return this.wrap(key, factory, options);
  }
  
  /**
   * Add event listener
   */
  addEventListener(listener: ICacheEventListener): void {
    this.eventListeners.add(listener);
  }
  
  /**
   * Remove event listener
   */
  removeEventListener(listener: ICacheEventListener): void {
    this.eventListeners.delete(listener);
  }
  
  /**
   * Get detailed metrics
   */
  async getMetrics(): Promise<Result<CacheMetrics>> {
    const statsResult = await this.getStats();
    
    if (!statsResult.success) {
      return failure(statsResult.error);
    }
    
    const metrics: CacheMetrics = {
      stats: statsResult.data,
      topKeys: this.metricsCollector.getTopKeys(),
      slowestKeys: this.metricsCollector.getSlowestKeys(),
      largestKeys: this.metricsCollector.getLargestKeys(),
      errorRate: this.metricsCollector.getErrorRate(),
      averageLatency: this.metricsCollector.getAverageLatency()
    };
    
    return success(metrics);
  }
  
  /**
   * Disconnect client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

/**
 * Metrics collector helper class
 */
class MetricsCollector {
  private keyMetrics: Map<string, KeyMetric> = new Map();
  private errors = 0;
  private totalRequests = 0;
  
  recordHit(key: string, latency: number): void {
    this.updateKeyMetric(key, { hits: 1, latency });
    this.totalRequests++;
  }
  
  recordMiss(key: string): void {
    this.updateKeyMetric(key, { misses: 1 });
    this.totalRequests++;
  }
  
  recordSet(key: string, size: number): void {
    this.updateKeyMetric(key, { size });
  }
  
  recordError(): void {
    this.errors++;
  }
  
  private updateKeyMetric(key: string, update: Partial<KeyMetric>): void {
    const existing = this.keyMetrics.get(key) || {
      hits: 0,
      misses: 0,
      latency: 0,
      size: 0
    };
    
    this.keyMetrics.set(key, {
      hits: existing.hits + (update.hits || 0),
      misses: existing.misses + (update.misses || 0),
      latency: update.latency || existing.latency,
      size: update.size || existing.size
    });
  }
  
  getTopKeys(limit = 10): Array<{ key: string; hits: number }> {
    return Array.from(this.keyMetrics.entries())
      .map(([key, metric]) => ({ key, hits: metric.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }
  
  getSlowestKeys(limit = 10): Array<{ key: string; latency: number }> {
    return Array.from(this.keyMetrics.entries())
      .map(([key, metric]) => ({ key, latency: metric.latency }))
      .sort((a, b) => b.latency - a.latency)
      .slice(0, limit);
  }
  
  getLargestKeys(limit = 10): Array<{ key: string; size: number }> {
    return Array.from(this.keyMetrics.entries())
      .map(([key, metric]) => ({ key, size: metric.size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }
  
  getErrorRate(): number {
    return this.totalRequests > 0 ? this.errors / this.totalRequests : 0;
  }
  
  getAverageLatency(): number {
    const latencies = Array.from(this.keyMetrics.values())
      .map(m => m.latency)
      .filter(l => l > 0);
    
    if (latencies.length === 0) return 0;
    
    return latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  }
}

interface KeyMetric {
  hits: number;
  misses: number;
  latency: number;
  size: number;
}