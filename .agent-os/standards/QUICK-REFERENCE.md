# Quick Reference Guide - Hybrid Architecture

## 🎯 The Golden Rule

> **Classes for State, Functions for Logic**

---

## 📁 Directory Structure

```
src/
├── infrastructure/   # CLASSES (Stateful)
│   ├── cache/       # CacheManager class
│   ├── rate-limiter/# RateLimiter class
│   └── logger/      # Logger class
│
├── services/        # FUNCTIONS (Business Logic)
│   ├── dexscreener/ # createDexScreenerService()
│   ├── basescan/    # createBaseScanService()
│   └── enrichment/  # createEnrichmentService()
│
└── lib/            # PURE FUNCTIONS (Utilities)
    ├── calculators.ts
    ├── transformers.ts
    └── validators.ts
```

---

## 🏗️ Infrastructure (Classes)

```typescript
// ✅ Use classes for stateful resources
class CacheManager {
  private client: RedisClient;
  
  constructor(config: CacheConfig) {
    this.client = new RedisClient(config);
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Manages Redis connection state
  }
}

class RateLimiter {
  private tokens: number;
  private queue: Queue;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Manages rate limit state
  }
}
```

---

## 💼 Business Services (Functions)

```typescript
// ✅ Use functions for business logic
export const createDexScreenerService = (deps: Dependencies) => {
  const getTokenData = async (address: string): Promise<TokenData> => {
    // Use infrastructure classes
    return deps.rateLimiter.execute(async () => {
      const cached = await deps.cache.get(address);
      if (cached) return cached;
      
      const data = await fetchApi(address);
      const transformed = transformData(data); // Pure function
      
      await deps.cache.set(address, transformed);
      return transformed;
    });
  };
  
  return { getTokenData };
};
```

---

## 🧮 Pure Functions (Utilities)

```typescript
// ✅ Pure functions for calculations and transformations
export const calculateUsdValue = (
  amount: string,
  price: string,
  decimals: number
): string => {
  return new BigNumber(amount)
    .dividedBy(10 ** decimals)
    .multipliedBy(price)
    .toFixed(2);
};

export const transformSwapEvent = (raw: RawEvent): SwapEvent => {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
    amounts: normalizeAmounts(raw.amounts)
  };
};
```

---

## 🔌 Wiring Everything Together

```typescript
// bootstrap.ts
export const bootstrap = async (config: Config) => {
  // 1. Initialize infrastructure (classes)
  const cache = new CacheManager(config.redis);
  const rateLimiter = new RateLimiter(config.rateLimit);
  const logger = new Logger(config.logging);
  
  await cache.initialize();
  
  const infrastructure = { cache, rateLimiter, logger };
  
  // 2. Create services (functions)
  const services = {
    dexscreener: createDexScreenerService(infrastructure),
    basescan: createBaseScanService(infrastructure),
    enrichment: createEnrichmentService(infrastructure)
  };
  
  return { infrastructure, services };
};
```

---

## ✅ Quick Decision Guide

| If you need to... | Use... | Example |
|------------------|--------|---------|
| Manage a connection | Class | `class RedisClient` |
| Track internal state | Class | `class RateLimiter` |
| Transform data | Function | `const transform = (data) => ...` |
| Calculate values | Function | `const calculate = (a, b) => ...` |
| Handle API calls | Function | `const fetchData = async () => ...` |
| Buffer/Queue items | Class | `class MessageQueue` |
| Validate input | Function | `const validate = (input) => ...` |
| Maintain counters | Class | `class MetricsCollector` |

---

## 🧪 Testing Patterns

```typescript
// Testing Classes
describe('CacheManager', () => {
  let cache: CacheManager;
  
  beforeEach(() => {
    cache = new CacheManager(testConfig);
  });
  
  it('should maintain connection', async () => {
    await cache.initialize();
    expect(cache.isConnected()).toBe(true);
  });
});

// Testing Functions
describe('calculateUsdValue', () => {
  it('should calculate correctly', () => {
    const result = calculateUsdValue('1000000', '1.5', 6);
    expect(result).toBe('1.50');
  });
});

// Testing Service Functions with Mocked Infrastructure
describe('createDexScreenerService', () => {
  it('should use cache', async () => {
    const mockCache = { get: jest.fn(), set: jest.fn() };
    const service = createDexScreenerService({ cache: mockCache });
    
    await service.getTokenData('0x...');
    expect(mockCache.get).toHaveBeenCalled();
  });
});
```

---

## 📝 File Naming

- **Classes**: `PascalCase.ts` → `CacheManager.ts`
- **Functions**: `kebab-case.ts` → `create-service.ts`
- **Pure utils**: `plural.ts` → `validators.ts`, `transformers.ts`
- **Types**: `kebab-case.types.ts` → `api.types.ts`
- **Interfaces**: `IPascalCase.ts` → `ICacheManager.ts`

---

## 🚫 Common Mistakes to Avoid

```typescript
// ❌ BAD - Function trying to maintain state
let requestCount = 0;
const makeRequest = async () => {
  requestCount++; // Don't do this in functions!
  // ...
};

// ✅ GOOD - Class maintaining state
class ApiClient {
  private requestCount = 0;
  
  async makeRequest() {
    this.requestCount++;
    // ...
  }
}

// ❌ BAD - Class with no state (should be function)
class Calculator {
  add(a: number, b: number) {
    return a + b; // No state, should be a function
  }
}

// ✅ GOOD - Pure function
const add = (a: number, b: number): number => a + b;
```

---

## 📚 Full Documentation

- [Hybrid Architecture Standard](./hybrid-architecture-standard.md)
- [TypeScript Coding Standards](./typescript-coding-standards.md)
- [Paradigm Analysis](../specs/2025-09-08-api-enrichment-architecture/paradigm-analysis.md)
- [Architecture Synthesis](../specs/2025-09-08-api-enrichment-architecture/architecture-synthesis.md)