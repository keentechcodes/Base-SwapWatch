/**
 * Cache behavior tests
 * Testing cache service, TTL, warming, and invalidation
 */

import { RedisCacheService } from '../RedisCacheService';
import { CacheKeyBuilder, CacheKeys, CacheNamespace } from '../CacheKeyBuilder';
import { CacheTTLConfig, CacheDataType, TTL } from '../CacheTTLConfig';
import { CacheWarmer } from '../CacheWarmer';
import { CacheInvalidator, InvalidationStrategy } from '../CacheInvalidator';
import { ILogger } from '../../logger/ILogger';

// Mock logger
const mockLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    isReady: true,
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    mGet: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    expire: jest.fn(),
    keys: jest.fn(),
    hSet: jest.fn(),
    hGet: jest.fn(),
    hGetAll: jest.fn(),
    hIncrBy: jest.fn(),
    sAdd: jest.fn(),
    sMembers: jest.fn(),
    multi: jest.fn(() => ({
      setEx: jest.fn().mockReturnThis(),
      exec: jest.fn()
    })),
    info: jest.fn(),
    on: jest.fn()
  }))
}));

describe('Cache Service Tests', () => {
  let cacheService: RedisCacheService;
  
  beforeEach(() => {
    cacheService = new RedisCacheService(
      {
        defaultTTL: 300,
        enableCompression: false,
        enableMetrics: true,
        namespace: 'test'
      },
      mockLogger,
      'redis://localhost:6379'
    );
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Basic Operations', () => {
    test('should set and get value', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      
      const setResult = await cacheService.set(key, value);
      expect(setResult.success).toBe(true);
      
      const getResult = await cacheService.get(key);
      expect(getResult.success).toBe(true);
      expect(getResult.data).toEqual(value);
    });
    
    test('should handle cache miss', async () => {
      const result = await cacheService.get('nonexistent');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
    
    test('should delete value', async () => {
      const key = 'test:delete';
      await cacheService.set(key, 'value');
      
      const deleteResult = await cacheService.delete(key);
      expect(deleteResult.success).toBe(true);
      
      const getResult = await cacheService.get(key);
      expect(getResult.data).toBeNull();
    });
    
    test('should set multiple values', async () => {
      const entries = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ]);
      
      const result = await cacheService.setMany(entries);
      expect(result.success).toBe(true);
    });
    
    test('should get multiple values', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const result = await cacheService.getMany<string>(keys);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Map);
    });
  });
  
  describe('TTL Management', () => {
    test('should set value with TTL', async () => {
      const key = 'ttl:test';
      const value = 'data';
      const ttl = 60;
      
      const result = await cacheService.set(key, value, { ttl });
      expect(result.success).toBe(true);
      
      const ttlResult = await cacheService.ttl(key);
      expect(ttlResult.success).toBe(true);
    });
    
    test('should refresh TTL', async () => {
      const key = 'ttl:refresh';
      await cacheService.set(key, 'value', { ttl: 60 });
      
      const result = await cacheService.touch(key, 120);
      expect(result.success).toBe(true);
    });
  });
  
  describe('Pattern Operations', () => {
    test('should delete by pattern', async () => {
      await cacheService.set('pattern:1', 'value1');
      await cacheService.set('pattern:2', 'value2');
      await cacheService.set('other:1', 'value3');
      
      const result = await cacheService.deleteByPattern('pattern:*');
      expect(result.success).toBe(true);
      expect(result.data).toBe(2);
    });
    
    test('should get keys by pattern', async () => {
      const result = await cacheService.keys('test:*');
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
  
  describe('Cache Wrapping', () => {
    test('should wrap function with caching', async () => {
      const fetcher = jest.fn().mockResolvedValue({ data: 'fetched' });
      
      const result = await cacheService.wrap('wrap:test', fetcher, { ttl: 60 });
      expect(result.success).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const cachedResult = await cacheService.wrap('wrap:test', fetcher, { ttl: 60 });
      expect(cachedResult.success).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1); // Not called again
    });
    
    test('should use getOrSet pattern', async () => {
      const factory = jest.fn().mockResolvedValue({ created: true });
      
      const result = await cacheService.getOrSet('factory:test', factory);
      expect(result.success).toBe(true);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Cache Key Builder Tests', () => {
  test('should build market data keys', () => {
    const address = '0x123';
    
    expect(CacheKeys.market.price(address))
      .toBe('market:v1:base:price:0x123');
    
    expect(CacheKeys.market.volume(address, '24h'))
      .toBe('market:v1:base:volume:0x123:24h');
    
    expect(CacheKeys.market.liquidity(address, 'uniswap'))
      .toBe('market:v1:base:liquidity:0x123:uniswap');
  });
  
  test('should build token metadata keys', () => {
    const address = '0x456';
    
    expect(CacheKeys.token.info(address))
      .toBe('token:v1:base:info:0x456');
    
    expect(CacheKeys.token.metadata(address))
      .toBe('metadata:v1:base:0x456');
  });
  
  test('should build verification keys', () => {
    const address = '0x789';
    
    expect(CacheKeys.verification.status(address))
      .toBe('verification:v1:base:status:0x789');
    
    expect(CacheKeys.verification.abi(address))
      .toBe('verification:v1:base:abi:0x789');
  });
  
  test('should build patterns', () => {
    expect(CacheKeys.market.pattern())
      .toBe('market:v1:base:*');
    
    expect(CacheKeys.token.pattern('ethereum'))
      .toBe('token:v1:ethereum:*');
  });
  
  test('should parse cache keys', () => {
    const builder = new CacheKeyBuilder({ 
      namespace: CacheNamespace.MARKET 
    });
    
    const key = 'market:v1:base:price:0xabc';
    const parsed = builder.parse(key);
    
    expect(parsed).toEqual({
      namespace: CacheNamespace.MARKET,
      version: 1,
      chain: 'base',
      params: ['price', '0xabc']
    });
  });
});

describe('Cache TTL Configuration Tests', () => {
  test('should get correct TTL for namespace', () => {
    expect(CacheTTLConfig.getTTL(CacheNamespace.MARKET)).toBe(TTL.MARKET);
    expect(CacheTTLConfig.getTTL(CacheNamespace.TOKEN)).toBe(TTL.METADATA);
    expect(CacheTTLConfig.getTTL(CacheNamespace.VERIFICATION)).toBe(TTL.VERIFICATION);
  });
  
  test('should get specific TTL for data type', () => {
    expect(CacheTTLConfig.getSpecificTTL(CacheDataType.TOKEN_PRICE))
      .toBe(TTL.MARKET);
    
    expect(CacheTTLConfig.getSpecificTTL(CacheDataType.CONTRACT_VERIFICATION))
      .toBe(TTL.VERIFICATION);
    
    expect(CacheTTLConfig.getSpecificTTL(CacheDataType.NATIVE_BALANCE))
      .toBe(TTL.BALANCE);
  });
  
  test('should calculate adaptive TTL', () => {
    const baseTTL = CacheTTLConfig.getSpecificTTL(CacheDataType.TOKEN_PRICE);
    
    // High volatility reduces TTL
    const volatileTTL = CacheTTLConfig.getAdaptiveTTL(
      CacheDataType.TOKEN_PRICE,
      { volatility: 'high' }
    );
    expect(volatileTTL).toBeLessThan(baseTTL);
    
    // Low volatility increases TTL
    const stableTTL = CacheTTLConfig.getAdaptiveTTL(
      CacheDataType.TOKEN_PRICE,
      { volatility: 'low' }
    );
    expect(stableTTL).toBeGreaterThan(baseTTL);
  });
  
  test('should check if TTL is expired', () => {
    const createdAt = new Date(Date.now() - 10000); // 10 seconds ago
    
    expect(CacheTTLConfig.isExpired(createdAt, 5)).toBe(true);
    expect(CacheTTLConfig.isExpired(createdAt, 20)).toBe(false);
  });
  
  test('should calculate remaining TTL', () => {
    const createdAt = new Date(Date.now() - 10000); // 10 seconds ago
    
    expect(CacheTTLConfig.getRemainingTTL(createdAt, 20)).toBe(10);
    expect(CacheTTLConfig.getRemainingTTL(createdAt, 5)).toBe(0);
  });
});

describe('Cache Warmer Tests', () => {
  let cacheWarmer: CacheWarmer;
  let mockCache: any;
  
  beforeEach(() => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue({ success: true }),
      ttl: jest.fn().mockResolvedValue({ success: true, data: 10 })
    };
    
    cacheWarmer = new CacheWarmer(
      mockCache,
      mockLogger,
      {
        enabled: true,
        intervalMs: 1000,
        batchSize: 5,
        priorityThreshold: 4,
        frequentTokens: ['0x123', '0x456']
      }
    );
  });
  
  test('should register warming sources', () => {
    cacheWarmer.registerSource({
      key: 'test:warm',
      dataType: CacheDataType.TOKEN_PRICE,
      fetcher: async () => ({ price: 100 }),
      priority: 1
    });
    
    const status = cacheWarmer.getStatus();
    expect(status.totalSources).toBeGreaterThan(0);
  });
  
  test('should force warm specific keys', async () => {
    cacheWarmer.registerSource({
      key: 'force:warm',
      dataType: CacheDataType.TOKEN_PRICE,
      fetcher: async () => ({ price: 200 })
    });
    
    const result = await cacheWarmer.forceWarm(['force:warm']);
    expect(result.success).toBe(true);
    expect(mockCache.set).toHaveBeenCalled();
  });
  
  test('should handle warming failures gracefully', async () => {
    cacheWarmer.registerSource({
      key: 'fail:warm',
      dataType: CacheDataType.TOKEN_PRICE,
      fetcher: async () => {
        throw new Error('Fetch failed');
      }
    });
    
    const result = await cacheWarmer.forceWarm(['fail:warm']);
    // Should not throw, but log error
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe('Cache Invalidator Tests', () => {
  let cacheInvalidator: CacheInvalidator;
  let mockCache: any;
  
  beforeEach(() => {
    mockCache = {
      invalidate: jest.fn().mockResolvedValue({ success: true, data: 5 }),
      keys: jest.fn().mockResolvedValue({ success: true, data: ['key1', 'key2'] }),
      touch: jest.fn().mockResolvedValue({ success: true })
    };
    
    cacheInvalidator = new CacheInvalidator(mockCache, mockLogger);
  });
  
  test('should add and trigger invalidation rules', async () => {
    cacheInvalidator.addRule({
      trigger: 'test:event',
      patterns: ['test:*'],
      strategy: InvalidationStrategy.IMMEDIATE
    });
    
    const result = await cacheInvalidator.trigger('test:event');
    expect(result.success).toBe(true);
    expect(mockCache.invalidate).toHaveBeenCalledWith('test:*');
  });
  
  test('should handle lazy invalidation', async () => {
    cacheInvalidator.addRule({
      trigger: 'lazy:event',
      patterns: ['lazy:*'],
      strategy: InvalidationStrategy.LAZY
    });
    
    const result = await cacheInvalidator.trigger('lazy:event');
    expect(result.success).toBe(true);
    expect(mockCache.touch).toHaveBeenCalled();
  });
  
  test('should invalidate token data', async () => {
    const result = await cacheInvalidator.invalidateToken('0xabc');
    expect(result.success).toBe(true);
    expect(mockCache.invalidate).toHaveBeenCalled();
  });
  
  test('should invalidate by namespace', async () => {
    const result = await cacheInvalidator.invalidateNamespace(CacheNamespace.MARKET);
    expect(result.success).toBe(true);
    expect(mockCache.invalidate).toHaveBeenCalledWith('market:*');
  });
});