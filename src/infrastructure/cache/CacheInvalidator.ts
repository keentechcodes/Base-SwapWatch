/**
 * Cache invalidation patterns
 * Following TypeScript coding standards: explicit types, no any
 */

import { ICacheService } from './ICacheService';
import { CacheKeys, CacheNamespace } from './CacheKeyBuilder';
import { ILogger } from '../logger/ILogger';
import { Result, success, failure } from '../../services/types';

/**
 * Invalidation strategy types
 */
export enum InvalidationStrategy {
  IMMEDIATE = 'immediate',
  LAZY = 'lazy',
  SCHEDULED = 'scheduled',
  CASCADE = 'cascade'
}

/**
 * Invalidation rule
 */
export interface InvalidationRule {
  trigger: string;
  patterns: string[];
  strategy: InvalidationStrategy;
  delay?: number;
  cascade?: string[];
}

/**
 * Cache invalidator service
 */
export class CacheInvalidator {
  private readonly cache: ICacheService;
  private readonly logger: ILogger;
  private rules: Map<string, InvalidationRule[]> = new Map();
  private scheduledInvalidations: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(cache: ICacheService, logger: ILogger) {
    this.cache = cache;
    this.logger = logger;
    this.initializeDefaultRules();
  }
  
  /**
   * Initialize default invalidation rules
   */
  private initializeDefaultRules(): void {
    // Token price change invalidates related data
    this.addRule({
      trigger: 'token:price:change',
      patterns: [
        CacheKeys.market.pattern(),
        CacheKeys.swap.pattern()
      ],
      strategy: InvalidationStrategy.CASCADE,
      cascade: ['token:metadata', 'swap:metrics']
    });
    
    // New transaction invalidates balances
    this.addRule({
      trigger: 'transaction:new',
      patterns: [
        CacheKeys.balance.pattern(),
        CacheKeys.transaction.pattern()
      ],
      strategy: InvalidationStrategy.IMMEDIATE
    });
    
    // Contract verification change
    this.addRule({
      trigger: 'contract:verified',
      patterns: [
        CacheKeys.verification.pattern()
      ],
      strategy: InvalidationStrategy.LAZY
    });
  }
  
  /**
   * Add invalidation rule
   */
  addRule(rule: InvalidationRule): void {
    const rules = this.rules.get(rule.trigger) || [];
    rules.push(rule);
    this.rules.set(rule.trigger, rules);
  }
  
  /**
   * Trigger invalidation
   */
  async trigger(event: string, metadata?: Record<string, any>): Promise<Result<number>> {
    const rules = this.rules.get(event);
    
    if (!rules || rules.length === 0) {
      return success(0);
    }
    
    let totalInvalidated = 0;
    
    for (const rule of rules) {
      const result = await this.executeRule(rule, metadata);
      if (result.success) {
        totalInvalidated += result.data;
      }
    }
    
    this.logger.info('Cache invalidation triggered', {
      event,
      totalInvalidated,
      rulesExecuted: rules.length
    });
    
    return success(totalInvalidated);
  }
  
  /**
   * Execute invalidation rule
   */
  private async executeRule(
    rule: InvalidationRule,
    metadata?: Record<string, any>
  ): Promise<Result<number>> {
    switch (rule.strategy) {
      case InvalidationStrategy.IMMEDIATE:
        return this.invalidateImmediate(rule.patterns);
      
      case InvalidationStrategy.LAZY:
        return this.invalidateLazy(rule.patterns);
      
      case InvalidationStrategy.SCHEDULED:
        return this.invalidateScheduled(rule.patterns, rule.delay || 5000);
      
      case InvalidationStrategy.CASCADE:
        return this.invalidateCascade(rule.patterns, rule.cascade || []);
      
      default:
        return failure(new Error(`Unknown strategy: ${rule.strategy}`));
    }
  }
  
  /**
   * Immediate invalidation
   */
  private async invalidateImmediate(patterns: string[]): Promise<Result<number>> {
    let total = 0;
    
    for (const pattern of patterns) {
      const result = await this.cache.invalidate(pattern);
      if (result.success) {
        total += result.data;
      }
    }
    
    return success(total);
  }
  
  /**
   * Lazy invalidation (mark as stale)
   */
  private async invalidateLazy(patterns: string[]): Promise<Result<number>> {
    // In lazy invalidation, we just mark keys as stale
    // They'll be refreshed on next access
    let total = 0;
    
    for (const pattern of patterns) {
      const keysResult = await this.cache.keys(pattern);
      
      if (keysResult.success) {
        for (const key of keysResult.data) {
          // Set very short TTL to mark as stale
          await this.cache.touch(key, 1);
          total++;
        }
      }
    }
    
    return success(total);
  }
  
  /**
   * Scheduled invalidation
   */
  private async invalidateScheduled(
    patterns: string[],
    delay: number
  ): Promise<Result<number>> {
    const id = `${patterns.join(',')}-${Date.now()}`;
    
    // Clear existing schedule if any
    if (this.scheduledInvalidations.has(id)) {
      clearTimeout(this.scheduledInvalidations.get(id)!);
    }
    
    // Schedule invalidation
    const timeout = setTimeout(async () => {
      await this.invalidateImmediate(patterns);
      this.scheduledInvalidations.delete(id);
    }, delay);
    
    this.scheduledInvalidations.set(id, timeout);
    
    return success(0); // Will be invalidated later
  }
  
  /**
   * Cascade invalidation
   */
  private async invalidateCascade(
    patterns: string[],
    cascade: string[]
  ): Promise<Result<number>> {
    // First invalidate primary patterns
    const primaryResult = await this.invalidateImmediate(patterns);
    let total = primaryResult.success ? primaryResult.data : 0;
    
    // Then trigger cascade events
    for (const event of cascade) {
      const result = await this.trigger(event);
      if (result.success) {
        total += result.data;
      }
    }
    
    return success(total);
  }
  
  /**
   * Invalidate by token address
   */
  async invalidateToken(address: string): Promise<Result<void>> {
    const patterns = [
      CacheKeys.market.price(address),
      CacheKeys.market.volume(address, '*'),
      CacheKeys.market.liquidity(address, '*'),
      CacheKeys.token.info(address),
      CacheKeys.token.metadata(address),
      CacheKeys.price.usd(address)
    ];
    
    await this.invalidateImmediate(patterns);
    return success(undefined);
  }
  
  /**
   * Invalidate by namespace
   */
  async invalidateNamespace(namespace: CacheNamespace): Promise<Result<number>> {
    const pattern = `${namespace}:*`;
    return this.cache.invalidate(pattern);
  }
  
  /**
   * Clear all scheduled invalidations
   */
  clearScheduled(): void {
    this.scheduledInvalidations.forEach(timeout => clearTimeout(timeout));
    this.scheduledInvalidations.clear();
  }
}