/**
 * Rate limiter interface and implementation
 */

import { Result, success, failure } from '../../services/types';

export interface IRateLimiter {
  checkLimit(key: string): Promise<Result<boolean>>;
  waitForSlot(key: string): Promise<Result<void>>;
  getRemainingQuota(key: string): Promise<Result<number>>;
  reset(key: string): Promise<Result<void>>;
}

export interface RateLimiterStats {
  requestsPerSecond: number;
  burstSize: number;
  currentRequests: number;
  totalRequests: number;
}

export interface RateLimiterConfig {
  requestsPerSecond?: number;
  burstSize?: number;
  keyPrefix?: string;
}

/**
 * Simple in-memory rate limiter implementation
 */
export class RateLimiter implements IRateLimiter {
  private totalRequests = 0;
  private currentRequests = 0;
  private limits: Map<string, TokenBucket> = new Map();
  private config: Required<RateLimiterConfig>;

  constructor(config: RateLimiterConfig = {}) {
    this.config = {
      requestsPerSecond: config.requestsPerSecond || 5,
      burstSize: config.burstSize || 10,
      keyPrefix: config.keyPrefix || 'rl:'
    };
  }

  async checkLimit(key: string): Promise<Result<boolean>> {
    try {
      const bucket = this.getBucket(key);
      const canConsume = bucket.tryConsume();
      if (canConsume) {
        this.currentRequests++;
        this.totalRequests++;
      }
      return success(canConsume);
    } catch (error) {
      return failure(error as Error);
    }
  }

  // Additional methods for services/types IRateLimiter interface
  async acquire(): Promise<void> {
    const result = await this.waitForSlot('default');
    if (!result.success) {
      throw result.error;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.currentRequests = Math.max(0, this.currentRequests - 1);
    }
  }

  resetAll(): void {
    this.limits.clear();
    this.currentRequests = 0;
  }

  getStats(): RateLimiterStats {
    return {
      requestsPerSecond: this.config.requestsPerSecond,
      burstSize: this.config.burstSize,
      currentRequests: this.currentRequests,
      totalRequests: this.totalRequests
    };
  }

  async waitForSlot(key: string): Promise<Result<void>> {
    try {
      const bucket = this.getBucket(key);
      const waitTime = bucket.getWaitTime();
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      bucket.tryConsume();
      return success(undefined);
    } catch (error) {
      return failure(error as Error);
    }
  }

  async getRemainingQuota(key: string): Promise<Result<number>> {
    try {
      const bucket = this.getBucket(key);
      return success(bucket.getTokens());
    } catch (error) {
      return failure(error as Error);
    }
  }

  async reset(key: string): Promise<Result<void>> {
    try {
      this.limits.delete(this.config.keyPrefix + key);
      return success(undefined);
    } catch (error) {
      return failure(error as Error);
    }
  }

  private getBucket(key: string): TokenBucket {
    const fullKey = this.config.keyPrefix + key;
    
    if (!this.limits.has(fullKey)) {
      this.limits.set(fullKey, new TokenBucket(
        this.config.burstSize,
        this.config.requestsPerSecond
      ));
    }
    
    return this.limits.get(fullKey)!;
  }
}

/**
 * Token bucket implementation for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  getTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getWaitTime(): number {
    this.refill();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil((tokensNeeded / this.refillRate) * 1000);
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}