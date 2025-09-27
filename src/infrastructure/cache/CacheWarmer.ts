/**
 * Cache warming strategy implementation
 * Following hybrid architecture: class for stateful warming coordination
 */

import { ICacheService } from './ICacheService';
import { CacheKeys } from './CacheKeyBuilder';
import { CacheDataType, CacheWarmingPriority, CacheTTLConfig } from './CacheTTLConfig';
import { ILogger } from '../logger/ILogger';
import { Result, success, failure } from '../../services/types';

/**
 * Cache warming configuration
 */
export interface CacheWarmerConfig {
  enabled: boolean;
  intervalMs?: number;
  batchSize?: number;
  maxConcurrent?: number;
  priorityThreshold?: number;
  frequentTokens?: string[];
  criticalData?: CacheDataType[];
}

/**
 * Warmable data source
 */
export interface WarmableDataSource<T> {
  key: string;
  dataType: CacheDataType;
  fetcher: () => Promise<T>;
  ttl?: number;
  priority?: number;
}

/**
 * Warming job status
 */
export interface WarmingJob {
  id: string;
  dataType: CacheDataType;
  key: string;
  status: 'pending' | 'warming' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: Error;
  attempts: number;
}

/**
 * Cache warmer service
 * Proactively refreshes frequently accessed cache entries
 */
export class CacheWarmer {
  private readonly cache: ICacheService;
  private readonly logger: ILogger;
  private readonly config: Required<CacheWarmerConfig>;
  private warmingJobs: Map<string, WarmingJob> = new Map();
  private warmingInterval: NodeJS.Timeout | null = null;
  private isWarming = false;
  private dataSources: Map<string, WarmableDataSource<any>> = new Map();
  
  constructor(
    cache: ICacheService,
    logger: ILogger,
    config: CacheWarmerConfig
  ) {
    this.cache = cache;
    this.logger = logger;
    this.config = {
      enabled: config.enabled,
      intervalMs: config.intervalMs || 60000, // 1 minute default
      batchSize: config.batchSize || 10,
      maxConcurrent: config.maxConcurrent || 5,
      priorityThreshold: config.priorityThreshold || 4,
      frequentTokens: config.frequentTokens || [],
      criticalData: config.criticalData || []
    };
    
    if (this.config.enabled) {
      this.initializeDefaultSources();
    }
  }
  
  /**
   * Initialize default warming sources
   */
  private initializeDefaultSources(): void {
    // Add frequent tokens for warming
    this.config.frequentTokens.forEach(token => {
      // Market data
      this.registerSource({
        key: CacheKeys.market.price(token),
        dataType: CacheDataType.TOKEN_PRICE,
        fetcher: async () => {
          // This would call the actual price fetcher
          // For now, return placeholder
          return { price: 0, timestamp: new Date() };
        },
        priority: 1
      });
      
      // Token metadata
      this.registerSource({
        key: CacheKeys.token.metadata(token),
        dataType: CacheDataType.TOKEN_METADATA,
        fetcher: async () => {
          // This would call the actual metadata fetcher
          return { name: 'Token', symbol: 'TKN' };
        },
        priority: 3
      });
    });
    
    // Add critical data types
    this.config.criticalData.forEach(dataType => {
      const priority = CacheWarmingPriority.getPriority(dataType);
      
      if (priority <= this.config.priorityThreshold) {
        // Register based on data type
        // This would be expanded with actual data sources
        this.logger.debug('Registered critical data type for warming', { dataType, priority });
      }
    });
  }
  
  /**
   * Start cache warming
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Cache warming is disabled');
      return;
    }
    
    if (this.warmingInterval) {
      this.logger.warn('Cache warming already started');
      return;
    }
    
    this.logger.info('Starting cache warmer', {
      interval: this.config.intervalMs,
      sources: this.dataSources.size
    });
    
    // Run initial warming
    this.warmCache().catch(err => {
      this.logger.error('Initial cache warming failed', err);
    });
    
    // Set up interval
    this.warmingInterval = setInterval(() => {
      if (!this.isWarming) {
        this.warmCache().catch(err => {
          this.logger.error('Cache warming cycle failed', err);
        });
      }
    }, this.config.intervalMs);
  }
  
  /**
   * Stop cache warming
   */
  stop(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
      this.logger.info('Cache warmer stopped');
    }
  }
  
  /**
   * Register a data source for warming
   */
  registerSource<T>(source: WarmableDataSource<T>): void {
    const priority = source.priority || CacheWarmingPriority.getPriority(source.dataType);
    
    if (priority <= this.config.priorityThreshold) {
      this.dataSources.set(source.key, { ...source, priority });
      this.logger.debug('Registered warming source', { 
        key: source.key, 
        dataType: source.dataType,
        priority 
      });
    }
  }
  
  /**
   * Unregister a data source
   */
  unregisterSource(key: string): void {
    this.dataSources.delete(key);
    this.warmingJobs.delete(key);
  }
  
  /**
   * Warm the cache
   */
  private async warmCache(): Promise<void> {
    if (this.isWarming) {
      this.logger.debug('Warming already in progress, skipping');
      return;
    }
    
    this.isWarming = true;
    const startTime = Date.now();
    
    try {
      // Get sources that need warming
      const sourcesToWarm = await this.getSourcesNeedingWarming();
      
      if (sourcesToWarm.length === 0) {
        this.logger.debug('No sources need warming');
        return;
      }
      
      this.logger.info('Starting cache warming cycle', { 
        sources: sourcesToWarm.length 
      });
      
      // Process in batches
      const batches = this.createBatches(sourcesToWarm, this.config.batchSize);
      
      for (const batch of batches) {
        await this.warmBatch(batch);
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('Cache warming cycle completed', {
        duration,
        warmed: sourcesToWarm.length,
        failed: Array.from(this.warmingJobs.values())
          .filter(j => j.status === 'failed').length
      });
      
    } catch (error) {
      this.logger.error('Cache warming failed', error as Error);
    } finally {
      this.isWarming = false;
    }
  }
  
  /**
   * Get sources that need warming
   */
  private async getSourcesNeedingWarming(): Promise<WarmableDataSource<any>[]> {
    const sourcesToWarm: WarmableDataSource<any>[] = [];
    
    for (const [key, source] of this.dataSources) {
      // Check if should warm based on priority
      if (!CacheWarmingPriority.shouldWarm(source.dataType)) {
        continue;
      }
      
      // Check cache TTL
      const ttlResult = await this.cache.ttl(key);
      
      if (ttlResult.success) {
        const ttl = ttlResult.data;
        const warmingInterval = CacheWarmingPriority.getWarmingInterval(source.dataType);
        
        // Warm if TTL is less than warming interval
        if (ttl < warmingInterval) {
          sourcesToWarm.push(source);
        }
      } else {
        // Key doesn't exist, needs warming
        sourcesToWarm.push(source);
      }
    }
    
    // Sort by priority
    sourcesToWarm.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    
    return sourcesToWarm;
  }
  
  /**
   * Create batches from sources
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  /**
   * Warm a batch of sources
   */
  private async warmBatch(sources: WarmableDataSource<any>[]): Promise<void> {
    const promises = sources.map(source => this.warmSource(source));
    
    // Use Promise.allSettled to handle failures gracefully
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error('Failed to warm source', {
          key: sources[index].key,
          error: result.reason
        });
      }
    });
  }
  
  /**
   * Warm a single source
   */
  private async warmSource<T>(source: WarmableDataSource<T>): Promise<void> {
    const job: WarmingJob = {
      id: `${source.key}-${Date.now()}`,
      dataType: source.dataType,
      key: source.key,
      status: 'warming',
      startedAt: new Date(),
      attempts: 1
    };
    
    this.warmingJobs.set(source.key, job);
    
    try {
      // Fetch fresh data
      const data = await source.fetcher();
      
      // Store in cache
      const ttl = source.ttl || CacheTTLConfig.getSpecificTTL(source.dataType);
      const result = await this.cache.set(source.key, data, { ttl });
      
      if (result.success) {
        job.status = 'completed';
        job.completedAt = new Date();
        
        this.logger.debug('Successfully warmed cache', {
          key: source.key,
          dataType: source.dataType,
          ttl
        });
      } else {
        throw result.error;
      }
      
    } catch (error) {
      job.status = 'failed';
      job.error = error as Error;
      job.completedAt = new Date();
      
      this.logger.error('Failed to warm cache', {
        key: source.key,
        dataType: source.dataType,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
  
  /**
   * Get warming status
   */
  getStatus(): WarmingStatus {
    const jobs = Array.from(this.warmingJobs.values());
    
    return {
      isWarming: this.isWarming,
      totalSources: this.dataSources.size,
      activeJobs: jobs.filter(j => j.status === 'warming').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      jobs: jobs.slice(-100) // Last 100 jobs
    };
  }
  
  /**
   * Force warm specific keys
   */
  async forceWarm(keys: string[]): Promise<Result<void>> {
    try {
      const sources = keys
        .map(key => this.dataSources.get(key))
        .filter(s => s !== undefined) as WarmableDataSource<any>[];
      
      if (sources.length === 0) {
        return failure(new Error('No registered sources for provided keys'));
      }
      
      await this.warmBatch(sources);
      
      return success(undefined);
    } catch (error) {
      return failure(error as Error);
    }
  }
  
  /**
   * Clear warming history
   */
  clearHistory(): void {
    this.warmingJobs.clear();
  }
}

/**
 * Warming status
 */
export interface WarmingStatus {
  isWarming: boolean;
  totalSources: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  jobs: WarmingJob[];
}

/**
 * Frequently accessed tokens for Base chain
 * These should be kept warm in cache
 */
export const FREQUENT_BASE_TOKENS = [
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  '0x4200000000000000000000000000000000000006', // WETH
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDbC
];