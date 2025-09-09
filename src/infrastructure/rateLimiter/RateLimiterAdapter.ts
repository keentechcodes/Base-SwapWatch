/**
 * Adapter to bridge between infrastructure RateLimiter and services IRateLimiter
 */

import { IRateLimiter as ServiceRateLimiter } from '../../services/types';
import { RateLimiter } from './IRateLimiter';

import { RateLimiterStats } from '../../services/types';

/**
 * Adapter class that implements the services/types IRateLimiter interface
 * using our infrastructure RateLimiter
 */
export class RateLimiterAdapter implements ServiceRateLimiter {
  private rateLimiter: RateLimiter;
  private totalRequests = 0;
  private currentRequests = 0;

  constructor(rateLimiter: RateLimiter) {
    this.rateLimiter = rateLimiter;
  }

  async acquire(): Promise<void> {
    const result = await this.rateLimiter.waitForSlot('default');
    if (!result.success) {
      throw result.error;
    }
    this.currentRequests++;
    this.totalRequests++;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.currentRequests = Math.max(0, this.currentRequests - 1);
    }
  }

  reset(): void {
    this.rateLimiter.reset('default');
    this.currentRequests = 0;
  }

  getStats(): RateLimiterStats {
    return {
      requests: this.totalRequests,
      throttled: 0, // Not tracked in simple implementation
      retries: 0,
      failures: 0,
      averageWaitTime: 0
    };
  }
}