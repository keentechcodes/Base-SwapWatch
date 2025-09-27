/**
 * Modern TypeScript Rate Limiter with generic support
 * Based on ScanTrack's proven patterns with enhanced type safety
 */

import { IRateLimiter, RateLimiterConfig, RateLimiterStats } from '../types';

/**
 * Token bucket algorithm implementation for rate limiting
 * Provides smooth request distribution and burst handling
 */
export class RateLimiter implements IRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  private stats: RateLimiterStats;
  
  constructor(private readonly config: RateLimiterConfig) {
    this.tokens = config.requestsPerSecond;
    this.lastRefill = Date.now();
    this.stats = {
      requests: 0,
      throttled: 0,
      retries: 0,
      failures: 0,
      averageWaitTime: 0
    };
  }

  /**
   * Acquire a token for making a request
   * Implements token bucket algorithm with queueing
   */
  async acquire(): Promise<void> {
    this.stats.requests++;
    
    // Refill tokens based on time elapsed
    this.refillTokens();
    
    if (this.tokens >= 1) {
      // Token available, consume it
      this.tokens--;
      return;
    }
    
    // No tokens available, queue the request
    this.stats.throttled++;
    const waitStart = Date.now();
    
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        const waitTime = Date.now() - waitStart;
        this.updateAverageWaitTime(waitTime);
        resolve();
      });
      
      // Process queue after delay
      this.scheduleQueueProcessing();
    });
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Acquire token before execution
        await this.acquire();
        
        // Execute the function
        const result = await fn();
        return result;
        
      } catch (error) {
        lastError = error as Error;
        this.stats.retries++;
        
        // Check if we should retry
        if (attempt < this.config.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
          continue;
        }
      }
    }
    
    // All retries exhausted
    this.stats.failures++;
    throw lastError || new Error('Rate limiter execution failed');
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.tokens = this.config.requestsPerSecond;
    this.lastRefill = Date.now();
    this.queue = [];
    this.stats = {
      requests: 0,
      throttled: 0,
      retries: 0,
      failures: 0,
      averageWaitTime: 0
    };
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.config.requestsPerSecond;
    
    if (tokensToAdd >= 1) {
      this.tokens = Math.min(
        this.tokens + Math.floor(tokensToAdd),
        this.config.requestsPerSecond * 2 // Allow burst up to 2x rate
      );
      this.lastRefill = now;
    }
  }

  /**
   * Schedule processing of queued requests
   */
  private scheduleQueueProcessing(): void {
    if (this.queue.length === 0) return;
    
    const delayMs = 1000 / this.config.requestsPerSecond;
    
    setTimeout(() => {
      this.refillTokens();
      
      if (this.tokens >= 1 && this.queue.length > 0) {
        const resolve = this.queue.shift();
        if (resolve) {
          this.tokens--;
          resolve();
        }
      }
      
      // Continue processing if queue not empty
      if (this.queue.length > 0) {
        this.scheduleQueueProcessing();
      }
    }, delayMs);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, attempt - 1),
      this.config.maxDelayMs
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Update average wait time metric
   */
  private updateAverageWaitTime(waitTime: number): void {
    const totalWaitTime = this.stats.averageWaitTime * (this.stats.throttled - 1);
    this.stats.averageWaitTime = (totalWaitTime + waitTime) / this.stats.throttled;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Advanced rate limiter with sliding window algorithm
 * Provides more accurate rate limiting over time windows
 */
export class SlidingWindowRateLimiter implements IRateLimiter {
  private requests: number[] = [];
  private stats: RateLimiterStats;
  
  constructor(
    private readonly config: RateLimiterConfig,
    private readonly windowMs: number = 1000
  ) {
    this.stats = {
      requests: 0,
      throttled: 0,
      retries: 0,
      failures: 0,
      averageWaitTime: 0
    };
  }

  /**
   * Acquire permission to make a request
   */
  async acquire(): Promise<void> {
    this.stats.requests++;
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(
      timestamp => timestamp > now - this.windowMs
    );
    
    if (this.requests.length < this.config.requestsPerSecond) {
      // Within rate limit
      this.requests.push(now);
      return;
    }
    
    // Calculate wait time until oldest request expires
    this.stats.throttled++;
    const oldestRequest = this.requests[0];
    const waitTime = oldestRequest + this.windowMs - now;
    
    if (waitTime > 0) {
      await this.sleep(waitTime);
      // Recursive call after waiting
      return this.acquire();
    }
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
    this.stats = {
      requests: 0,
      throttled: 0,
      retries: 0,
      failures: 0,
      averageWaitTime: 0
    };
  }

  /**
   * Get statistics
   */
  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create appropriate rate limiter
 */
export function createRateLimiter(
  config: RateLimiterConfig,
  algorithm: 'token-bucket' | 'sliding-window' = 'token-bucket'
): IRateLimiter {
  switch (algorithm) {
    case 'sliding-window':
      return new SlidingWindowRateLimiter(config);
    case 'token-bucket':
    default:
      return new RateLimiter(config);
  }
}