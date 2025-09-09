# ScanTrack Reference Architecture Spec

**Created**: 2025-09-08
**Type**: Reference Architecture
**Purpose**: Document proven patterns and approaches from ScanTrack for API enrichment implementation

## Executive Summary

This reference spec documents the mature architectural patterns, implementation strategies, and best practices from ScanTrack that should be leveraged for the Base SwapWatch API enrichment feature. ScanTrack demonstrates production-ready patterns for API integration, caching, rate limiting, and error handling that have been battle-tested in a high-performance Telegram bot context.

## Architecture Overview

### Service-Oriented Architecture

ScanTrack implements a clean layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│                  (Bot handlers, commands)                │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                    Service Layer                         │
│              (CachedContractAnalyzer)                   │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                    │
│     (Caching, Rate Limiting, Monitoring, Logging)      │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                    External APIs                         │
│    (DexScreener, BaseScan, Moralis, Base RPC)          │
└─────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Inheritance Pattern**: `CachedContractAnalyzer extends ContractAnalyzer`
   - Base class handles core logic
   - Extended class adds caching layer
   - Clean separation of concerns

2. **Singleton Pattern**: Shared resources
   - Redis client singleton
   - Rate limiter singleton
   - Logger singleton

3. **Cache-First Strategy**: Always check cache before API
   - Component-level caching
   - Intelligent TTL management
   - Graceful fallback on cache failures

4. **Promise.allSettled Pattern**: Parallel API calls with fault tolerance
   - Never fails completely
   - Returns best available data
   - Individual component failure handling

## Core Services Implementation

### 1. ContractAnalyzer Service

Base service class that orchestrates all contract analysis:

```javascript
class ContractAnalyzer {
  constructor(config) {
    this.config = config;
    this.baseProvider = new ethers.JsonRpcProvider(config.blockchain.base.rpcUrl);
    this.logger = getLogger();
    this.rateLimiter = getRateLimiter(3, 1000); // 3 retries, 1s base delay
  }

  async analyzeContract(address) {
    // Parallel fetch with fault tolerance
    const [creationDetails, tokenInfo, verificationInfo, dexData] = 
      await Promise.allSettled([
        this.getCreationDetails(address, provider, network, this.config),
        this.getTokenInfo(address),
        this.getVerificationInfo(address),
        this.getDexScreenerData(address)
      ]);

    // Combine available data
    return {
      network,
      contractType,
      deploymentInfo: creationDetails.status === 'fulfilled' ? creationDetails.value : null,
      tokenInfo: tokenInfo.status === 'fulfilled' ? tokenInfo.value : null,
      verification: verificationInfo.status === 'fulfilled' ? verificationInfo.value : null,
      dexData: dexData.status === 'fulfilled' ? dexData.value : null
    };
  }
}
```

**Key Implementation Details:**
- Always use `Promise.allSettled()` for parallel API calls
- Never let one API failure break the entire flow
- Return partial data rather than failing completely
- Log success/failure status for each component

### 2. CachedContractAnalyzer Extension

Extends base analyzer with intelligent caching:

```javascript
class CachedContractAnalyzer extends ContractAnalyzer {
  async analyzeContract(address, forceFresh = false) {
    // Step 1: Cache lookup (unless forcing refresh)
    if (!forceFresh) {
      const cachedAnalysis = await this.getCachedAnalysis(address);
      if (cachedAnalysis) {
        return { ...cachedAnalysis, _cached: true, _source: 'cache' };
      }
    }

    // Step 2: Component-level cache check
    const [cachedBasic, cachedMarket, cachedVerification, cachedHolders] = 
      await Promise.all([
        this.cache.getBasicInfo(address),
        this.cache.getMarketData(address),
        this.cache.getVerificationData(address),
        this.cache.getHoldersData(address)
      ]);

    // Step 3: Fetch only missing components
    const tasks = [];
    if (!cachedBasic) tasks.push(this.getCreationDetails(...));
    if (!cachedMarket) tasks.push(this.getDexScreenerData(...));
    // ... etc

    // Step 4: Cache results with appropriate TTLs
    await this.cacheAnalysisResult(address, freshAnalysis);
  }
}
```

**Cache Strategy Benefits:**
- Minimizes API calls by checking cache first
- Component-level granularity allows partial cache hits
- Different TTLs for different data types
- Force refresh option for real-time requirements

## API Integration Patterns

### DexScreener Integration

Complete implementation for market data and token information:

```javascript
async getDexScreenerData(address) {
  const baseUrl = 'https://api.dexscreener.com/latest/dex/tokens/';
  
  // Primary data fetch
  const response = await this.rateLimiter.makeRequest(
    baseUrl + address,
    {},
    'DexScreener'
  );

  if (response.data.pairs && response.data.pairs.length > 0) {
    // Find Base network pair
    const basePair = response.data.pairs.find(p => 
      p.chainId === 'base' && 
      p.baseToken.address.toLowerCase() === address.toLowerCase()
    );

    // Check for paid features (banners, boosts)
    let bannerUrl = null;
    try {
      const ordersUrl = `https://api.dexscreener.com/orders/v1/base/${address}`;
      const ordersResponse = await axios.get(ordersUrl);
      
      if (ordersResponse.data.status === 'success' && ordersResponse.data.orders?.length > 0) {
        // Check for boost banner
        const boostsUrl = 'https://api.dexscreener.com/token-boosts/latest/v1';
        const boostsResponse = await axios.get(boostsUrl, {
          params: { tokenAddress: address }
        });
        
        const tokenBoost = boostsResponse.data.find(boost => 
          boost.chainId === 'base' && 
          boost.tokenAddress?.toLowerCase() === address.toLowerCase()
        );
        
        if (tokenBoost?.header) {
          bannerUrl = tokenBoost.header;
        }
      }
    } catch (error) {
      // Silent fail for paid features check
    }

    return {
      age: calculateAge(pair.pairCreatedAt),
      marketCap: pair.fdv,
      volume: pair.volume.h24,
      price: pair.priceUsd,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      imageUrl: bannerUrl
    };
  }
}
```

**DexScreener API Endpoints:**
- **Tokens**: `https://api.dexscreener.com/latest/dex/tokens/{address}`
- **Orders**: `https://api.dexscreener.com/orders/v1/{chain}/{address}`
- **Profiles**: `https://api.dexscreener.com/token-profiles/latest/v1`
- **Boosts**: `https://api.dexscreener.com/token-boosts/latest/v1`

**Key Features:**
- No API key required (public API)
- Multiple data points from single call
- Paid feature detection (banners, boosts)
- Chain-specific filtering for Base network

### BaseScan Integration

Contract verification and creation details:

```javascript
async getVerificationInfo(address) {
  const apiUrl = 'https://api.basescan.org/api';
  const params = {
    module: 'contract',
    action: 'getsourcecode',
    address: address,
    apikey: this.config.etherscanApiKey
  };

  const response = await this.rateLimiter.makeRequest(apiUrl, params, 'Verification');
  
  if (response.data.status === '1' && response.data.result[0]) {
    const contract = response.data.result[0];
    
    // Extract relevant links from source code
    const links = this.extractLinks(contract.SourceCode);
    const filteredLinks = this.filterRelevantLinks(links);
    
    return {
      isVerified: contract.ABI !== 'Contract source code not verified',
      contractName: contract.ContractName || 'Unknown',
      compilerVersion: contract.CompilerVersion || 'Unknown',
      optimizationUsed: contract.OptimizationUsed === '1',
      runs: contract.Runs || '0',
      constructorArguments: contract.ConstructorArguments || '',
      evmVersion: contract.EVMVersion || 'Unknown',
      library: contract.Library || '',
      licenseType: contract.LicenseType || 'None',
      proxy: contract.Proxy || '0',
      implementation: contract.Implementation || '',
      swarmSource: contract.SwarmSource || '',
      links: filteredLinks
    };
  }
}
```

**BaseScan Rate Limiting:**
- 5 requests per second maximum
- 100,000 requests per day limit
- Requires API key (free tier available)

## Caching Architecture

### Redis-Based Multi-Tier Caching

Component-specific TTL strategy:

```javascript
const cacheTTLs = {
  basic: 3600,        // 1 hour - Contract basic info (name, symbol, decimals)
  market: 300,        // 5 minutes - Market data (price, volume, market cap)
  holders: 900,       // 15 minutes - Top holders distribution
  verification: 86400, // 24 hours - Contract verification status
  factory: 86400,     // 24 hours - Factory/deployer information
  metadata: 7200      // 2 hours - Token metadata and links
};
```

### Cache Key Structure

Organized prefix-based key naming:

```javascript
const cacheKeys = {
  basic: `contract:basic:${address}`,
  market: `contract:market:${address}`,
  holders: `contract:holders:${address}`,
  verification: `contract:verification:${address}`,
  factory: `contract:factory:${address}`,
  metadata: `contract:metadata:${address}`,
  scan: `scan:${address}`
};
```

### Cache Operations Pattern

```javascript
class ContractCache {
  async getCompleteContractData(address) {
    const results = await Promise.all([
      this.getBasicInfo(address),
      this.getMarketData(address),
      this.getVerificationData(address),
      this.getHoldersData(address)
    ]);

    return {
      basic: results[0],
      market: results[1],
      verification: results[2],
      holders: results[3],
      _hitCount: results.filter(r => r !== null).length
    };
  }

  async setCompleteContractData(address, data) {
    const tasks = [];
    
    if (data.basic) {
      tasks.push(this.setBasicInfo(address, data.basic));
    }
    if (data.market) {
      tasks.push(this.setMarketData(address, data.market));
    }
    // ... etc
    
    await Promise.all(tasks);
  }
}
```

**Cache Benefits:**
- Reduces API calls by 80-90% for popular tokens
- Component-level granularity for partial updates
- Intelligent TTLs based on data volatility
- Graceful degradation on cache failures

## Rate Limiting Implementation

### Exponential Backoff with Retry Logic

```javascript
class ApiRateLimiter {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.lastRequestTime = 0;
    this.minInterval = 200; // 5 requests per second max
  }

  async makeRequest(url, params, context = 'API') {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Enforce rate limit
        await this.enforceRateLimit();
        
        const response = await axios.get(url, { params });
        
        // Check for rate limit in response
        if (this.isRateLimited(response)) {
          const delay = this.calculateDelay(attempt);
          if (attempt < this.maxRetries) {
            await this.sleep(delay);
            continue;
          }
        }
        
        return response;
        
      } catch (error) {
        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
  }

  calculateDelay(attempt) {
    // Exponential backoff: 1s, 2s, 4s, 8s (max 10s)
    return Math.min(this.baseDelay * Math.pow(2, attempt - 1), 10000);
  }

  isRetryableError(error) {
    // Network errors
    if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
      return true;
    }
    // Server errors
    if (error.response?.status >= 500) {
      return true;
    }
    // Rate limit errors
    if (error.message?.toLowerCase().includes('rate limit')) {
      return true;
    }
    return false;
  }
}
```

**Rate Limiting Strategy:**
- Minimum 200ms between requests (5/sec max)
- Exponential backoff on failures
- Intelligent retry detection
- Context-aware logging

## Error Handling Patterns

### Graceful Degradation

Never fail completely - always return best available data:

```javascript
async analyzeContract(address) {
  const results = {
    basic: null,
    market: null,
    verification: null,
    holders: null
  };

  // Try cache first
  try {
    const cached = await this.getCachedData(address);
    if (cached) {
      Object.assign(results, cached);
    }
  } catch (cacheError) {
    // Log but continue
    this.logger.error('Cache error', cacheError);
  }

  // Fetch missing components
  const tasks = [];
  if (!results.basic) tasks.push(this.fetchBasic(address));
  if (!results.market) tasks.push(this.fetchMarket(address));
  // ... etc

  const freshResults = await Promise.allSettled(tasks);
  
  // Merge successful results
  freshResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // Update results based on task index
    }
  });

  return results; // Always return something
}
```

### Error Categories

```javascript
const ErrorTypes = {
  RETRYABLE: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'Rate limit exceeded',
    'Server error (5xx)'
  ],
  NON_RETRYABLE: [
    'Invalid address',
    'Contract not found',
    'Invalid API key',
    'Insufficient permissions'
  ],
  CACHE_ERRORS: [
    'Redis connection failed',
    'Cache timeout',
    'Serialization error'
  ]
};
```

## Performance Optimizations

### 1. Parallel Processing

Always fetch independent data in parallel:

```javascript
// GOOD - Parallel
const [a, b, c] = await Promise.all([
  fetchA(),
  fetchB(),
  fetchC()
]);

// BAD - Sequential
const a = await fetchA();
const b = await fetchB();
const c = await fetchC();
```

### 2. Early Returns

Check cheap operations first:

```javascript
async analyzeContract(address) {
  // Quick check first (cheap RPC call)
  const code = await provider.getCode(address);
  if (code === '0x') {
    return null; // Not a contract
  }

  // Then check cache (still cheap)
  const cached = await this.getCache(address);
  if (cached) {
    return cached;
  }

  // Finally do expensive API calls
  return await this.fetchFreshData(address);
}
```

### 3. Selective Fetching

Only fetch what's needed:

```javascript
async performFreshAnalysis(address, options = {}) {
  const tasks = [];
  
  // Component-level control
  if (options.includeMarket !== false) {
    tasks.push(this.getMarketData(address));
  }
  if (options.includeHolders) {
    tasks.push(this.getHolders(address));
  }
  if (options.includeVerification !== false) {
    tasks.push(this.getVerification(address));
  }
  
  return await Promise.allSettled(tasks);
}
```

## Monitoring and Logging

### Performance Tracking

```javascript
class PerformanceMonitor {
  trackAPI(service, success, responseTime) {
    this.stats[service] = this.stats[service] || {
      total: 0,
      success: 0,
      failed: 0,
      avgTime: 0
    };

    this.stats[service].total++;
    if (success) {
      this.stats[service].success++;
    } else {
      this.stats[service].failed++;
    }

    // Update average response time
    const current = this.stats[service];
    current.avgTime = (current.avgTime * (current.total - 1) + responseTime) / current.total;
  }

  getStats() {
    return Object.entries(this.stats).map(([service, stats]) => ({
      service,
      ...stats,
      successRate: (stats.success / stats.total * 100).toFixed(2) + '%'
    }));
  }
}
```

### Structured Logging

```javascript
class OptimizedLogger {
  constructor() {
    this.categories = {
      'SYSTEM': { emoji: '⚙️', color: 'cyan' },
      'DATABASE': { emoji: '💾', color: 'blue' },
      'SCAN': { emoji: '🔍', color: 'yellow' },
      'API': { emoji: '🔗', color: 'magenta' },
      'ERROR': { emoji: '❌', color: 'red' },
      'SUCCESS': { emoji: '✅', color: 'green' }
    };
  }

  log(category, message, details = null) {
    const cat = this.categories[category] || { emoji: '📝', color: 'white' };
    const timestamp = new Date().toISOString();
    
    console.log(
      `${cat.emoji} [${timestamp}] [${category}] ${message}`,
      details ? JSON.stringify(details, null, 2) : ''
    );
  }
}
```

## Testing Patterns

### Performance Testing

```javascript
// test-cache-performance.js
async function testCachePerformance() {
  const analyzer = new CachedContractAnalyzer(config);
  const testAddresses = [...]; // List of test addresses

  // Cold cache test
  console.log('Testing with cold cache...');
  await analyzer.cache.flush();
  const coldStart = Date.now();
  for (const address of testAddresses) {
    await analyzer.analyzeContract(address);
  }
  const coldTime = Date.now() - coldStart;

  // Warm cache test
  console.log('Testing with warm cache...');
  const warmStart = Date.now();
  for (const address of testAddresses) {
    await analyzer.analyzeContract(address);
  }
  const warmTime = Date.now() - warmStart;

  console.log(`Cold cache: ${coldTime}ms`);
  console.log(`Warm cache: ${warmTime}ms`);
  console.log(`Speed improvement: ${(coldTime / warmTime).toFixed(2)}x`);
}
```

### Rate Limiting Testing

```javascript
// test-rate-limiting.js
async function testRateLimiting() {
  const limiter = new ApiRateLimiter(3, 1000);
  
  // Test rapid requests
  const requests = Array(10).fill(null).map((_, i) => 
    limiter.makeRequest(testUrl, {}, `Test ${i}`)
  );

  const start = Date.now();
  const results = await Promise.allSettled(requests);
  const duration = Date.now() - start;

  console.log(`10 requests completed in ${duration}ms`);
  console.log(`Average: ${duration / 10}ms per request`);
  console.log(`Expected minimum: ${10 * 200}ms (rate limited)`);
}
```

## Implementation Recommendations

### For Base SwapWatch API Enrichment

1. **Adopt the Service Architecture**
   - Create `SwapEnricher` extending base enrichment class
   - Implement `CachedSwapEnricher` for production

2. **Use Existing Patterns**
   - Copy `ApiRateLimiter` class directly
   - Implement same cache TTL strategy
   - Use `Promise.allSettled()` for API calls

3. **Configure Services**
   ```javascript
   const enrichmentConfig = {
     apis: {
       dexscreener: {
         baseUrl: 'https://api.dexscreener.com/latest',
         rateLimit: null, // No limit
         requiresKey: false
       },
       basescan: {
         baseUrl: 'https://api.basescan.org/api',
         rateLimit: 5, // per second
         requiresKey: true,
         apiKey: process.env.BASESCAN_API_KEY
       }
     },
     cache: {
       ttl: {
         price: 300,      // 5 minutes
         metadata: 7200,  // 2 hours
         verification: 86400 // 24 hours
       }
     },
     rateLimiter: {
       maxRetries: 3,
       baseDelay: 1000,
       minInterval: 200
     }
   };
   ```

4. **Implement Graceful Degradation**
   - Never fail webhook processing
   - Return enriched data when available
   - Log but don't throw on enrichment failures

5. **Add Monitoring**
   - Track API success rates
   - Monitor cache hit rates
   - Log performance metrics

### Migration Path

1. **Phase 1**: Port core utilities
   - `ApiRateLimiter` class
   - Cache manager with Redis
   - Logger utilities

2. **Phase 2**: Implement enrichment service
   - `SwapEnricher` base class
   - DexScreener integration
   - BaseScan integration

3. **Phase 3**: Add caching layer
   - `CachedSwapEnricher` extension
   - Component-level caching
   - Performance monitoring

4. **Phase 4**: Production optimization
   - Fine-tune cache TTLs
   - Add health checks
   - Implement cache warming

## Conclusion

ScanTrack provides a battle-tested, production-ready architecture for API integration that should be directly leveraged for the Base SwapWatch enrichment feature. The patterns for caching, rate limiting, error handling, and monitoring have been proven at scale and will ensure reliable, performant enrichment of webhook events.

### Key Takeaways

1. **Never Fail Completely**: Use `Promise.allSettled()` and graceful degradation
2. **Cache Aggressively**: Component-level caching with intelligent TTLs
3. **Rate Limit Smartly**: Exponential backoff with retry logic
4. **Monitor Everything**: Track performance, errors, and cache efficiency
5. **Keep It Simple**: Extend existing patterns rather than reinventing

This reference architecture provides a clear blueprint for implementing robust API enrichment that will scale with your webhook processing needs.