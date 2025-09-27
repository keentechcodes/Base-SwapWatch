import Redis, { Redis as RedisClient } from 'ioredis';
import { ICacheManager, CacheConfig, RequiredCacheConfig, CacheStats } from './ICacheManager';

/**
 * Redis-based cache manager implementation
 * Following hybrid architecture: stateful infrastructure as class
 */
export class CacheManager implements ICacheManager {
  private client: RedisClient | null = null;
  private config: RequiredCacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    connectionStatus: 'disconnected'
  };

  constructor(config: CacheConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'swapwatch:',
      defaultTTL: config.defaultTTL || 300,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      enableOfflineQueue: config.enableOfflineQueue !== false
    };
  }

  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    this.stats.connectionStatus = 'connecting';

    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        retryStrategy: (times: number) => {
          if (times > this.config.maxRetries) {
            return null;
          }
          return Math.min(times * this.config.retryDelay, 5000);
        },
        enableOfflineQueue: this.config.enableOfflineQueue,
        lazyConnect: true
      });

      this.client.on('connect', () => {
        this.stats.connectionStatus = 'connected';
        console.log('[CacheManager] Connected to Redis');
      });

      this.client.on('error', (error) => {
        this.stats.errors++;
        console.error('[CacheManager] Redis error:', error.message);
      });

      this.client.on('close', () => {
        this.stats.connectionStatus = 'disconnected';
        console.log('[CacheManager] Disconnected from Redis');
      });

      await this.client.connect();
      this.stats.connectionStatus = 'connected';
    } catch (error) {
      this.stats.connectionStatus = 'disconnected';
      this.stats.errors++;
      throw new Error(`Failed to initialize cache: ${(error as Error).message}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    this.ensureConnected();

    try {
      const value = await this.client!.get(key);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.stats.errors++;
      console.error(`[CacheManager] Error getting key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.ensureConnected();

    try {
      const serialized = JSON.stringify(value);
      const ttlSeconds = ttl || this.config.defaultTTL;

      if (ttlSeconds > 0) {
        await this.client!.setex(key, ttlSeconds, serialized);
      } else {
        await this.client!.set(key, serialized);
      }

      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      throw new Error(`Failed to set cache key ${key}: ${(error as Error).message}`);
    }
  }

  async delete(key: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const result = await this.client!.del(key);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      console.error(`[CacheManager] Error deleting key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      console.error(`[CacheManager] Error checking key ${key}:`, error);
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    this.ensureConnected();

    try {
      const fullPattern = `${this.config.keyPrefix}${pattern}`;
      const keys = await this.client!.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.client!.pipeline();
      keys.forEach(key => {
        const keyWithoutPrefix = key.replace(this.config.keyPrefix, '');
        pipeline.del(keyWithoutPrefix);
      });
      
      await pipeline.exec();
      this.stats.deletes += keys.length;
      
      return keys.length;
    } catch (error) {
      this.stats.errors++;
      throw new Error(`Failed to delete pattern ${pattern}: ${(error as Error).message}`);
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    this.ensureConnected();

    if (keys.length === 0) {
      return [];
    }

    try {
      const values = await this.client!.mget(keys);
      
      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        
        try {
          this.stats.hits++;
          return JSON.parse(value) as T;
        } catch {
          this.stats.errors++;
          return null;
        }
      });
    } catch (error) {
      this.stats.errors++;
      console.error('[CacheManager] Error in mget:', error);
      return keys.map(() => null);
    }
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    this.ensureConnected();

    if (items.length === 0) {
      return;
    }

    try {
      const pipeline = this.client!.pipeline();
      
      for (const item of items) {
        const serialized = JSON.stringify(item.value);
        const ttlSeconds = item.ttl || this.config.defaultTTL;
        
        if (ttlSeconds > 0) {
          pipeline.setex(item.key, ttlSeconds, serialized);
        } else {
          pipeline.set(item.key, serialized);
        }
      }
      
      await pipeline.exec();
      this.stats.sets += items.length;
    } catch (error) {
      this.stats.errors++;
      throw new Error(`Failed to set multiple cache keys: ${(error as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.stats.connectionStatus === 'connected';
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.stats.connectionStatus = 'disconnected';
    }
  }

  async getStats(): Promise<CacheStats> {
    const stats = { ...this.stats };

    if (this.isConnected()) {
      try {
        const info = await this.client!.info('memory');
        const memMatch = info.match(/used_memory:(\d+)/);
        if (memMatch) {
          stats.memoryUsage = parseInt(memMatch[1], 10);
        }

        const dbSize = await this.client!.dbsize();
        stats.keyCount = dbSize;
      } catch (error) {
        console.error('[CacheManager] Error getting Redis stats:', error);
      }
    }

    return stats;
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error('Cache is not connected. Call initialize() first.');
    }
  }
}

/**
 * Factory function to create cache manager with fallback
 * Returns null cache if Redis is not available
 */
export const createCacheManager = async (config?: CacheConfig): Promise<ICacheManager> => {
  const manager = new CacheManager(config);
  
  try {
    await manager.initialize();
    return manager;
  } catch (error) {
    console.warn('[CacheManager] Failed to connect to Redis, using null cache:', error);
    return createNullCache();
  }
};

/**
 * Null cache implementation for when Redis is unavailable
 */
const createNullCache = (): ICacheManager => ({
  initialize: async () => {},
  get: async () => null,
  set: async () => {},
  delete: async () => false,
  exists: async () => false,
  deletePattern: async () => 0,
  mget: async (keys) => keys.map(() => null),
  mset: async () => {},
  isConnected: () => false,
  close: async () => {},
  getStats: async () => ({
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    connectionStatus: 'disconnected' as const
  })
});