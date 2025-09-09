/**
 * Base API Service with TypeScript generics and modern patterns
 * Implements ScanTrack's proven patterns with type safety
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { 
  IApiService, 
  ApiServiceConfig, 
  ServiceMetrics, 
  ApiError,
  RateLimitError,
  isRetryableError 
} from '../types';
import { RateLimiter } from './RateLimiter';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for all API services
 * Provides common functionality: rate limiting, retries, metrics, error handling
 */
export abstract class BaseApiService<TConfig extends ApiServiceConfig = ApiServiceConfig> 
  implements IApiService<TConfig> {
  
  protected readonly axios: AxiosInstance;
  protected readonly rateLimiter: RateLimiter;
  protected readonly logger: Logger;
  protected metrics: ServiceMetrics;
  
  constructor(
    public readonly config: TConfig,
    protected readonly serviceName: string
  ) {
    this.logger = new Logger(`API:${serviceName}`);
    
    // Initialize axios with interceptors
    this.axios = this.createAxiosInstance();
    
    // Initialize rate limiter from config
    this.rateLimiter = new RateLimiter(this.config.rateLimiter);
    
    // Initialize metrics
    this.metrics = this.initializeMetrics();
    
    // Setup interceptors for request/response handling
    this.setupInterceptors();
  }

  /**
   * Initialize service (can be overridden by subclasses)
   */
  async initialize(): Promise<void> {
    this.logger.info('Service initializing', { serviceName: this.serviceName });
    
    // Perform health check
    const healthy = await this.healthCheck();
    if (!healthy) {
      throw new ApiError(
        `${this.serviceName} failed health check`,
        'SERVICE_UNHEALTHY',
        undefined,
        false
      );
    }
    
    this.logger.info('Service initialized successfully');
  }

  /**
   * Health check implementation
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Make a lightweight request to verify service availability
      const endpoint = this.getHealthCheckEndpoint();
      if (!endpoint) return true; // No health check endpoint defined
      
      const response = await this.makeRequest<any>({
        method: 'GET',
        url: endpoint,
        timeout: 5000 // 5 second timeout for health checks
      });
      
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      this.logger.warn('Health check failed', { error });
      return false;
    }
  }

  /**
   * Get service metrics
   */
  getMetrics(): ServiceMetrics {
    return {
      ...this.metrics,
      cache: {
        ...this.metrics.cache,
        hitRate: this.calculateCacheHitRate()
      }
    };
  }

  /**
   * Create axios instance with base configuration
   */
  protected createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `BaseSwapWatch/${this.serviceName}`,
        ...this.config.headers
      }
    });

    // Add API key if configured
    if (this.config.apiKey) {
      instance.defaults.headers.common['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return instance;
  }

  /**
   * Setup axios interceptors for request/response handling
   */
  protected setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        this.logger.debug('Request', {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        this.logger.error('Request error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        this.updateMetrics('success', response);
        return response;
      },
      async (error: AxiosError) => {
        this.updateMetrics('failure', error.response);
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = this.extractRetryAfter(error.response);
          throw new RateLimitError('Rate limit exceeded', retryAfter);
        }
        
        // Transform to ApiError
        throw this.transformError(error);
      }
    );
  }

  /**
   * Make a rate-limited request with retry logic
   */
  protected async makeRequest<T>(
    config: AxiosRequestConfig,
    context: string = 'API'
  ): Promise<AxiosResponse<T>> {
    const startTime = Date.now();
    
    return this.rateLimiter.execute(async () => {
      let lastError: Error | undefined;
      
      for (let attempt = 1; attempt <= this.config.rateLimiter.maxRetries; attempt++) {
        try {
          this.logger.debug(`Request attempt ${attempt}/${this.config.rateLimiter.maxRetries}`, {
            context,
            url: config.url
          });
          
          const response = await this.axios.request<T>(config);
          
          // Record response time
          const responseTime = Date.now() - startTime;
          this.updateResponseTime(responseTime);
          
          return response;
          
        } catch (error) {
          lastError = error as Error;
          
          // Check if error is retryable
          if (attempt < this.config.rateLimiter.maxRetries && isRetryableError(error)) {
            const delay = this.calculateBackoffDelay(attempt);
            this.logger.warn(`Retrying after ${delay}ms`, {
              attempt,
              error: lastError.message
            });
            await this.sleep(delay);
            continue;
          }
          
          // Non-retryable error or max retries reached
          break;
        }
      }
      
      // All retries failed
      this.logger.error('All retry attempts failed', {
        context,
        error: lastError?.message
      });
      
      throw lastError || new ApiError(
        'Request failed after all retries',
        'MAX_RETRIES_EXCEEDED',
        undefined,
        false
      );
    });
  }

  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.rateLimiter.baseDelayMs;
    const maxDelay = this.config.rateLimiter.maxDelayMs;
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Transform axios error to ApiError
   */
  protected transformError(error: AxiosError): ApiError {
    if (error.response) {
      // Server responded with error
      return new ApiError(
        error.response.data?.message || error.message,
        error.code || 'API_ERROR',
        error.response.status,
        error.response.status >= 500, // 5xx errors are retryable
        error.response.data
      );
    } else if (error.request) {
      // Request made but no response
      return new ApiError(
        'No response from server',
        error.code || 'NO_RESPONSE',
        undefined,
        true // Network errors are retryable
      );
    } else {
      // Request setup error
      return new ApiError(
        error.message,
        'REQUEST_ERROR',
        undefined,
        false
      );
    }
  }

  /**
   * Extract retry-after header from response
   */
  protected extractRetryAfter(response: AxiosResponse): number | undefined {
    const retryAfter = response.headers['retry-after'];
    if (retryAfter) {
      // If it's a number, it's seconds
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000; // Convert to milliseconds
      }
      
      // If it's a date, calculate delay
      const retryDate = new Date(retryAfter);
      if (!isNaN(retryDate.getTime())) {
        return Math.max(0, retryDate.getTime() - Date.now());
      }
    }
    
    return undefined;
  }

  /**
   * Initialize metrics object
   */
  protected initializeMetrics(): ServiceMetrics {
    return {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0
      },
      performance: {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };
  }

  /**
   * Update metrics after request
   */
  protected updateMetrics(
    type: 'success' | 'failure' | 'cached',
    response?: AxiosResponse
  ): void {
    this.metrics.requests.total++;
    
    switch (type) {
      case 'success':
        this.metrics.requests.successful++;
        break;
      case 'failure':
        this.metrics.requests.failed++;
        this.metrics.errors.total++;
        if (response?.status) {
          const statusCode = response.status.toString();
          this.metrics.errors.byType[statusCode] = 
            (this.metrics.errors.byType[statusCode] || 0) + 1;
        }
        break;
      case 'cached':
        this.metrics.requests.cached++;
        this.metrics.cache.hits++;
        break;
    }
  }

  /**
   * Update response time metrics
   */
  private responseTimes: number[] = [];
  
  protected updateResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
    
    // Calculate metrics
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    this.metrics.performance.averageResponseTime = sum / sorted.length;
    this.metrics.performance.p95ResponseTime = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.performance.p99ResponseTime = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  /**
   * Calculate cache hit rate
   */
  protected calculateCacheHitRate(): number {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    return total > 0 ? this.metrics.cache.hits / total : 0;
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get health check endpoint (to be overridden by subclasses)
   */
  protected abstract getHealthCheckEndpoint(): string | null;
}