import { CacheManager } from './CacheManager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      enableOfflineQueue: false,
      maxRetries: 0
    });
  });

  afterEach(async () => {
    if (cacheManager.isConnected()) {
      await cacheManager.close();
    }
  });

  describe('initialization', () => {
    it('should start disconnected', () => {
      expect(cacheManager.isConnected()).toBe(false);
    });

    it('should throw error when using methods before initialization', async () => {
      await expect(cacheManager.get('test')).rejects.toThrow('Cache is not connected');
    });
  });

  describe('null cache fallback', () => {
    it('should return null for get operations', async () => {
      const nullCache = await import('./CacheManager').then(m => m.createCacheManager({
        host: 'invalid-host',
        maxRetries: 0
      }));
      
      const result = await nullCache.get('test');
      expect(result).toBeNull();
    });

    it('should handle set operations silently', async () => {
      const nullCache = await import('./CacheManager').then(m => m.createCacheManager({
        host: 'invalid-host',
        maxRetries: 0
      }));
      
      await expect(nullCache.set('test', { data: 'value' })).resolves.toBeUndefined();
    });

    it('should return false for exists', async () => {
      const nullCache = await import('./CacheManager').then(m => m.createCacheManager({
        host: 'invalid-host',
        maxRetries: 0
      }));
      
      const exists = await nullCache.exists('test');
      expect(exists).toBe(false);
    });
  });

  describe('stats tracking', () => {
    it('should track cache statistics', async () => {
      const stats = await cacheManager.getStats();
      
      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        connectionStatus: 'disconnected'
      });
    });
  });

  // Integration tests (require Redis to be running)
  describe.skip('with Redis connection', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    describe('basic operations', () => {
      it('should set and get values', async () => {
        const testData = { name: 'test', value: 123 };
        await cacheManager.set('test:key', testData);
        
        const result = await cacheManager.get<typeof testData>('test:key');
        expect(result).toEqual(testData);
      });

      it('should return null for non-existent keys', async () => {
        const result = await cacheManager.get('non:existent');
        expect(result).toBeNull();
      });

      it('should respect TTL', async () => {
        await cacheManager.set('ttl:test', 'value', 1);
        
        const immediate = await cacheManager.get('ttl:test');
        expect(immediate).toBe('value');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const expired = await cacheManager.get('ttl:test');
        expect(expired).toBeNull();
      });
    });

    describe('batch operations', () => {
      it('should handle mget for multiple keys', async () => {
        await cacheManager.set('batch:1', { id: 1 });
        await cacheManager.set('batch:2', { id: 2 });
        
        const results = await cacheManager.mget<{ id: number }>([
          'batch:1',
          'batch:2',
          'batch:3'
        ]);
        
        expect(results).toEqual([
          { id: 1 },
          { id: 2 },
          null
        ]);
      });

      it('should handle mset for multiple items', async () => {
        await cacheManager.mset([
          { key: 'multi:1', value: { data: 'one' }, ttl: 10 },
          { key: 'multi:2', value: { data: 'two' }, ttl: 10 },
          { key: 'multi:3', value: { data: 'three' } }
        ]);
        
        const result1 = await cacheManager.get('multi:1');
        const result2 = await cacheManager.get('multi:2');
        const result3 = await cacheManager.get('multi:3');
        
        expect(result1).toEqual({ data: 'one' });
        expect(result2).toEqual({ data: 'two' });
        expect(result3).toEqual({ data: 'three' });
      });
    });

    describe('deletion operations', () => {
      it('should delete single keys', async () => {
        await cacheManager.set('delete:test', 'value');
        
        const deleted = await cacheManager.delete('delete:test');
        expect(deleted).toBe(true);
        
        const notFound = await cacheManager.delete('delete:test');
        expect(notFound).toBe(false);
      });

      it('should delete by pattern', async () => {
        await cacheManager.set('pattern:1', 'value1');
        await cacheManager.set('pattern:2', 'value2');
        await cacheManager.set('other:1', 'value3');
        
        const count = await cacheManager.deletePattern('pattern:*');
        expect(count).toBe(2);
        
        const pattern1 = await cacheManager.get('pattern:1');
        const pattern2 = await cacheManager.get('pattern:2');
        const other1 = await cacheManager.get('other:1');
        
        expect(pattern1).toBeNull();
        expect(pattern2).toBeNull();
        expect(other1).toBe('value3');
      });
    });

    describe('stats tracking with connection', () => {
      it('should track hits and misses', async () => {
        await cacheManager.set('stats:test', 'value');
        await cacheManager.get('stats:test'); // hit
        await cacheManager.get('stats:missing'); // miss
        
        const stats = await cacheManager.getStats();
        expect(stats.hits).toBeGreaterThan(0);
        expect(stats.misses).toBeGreaterThan(0);
        expect(stats.sets).toBeGreaterThan(0);
      });
    });
  });
});