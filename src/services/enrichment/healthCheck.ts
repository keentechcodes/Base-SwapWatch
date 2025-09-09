/**
 * Health check functions for monitoring service status
 * Following functional programming paradigm
 */

import { Result, success, failure } from '../types';

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  lastCheck: Date;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * System health report
 */
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  metrics?: {
    uptime: number;
    memoryUsage: number;
    cpuUsage?: number;
    cacheHitRate?: number;
    apiCallRate?: number;
    errorRate?: number;
  };
  checks: {
    redis: boolean;
    apis: boolean;
    rateLimiter: boolean;
    cache: boolean;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  timeout?: number;
  includeMetrics?: boolean;
  testAddresses?: {
    token?: string;
    wallet?: string;
  };
}

/**
 * Check Redis health
 */
export const checkRedisHealth = async (
  cache: any,
  timeout: number = 5000
): Promise<ServiceHealth> => {
  const startTime = Date.now();
  
  try {
    // Set timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Redis health check timeout')), timeout);
    });
    
    // Test Redis operations
    const testKey = `health:check:${Date.now()}`;
    const testValue = 'ok';
    
    const testPromise = (async () => {
      await cache.set(testKey, testValue, { ttl: 10 });
      const result = await cache.get(testKey);
      await cache.delete(testKey);
      
      if (!result.success || result.data !== testValue) {
        throw new Error('Redis read/write test failed');
      }
    })();
    
    await Promise.race([testPromise, timeoutPromise]);
    
    const latency = Date.now() - startTime;
    
    return {
      name: 'redis',
      status: latency < 100 ? 'healthy' : 'degraded',
      latency,
      lastCheck: new Date()
    };
    
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastCheck: new Date(),
      error: (error as Error).message
    };
  }
};

/**
 * Check API service health
 */
export const checkApiHealth = async (
  service: any,
  serviceName: string,
  testAddress: string,
  timeout: number = 5000
): Promise<ServiceHealth> => {
  const startTime = Date.now();
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${serviceName} health check timeout`)), timeout);
    });
    
    const testPromise = service.getTokenData ? 
      service.getTokenData(testAddress) :
      service.getContractVerification ? 
        service.getContractVerification(testAddress) :
        Promise.reject(new Error('Unknown service type'));
    
    const result = await Promise.race([testPromise, timeoutPromise]);
    
    const latency = Date.now() - startTime;
    const isHealthy = result.success === true;
    
    return {
      name: serviceName,
      status: isHealthy ? (latency < 1000 ? 'healthy' : 'degraded') : 'unhealthy',
      latency,
      lastCheck: new Date(),
      error: isHealthy ? undefined : result.error?.message
    };
    
  } catch (error) {
    return {
      name: serviceName,
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastCheck: new Date(),
      error: (error as Error).message
    };
  }
};

/**
 * Check rate limiter health
 */
export const checkRateLimiterHealth = (
  rateLimiter: any
): ServiceHealth => {
  try {
    const stats = rateLimiter.getStats ? rateLimiter.getStats() : null;
    
    if (!stats) {
      throw new Error('Rate limiter stats not available');
    }
    
    const utilizationRate = stats.currentTokens / stats.maxTokens;
    
    return {
      name: 'rateLimiter',
      status: utilizationRate > 0.9 ? 'degraded' : 'healthy',
      lastCheck: new Date(),
      metadata: {
        availableTokens: stats.currentTokens,
        maxTokens: stats.maxTokens,
        utilizationRate: (utilizationRate * 100).toFixed(1) + '%'
      }
    };
    
  } catch (error) {
    return {
      name: 'rateLimiter',
      status: 'unhealthy',
      lastCheck: new Date(),
      error: (error as Error).message
    };
  }
};

/**
 * Calculate system metrics
 */
export const calculateSystemMetrics = (
  startTime: number,
  cacheStats?: any,
  enrichmentMetrics?: any
): HealthReport['metrics'] => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // Memory usage
  const memUsage = process.memoryUsage();
  const memoryUsage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  
  // CPU usage (simplified - in production use proper monitoring)
  const cpuUsage = process.cpuUsage ? 
    Math.round(process.cpuUsage().user / 1000000) : undefined;
  
  // Cache metrics
  const cacheHitRate = cacheStats?.hitRate || 0;
  
  // API metrics
  const apiCallRate = enrichmentMetrics?.apiCallCount ? 
    enrichmentMetrics.apiCallCount / (uptime || 1) : 0;
  
  // Error rate
  const errorRate = enrichmentMetrics?.errorCount ? 
    (enrichmentMetrics.errorCount / enrichmentMetrics.totalEnrichments) * 100 : 0;
  
  return {
    uptime,
    memoryUsage,
    cpuUsage,
    cacheHitRate,
    apiCallRate,
    errorRate
  };
};

/**
 * Determine overall system status
 */
export const determineOverallStatus = (
  services: ServiceHealth[]
): 'healthy' | 'degraded' | 'unhealthy' => {
  const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;
  
  if (unhealthyCount > 0) {
    return 'unhealthy';
  }
  
  if (degradedCount > services.length / 2) {
    return 'degraded';
  }
  
  if (degradedCount > 0) {
    return 'degraded';
  }
  
  return 'healthy';
};

/**
 * Create comprehensive health check function
 */
export const createHealthCheck = (
  dependencies: {
    cache: any;
    rateLimiter: any;
    services: {
      dexScreener?: any;
      baseScan?: any;
      tokenMetadata?: any;
      moralisPnL?: any;
    };
    startTime: number;
    enrichmentMetrics?: () => any;
  },
  config: HealthCheckConfig = {}
) => {
  const {
    timeout = 5000,
    includeMetrics = true,
    testAddresses = {
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      wallet: '0x0000000000000000000000000000000000000000'
    }
  } = config;
  
  /**
   * Perform comprehensive health check
   */
  return async (): Promise<Result<HealthReport>> => {
    try {
      const services: ServiceHealth[] = [];
      
      // Check Redis
      const redisHealth = await checkRedisHealth(dependencies.cache, timeout);
      services.push(redisHealth);
      
      // Check rate limiter
      const rateLimiterHealth = checkRateLimiterHealth(dependencies.rateLimiter);
      services.push(rateLimiterHealth);
      
      // Check API services in parallel
      const apiChecks: Promise<ServiceHealth>[] = [];
      
      if (dependencies.services.dexScreener) {
        apiChecks.push(
          checkApiHealth(
            dependencies.services.dexScreener,
            'dexScreener',
            testAddresses.token!,
            timeout
          )
        );
      }
      
      if (dependencies.services.baseScan) {
        apiChecks.push(
          checkApiHealth(
            dependencies.services.baseScan,
            'baseScan',
            testAddresses.token!,
            timeout
          )
        );
      }
      
      if (dependencies.services.tokenMetadata) {
        apiChecks.push(
          checkApiHealth(
            dependencies.services.tokenMetadata,
            'tokenMetadata',
            testAddresses.token!,
            timeout
          )
        );
      }
      
      if (dependencies.services.moralisPnL) {
        apiChecks.push(
          checkApiHealth(
            dependencies.services.moralisPnL,
            'moralisPnL',
            testAddresses.wallet!,
            timeout
          )
        );
      }
      
      // Wait for all API checks
      const apiResults = await Promise.allSettled(apiChecks);
      
      for (const result of apiResults) {
        if (result.status === 'fulfilled') {
          services.push(result.value);
        } else {
          // Create unhealthy status for failed checks
          services.push({
            name: 'unknown',
            status: 'unhealthy',
            lastCheck: new Date(),
            error: result.reason?.message || 'Health check failed'
          });
        }
      }
      
      // Calculate metrics if requested
      let metrics: HealthReport['metrics'] | undefined;
      
      if (includeMetrics) {
        const cacheStats = await dependencies.cache.getStats();
        const enrichmentMetrics = dependencies.enrichmentMetrics ? 
          dependencies.enrichmentMetrics() : undefined;
        
        metrics = calculateSystemMetrics(
          dependencies.startTime,
          cacheStats.success ? cacheStats.data : undefined,
          enrichmentMetrics
        );
      }
      
      // Determine overall status
      const overallStatus = determineOverallStatus(services);
      
      // Create health report
      const report: HealthReport = {
        status: overallStatus,
        timestamp: new Date(),
        services,
        metrics,
        checks: {
          redis: services.find(s => s.name === 'redis')?.status === 'healthy',
          apis: services.filter(s => s.name.includes('Screen') || s.name.includes('Scan'))
            .some(s => s.status === 'healthy'),
          rateLimiter: services.find(s => s.name === 'rateLimiter')?.status === 'healthy',
          cache: services.find(s => s.name === 'redis')?.status === 'healthy'
        }
      };
      
      return success(report);
      
    } catch (error) {
      return failure(new Error(`Health check failed: ${(error as Error).message}`));
    }
  };
};

/**
 * Format health report for display
 */
export const formatHealthReport = (report: HealthReport): string => {
  const lines: string[] = [];
  
  // Overall status
  const statusEmoji = report.status === 'healthy' ? '✅' : 
                      report.status === 'degraded' ? '⚠️' : '❌';
  lines.push(`${statusEmoji} System Status: ${report.status.toUpperCase()}`);
  lines.push(`📅 Checked: ${report.timestamp.toISOString()}`);
  lines.push('');
  
  // Services
  lines.push('Services:');
  for (const service of report.services) {
    const serviceEmoji = service.status === 'healthy' ? '✅' : 
                         service.status === 'degraded' ? '⚠️' : '❌';
    let line = `  ${serviceEmoji} ${service.name}: ${service.status}`;
    
    if (service.latency) {
      line += ` (${service.latency}ms)`;
    }
    
    if (service.error) {
      line += ` - ${service.error}`;
    }
    
    lines.push(line);
  }
  
  // Metrics
  if (report.metrics) {
    lines.push('');
    lines.push('Metrics:');
    lines.push(`  ⏱️  Uptime: ${report.metrics.uptime}s`);
    lines.push(`  💾 Memory: ${report.metrics.memoryUsage}%`);
    
    if (report.metrics.cacheHitRate !== undefined) {
      lines.push(`  📊 Cache Hit Rate: ${(report.metrics.cacheHitRate * 100).toFixed(1)}%`);
    }
    
    if (report.metrics.apiCallRate !== undefined) {
      lines.push(`  🔄 API Call Rate: ${report.metrics.apiCallRate.toFixed(2)}/s`);
    }
    
    if (report.metrics.errorRate !== undefined) {
      lines.push(`  ⚠️  Error Rate: ${report.metrics.errorRate.toFixed(2)}%`);
    }
  }
  
  return lines.join('\n');
};