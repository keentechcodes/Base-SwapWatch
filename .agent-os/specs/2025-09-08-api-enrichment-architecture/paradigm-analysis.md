# Class-Based vs Function-Based Architecture Analysis

**Created**: 2025-09-08
**Updated**: 2025-09-08 - Decision Made
**Context**: API Enrichment Service for Webhook Processing
**Decision Status**: ✅ DECIDED - Hybrid Approach Adopted

## Final Decision: Hybrid Approach ✅

**Decision Date**: 2025-09-08  
**Decision**: Use **Hybrid Approach** - Classes for stateful infrastructure, Functions for business logic  
**Score**: 8.65/10 (vs 7.65 for pure classes, 7.35 for pure functions)  
**Standard**: Documented in [Hybrid Architecture Standard](../../standards/hybrid-architecture-standard.md)

## Executive Summary

After analyzing class-based (OOP) vs function-based (FP) programming for our API enrichment service, we've adopted the **Hybrid Approach** that combines ScanTrack's proven stateful patterns with modern functional programming for business logic.

## Quick Comparison

| Aspect | Class-Based | Function-Based |
|--------|-------------|----------------|
| **State Management** | Encapsulated in instances | External state (Redis, closures) |
| **Dependency Injection** | Constructor-based, clean | Function parameters or contexts |
| **Testing** | Mock entire classes | Mock individual functions |
| **Code Organization** | Grouped by class/service | Grouped by feature/domain |
| **Type Safety** | Excellent with interfaces | Excellent with function signatures |
| **Performance** | Slight overhead (instances) | Slightly faster (no instantiation) |
| **ScanTrack Alignment** | ✅ Direct pattern match | Requires adaptation |

---

## Detailed Analysis

### Option 1: Class-Based (Current Approach)

```typescript
// SERVICE LAYER
class DexScreenerService extends BaseApiService {
  constructor(
    config: ApiServiceConfig,
    private cache: ICacheService,
    private rateLimiter: IRateLimiter
  ) {
    super(config);
  }

  async getTokenData(address: string): Promise<TokenMarketData> {
    // Check cache
    const cached = await this.cache.get(`market:${address}`);
    if (cached) return cached;

    // Rate-limited API call
    const data = await this.rateLimiter.execute(() =>
      this.makeRequest<DexScreenerResponse>(`/tokens/${address}`)
    );

    // Cache and return
    await this.cache.set(`market:${address}`, data, 300);
    return data;
  }
}

// ORCHESTRATION
class SwapEnricher {
  constructor(
    private services: {
      dexscreener: DexScreenerService;
      basescan: BaseScanService;
    }
  ) {}

  async enrichSwap(event: SwapEvent): Promise<EnrichedSwapEvent> {
    const [market, verification] = await Promise.allSettled([
      this.services.dexscreener.getTokenData(event.tokenAddress),
      this.services.basescan.getVerification(event.tokenAddress)
    ]);
    
    return this.mergeResults(event, market, verification);
  }
}
```

**Pros:**
- ✅ **Direct ScanTrack pattern match** - Can port patterns directly
- ✅ **Clear dependency management** - Constructor injection is explicit
- ✅ **Stateful when needed** - Can maintain connection pools, metrics
- ✅ **Interface-based contracts** - Strong typing with implements
- ✅ **Familiar to most developers** - Standard OOP patterns
- ✅ **Good for complex services** - Encapsulation helps manage complexity

**Cons:**
- ❌ **More boilerplate** - Classes, constructors, this binding
- ❌ **Harder to compose** - Inheritance can be rigid
- ❌ **Memory overhead** - Instance creation
- ❌ **Complex mocking** - Need to mock entire classes

---

### Option 2: Function-Based

```typescript
// SERVICE LAYER
interface ServiceContext {
  config: ApiServiceConfig;
  cache: ICacheService;
  rateLimiter: IRateLimiter;
  logger: Logger;
}

// Factory function creates service
export const createDexScreenerService = (ctx: ServiceContext) => {
  const getTokenData = async (address: string): Promise<TokenMarketData> => {
    // Check cache
    const cached = await ctx.cache.get(`market:${address}`);
    if (cached) return cached;

    // Rate-limited API call
    const data = await ctx.rateLimiter.execute(() =>
      makeRequest<DexScreenerResponse>(ctx.config, `/tokens/${address}`)
    );

    // Cache and return
    await ctx.cache.set(`market:${address}`, data, 300);
    return data;
  };

  return {
    getTokenData,
    getVerification: async (address: string) => { /* ... */ },
    healthCheck: async () => { /* ... */ }
  };
};

// ORCHESTRATION (Functional Composition)
export const createSwapEnricher = (
  dexscreener: ReturnType<typeof createDexScreenerService>,
  basescan: ReturnType<typeof createBaseScanService>
) => {
  const enrichSwap = async (event: SwapEvent): Promise<EnrichedSwapEvent> => {
    const [market, verification] = await Promise.allSettled([
      dexscreener.getTokenData(event.tokenAddress),
      basescan.getVerification(event.tokenAddress)
    ]);
    
    return mergeResults(event, market, verification);
  };

  return { enrichSwap };
};

// Pure functions for business logic
const mergeResults = (
  event: SwapEvent,
  market: SettledResult<TokenMarketData>,
  verification: SettledResult<VerificationData>
): EnrichedSwapEvent => {
  // Pure function - no side effects
  return {
    ...event,
    market: market.status === 'fulfilled' ? market.value : undefined,
    verification: verification.status === 'fulfilled' ? verification.value : undefined
  };
};
```

**Pros:**
- ✅ **More composable** - Functions compose naturally
- ✅ **Easier testing** - Mock individual functions
- ✅ **Tree-shakeable** - Better for bundle size
- ✅ **No this binding issues** - Simpler mental model
- ✅ **Functional programming benefits** - Immutability, pure functions
- ✅ **Smaller memory footprint** - No class instances

**Cons:**
- ❌ **Requires ScanTrack pattern adaptation** - Not a direct port
- ❌ **Less familiar pattern** - Some developers prefer OOP
- ❌ **Dependency passing** - Can become verbose
- ❌ **No private methods** - Everything is exposed

---

### Option 3: Hybrid Approach (Recommended)

```typescript
// INFRASTRUCTURE LAYER - Classes for stateful services
class RateLimiter {
  private tokens: number;
  private queue: Queue<() => void>;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Stateful rate limiting logic
  }
}

class CacheManager {
  constructor(private client: RedisClient) {}
  
  async get<T>(key: string): Promise<T | null> {
    // Stateful cache operations
  }
}

// SERVICE LAYER - Functions with dependency injection
export const createApiServices = (deps: Dependencies) => {
  // Pure business logic functions
  const calculateUsdValue = (amount: string, price: string, decimals: number): string => {
    return new BigNumber(amount)
      .dividedBy(10 ** decimals)
      .multipliedBy(price)
      .toFixed(2);
  };

  // Service functions that use dependencies
  const getDexScreenerData = async (address: string): Promise<MarketData> => {
    const cached = await deps.cache.get(`market:${address}`);
    if (cached) return cached;

    const data = await deps.rateLimiter.execute(() =>
      fetchDexScreenerApi(address)
    );

    await deps.cache.set(`market:${address}`, data, 300);
    return data;
  };

  // Return service interface
  return {
    getDexScreenerData,
    getBaseScanData: async (address: string) => { /* ... */ },
    calculateUsdValue,
    enrichSwapEvent: async (event: SwapEvent) => {
      const [market, verification] = await Promise.allSettled([
        getDexScreenerData(event.tokenAddress),
        getBaseScanData(event.tokenAddress)
      ]);

      return {
        ...event,
        usdValue: calculateUsdValue(event.amount, market.price, event.decimals),
        enrichment: { market, verification }
      };
    }
  };
};

// INITIALIZATION - Clean dependency setup
const initializeServices = async (config: Config) => {
  // Stateful infrastructure (classes)
  const cache = new CacheManager(new RedisClient(config.redis));
  const rateLimiter = new RateLimiter(config.rateLimit);
  const logger = new Logger(config.logging);

  // Functional services
  const apiServices = createApiServices({
    cache,
    rateLimiter,
    logger,
    config
  });

  return apiServices;
};
```

---

## Use Case Analysis

### For Our Webhook Processing Requirements

| Requirement | Class-Based | Function-Based | Hybrid |
|------------|-------------|----------------|---------|
| Rate limiting (stateful) | ✅ Natural fit | ⚠️ Needs closure/context | ✅ Class for state |
| Cache management | ✅ Encapsulated | ⚠️ External state | ✅ Class for Redis |
| API service logic | ⚠️ Some overhead | ✅ Clean functions | ✅ Functions |
| Parallel processing | ✅ Works well | ✅ Works well | ✅ Best of both |
| Testing | ⚠️ Mock classes | ✅ Mock functions | ✅ Flexible |
| ScanTrack patterns | ✅ Direct port | ❌ Needs adaptation | ✅ Selective use |

---

## Recommendation

### **Go with Hybrid Approach**

**Use Classes for:**
- Stateful infrastructure (CacheManager, RateLimiter, Logger)
- Connection management (Redis, Database)
- Services that maintain internal state
- Complex objects with private methods

**Use Functions for:**
- Business logic and data transformations
- API endpoint handlers
- Pure computations (USD calculations, data merging)
- Composable service factories

### Implementation Strategy

```typescript
// 1. Infrastructure Layer (Classes)
src/infrastructure/
  ├── cache/CacheManager.ts      // Class: Manages Redis connection
  ├── rate-limiter/RateLimiter.ts // Class: Maintains token bucket
  └── logger/Logger.ts            // Class: Structured logging

// 2. Services Layer (Functions)
src/services/
  ├── dexscreener/index.ts       // Functions: API calls
  ├── basescan/index.ts          // Functions: API calls
  └── enrichment/index.ts        // Functions: Business logic

// 3. Orchestration Layer (Functions)
src/orchestration/
  └── swap-enricher.ts           // Functions: Coordinate services

// 4. Initialization (Hybrid)
src/index.ts                     // Wire everything together
```

### Why Hybrid Works Best

1. **Leverages ScanTrack patterns where they make sense** - Stateful services as classes
2. **Modern FP where it shines** - Business logic as pure functions
3. **Best testing story** - Mock infrastructure, test functions purely
4. **Clear separation** - Infrastructure vs business logic
5. **Flexible composition** - Functions compose, classes encapsulate
6. **Team-friendly** - Both OOP and FP developers comfortable

### Example Migration from Pure Class

```typescript
// BEFORE: Pure Class Approach
class SwapEnricher {
  constructor(private deps: Dependencies) {}
  
  async enrichSwap(event: SwapEvent): Promise<EnrichedSwap> {
    // All logic in class method
  }
}

// AFTER: Hybrid Approach
// Infrastructure stays as class
class CacheManager { /* ... */ }

// Business logic as functions
export const createSwapEnricher = (deps: Dependencies) => ({
  enrichSwap: async (event: SwapEvent): Promise<EnrichedSwap> => {
    // Logic in function, using class-based infrastructure
    const cached = await deps.cache.get(key); // cache is a class
    const result = calculateEnrichment(event); // pure function
    return result;
  }
});
```

---

## Decision Matrix

| Factor | Weight | Class | Function | Hybrid |
|--------|--------|-------|----------|---------|
| ScanTrack pattern alignment | 25% | 10 | 5 | 8 |
| Testing ease | 20% | 6 | 9 | 9 |
| Developer familiarity | 15% | 9 | 6 | 8 |
| Performance | 10% | 7 | 8 | 8 |
| Maintainability | 20% | 7 | 8 | 9 |
| Flexibility | 10% | 6 | 9 | 10 |
| **Total Score** | | **7.65** | **7.35** | **8.65** |

---

## Next Steps

If you agree with the hybrid approach:

1. **Refactor existing code** - Move business logic to functions
2. **Keep infrastructure classes** - RateLimiter, CacheManager stay as-is
3. **Create service factories** - Functions that return service interfaces
4. **Update tests** - Leverage both mocking strategies
5. **Document patterns** - Clear guidelines on when to use what

The hybrid approach gives us the best of both worlds: ScanTrack's proven stateful patterns where needed, and modern functional programming for business logic and composition.