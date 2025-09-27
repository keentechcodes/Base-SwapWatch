# TypeScript Coding Standards

**Version**: 1.0.0  
**Adopted**: 2025-09-08  
**Status**: Active

## Overview

These coding standards ensure consistent, maintainable, and high-quality TypeScript code across the Base SwapWatch project. They complement our [Hybrid Architecture Standard](./hybrid-architecture-standard.md).

---

## Type Safety Rules

### 1. No `any` Type

```typescript
// ❌ BAD
function process(data: any): any {
  return data.value;
}

// ✅ GOOD
function process<T extends { value: string }>(data: T): string {
  return data.value;
}

// ✅ GOOD - When type is truly unknown
function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Unknown error', error);
  }
}
```

### 2. Explicit Return Types

```typescript
// ❌ BAD - Implicit return type
const calculateFee = (amount: string) => {
  return new BigNumber(amount).multipliedBy(0.003);
};

// ✅ GOOD - Explicit return type
const calculateFee = (amount: string): BigNumber => {
  return new BigNumber(amount).multipliedBy(0.003);
};
```

### 3. Strict Null Checks

```typescript
// ❌ BAD
interface User {
  name: string;
  email: string | null; // Could be undefined too
}

// ✅ GOOD
interface User {
  name: string;
  email: string | null;      // Explicitly nullable
  phone?: string;             // Explicitly optional
}
```

---

## Naming Conventions

### Files and Directories

```
src/
├── infrastructure/          # kebab-case directories
│   ├── CacheManager.ts     # PascalCase for classes
│   ├── ICacheManager.ts    # I prefix for interfaces
│   └── cache.types.ts      # kebab-case.types for type files
├── services/
│   ├── dexscreener/
│   │   └── index.ts        # index for main exports
│   └── enrichment.service.ts  # .service suffix for service files
└── utils/
    ├── validators.ts        # Plural for utility collections
    └── constants.ts         # Plural for constant collections
```

### Variables and Functions

```typescript
// Constants - SCREAMING_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 5000;

// Variables - camelCase
let retryCount = 0;
const userData = await fetchUser();

// Functions - camelCase
function calculateUsdValue(amount: string): string { }
const processSwapEvent = async (event: SwapEvent) => { };

// Classes - PascalCase
class RateLimiter { }
class CacheManager { }

// Interfaces - PascalCase with I prefix
interface IRateLimiter { }
interface ICacheManager { }

// Types - PascalCase
type SwapEvent = { };
type MarketData = { };

// Enums - PascalCase with PascalCase members
enum DataSource {
  Cache = 'cache',
  DexScreener = 'dexscreener',
  BaseScan = 'basescan'
}
```

---

## Code Organization

### Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';
import { join } from 'path';

// 2. External packages
import { BigNumber } from 'bignumber.js';
import axios from 'axios';
import { Redis } from 'ioredis';

// 3. Internal infrastructure
import { CacheManager } from '@/infrastructure/cache/CacheManager';
import { RateLimiter } from '@/infrastructure/rate-limiter/RateLimiter';

// 4. Internal services
import { createDexScreenerService } from '@/services/dexscreener';

// 5. Internal utilities and types
import { validateAddress } from '@/utils/validators';
import type { SwapEvent, EnrichedSwapEvent } from '@/types';
```

### Export Patterns

```typescript
// ✅ GOOD - Named exports for multiple items
export const calculateFee = () => { };
export const validateSwap = () => { };
export type SwapData = { };

// ✅ GOOD - Default export for main class/function
export default class CacheManager { }

// ✅ GOOD - Barrel exports in index.ts
export * from './types';
export * from './validators';
export { createService } from './service';

// ❌ BAD - Mixed default and named in same file (except index.ts)
export default class Service { }
export const helper = () => { }; // Put in separate file
```

---

## Function Guidelines

### Pure Functions

```typescript
// ✅ GOOD - Pure function
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

// ❌ BAD - Side effects
let total = 0;
const calculateTotal = (items: Item[]): number => {
  total = items.reduce((sum, item) => sum + item.price, 0); // Modifies external state
  console.log('Calculated total:', total); // Side effect
  return total;
};
```

### Async Functions

```typescript
// ✅ GOOD - Explicit error handling
const fetchData = async (id: string): Promise<Data | null> => {
  try {
    const response = await api.get(`/data/${id}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch data', { id, error });
    return null;
  }
};

// ❌ BAD - Unhandled promise
const fetchData = (id: string) => {
  return api.get(`/data/${id}`).then(r => r.data); // No error handling
};
```

### Function Parameters

```typescript
// ✅ GOOD - Use object for 3+ parameters
interface ProcessOptions {
  address: string;
  includeMarket?: boolean;
  includeVerification?: boolean;
  forceFresh?: boolean;
}

const processToken = async (options: ProcessOptions): Promise<TokenData> => {
  const { address, includeMarket = true, includeVerification = true } = options;
  // ...
};

// ❌ BAD - Too many parameters
const processToken = async (
  address: string,
  includeMarket: boolean,
  includeVerification: boolean,
  forceFresh: boolean,
  timeout: number
): Promise<TokenData> => { };
```

---

## Error Handling

### Result Types Pattern

```typescript
// ✅ GOOD - Explicit success/failure
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

const fetchMarketData = async (address: string): Promise<Result<MarketData>> => {
  try {
    const data = await api.getMarketData(address);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
};

// Usage
const result = await fetchMarketData(address);
if (result.success) {
  console.log('Price:', result.data.price);
} else {
  console.error('Failed:', result.error.message);
}
```

### Custom Error Classes

```typescript
// ✅ GOOD - Specific error types
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(public readonly retryAfter: number) {
    super('Rate limit exceeded', 'RATE_LIMIT', 429, true);
    this.name = 'RateLimitError';
  }
}
```

---

## TypeScript Specific

### Interface vs Type

```typescript
// Use interfaces for objects that can be extended
interface IService {
  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

interface ICacheService extends IService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

// Use types for unions, intersections, and utilities
type Status = 'pending' | 'processing' | 'completed' | 'failed';
type Nullable<T> = T | null;
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

### Generic Constraints

```typescript
// ✅ GOOD - Constrained generics
function processCollection<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map(item => [item.id, item]));
}

// ✅ GOOD - Multiple constraints
interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

function sortByDate<T extends Timestamped>(items: T[]): T[] {
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
```

### Type Guards

```typescript
// ✅ GOOD - Type guard functions
const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};

const isSuccessResponse = <T>(response: Result<T>): response is { success: true; data: T } => {
  return response.success === true;
};

// Usage
if (isApiError(error)) {
  if (error.retryable) {
    await retry();
  }
}
```

---

## Comments and Documentation

### JSDoc for Public APIs

```typescript
/**
 * Enriches a swap event with market data and token information
 * @param event - The raw swap event from the blockchain
 * @param options - Optional configuration for enrichment
 * @returns Enriched swap event with USD values and token metadata
 * @throws {ApiError} When external API calls fail
 * @example
 * ```typescript
 * const enriched = await enrichSwapEvent(event, { includeHolders: true });
 * console.log(`USD Value: ${enriched.usdValue}`);
 * ```
 */
export const enrichSwapEvent = async (
  event: SwapEvent,
  options?: EnrichmentOptions
): Promise<EnrichedSwapEvent> => {
  // Implementation
};
```

### Inline Comments

```typescript
// ✅ GOOD - Explains WHY, not WHAT
const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s...

// ❌ BAD - Obvious comment
const total = price * quantity; // Multiply price by quantity
```

---

## Testing Standards

### Test File Naming

```
src/
├── services/
│   ├── enrichment.service.ts
│   └── enrichment.service.test.ts    # Co-located test file
└── infrastructure/
    ├── CacheManager.ts
    └── CacheManager.test.ts
```

### Test Structure

```typescript
describe('EnrichmentService', () => {
  describe('enrichSwapEvent', () => {
    it('should return cached data when available', async () => {
      // Arrange
      const mockCache = createMockCache({ data: cachedData });
      const service = createEnrichmentService({ cache: mockCache });

      // Act
      const result = await service.enrichSwapEvent(mockEvent);

      // Assert
      expect(result).toEqual(cachedData);
      expect(mockCache.get).toHaveBeenCalledWith(mockEvent.tokenAddress);
    });

    it('should fetch fresh data when cache misses', async () => {
      // Test implementation
    });
  });
});
```

---

## Performance Guidelines

1. **Use `const` by default**, `let` only when reassignment needed
2. **Prefer `Map` over objects** for dynamic keys
3. **Use `Set` for unique collections**
4. **Avoid premature optimization** - measure first
5. **Use `Promise.all()` for parallel operations**
6. **Implement pagination** for large datasets
7. **Use streaming** for large file operations

---

## Security Guidelines

1. **Never log sensitive data** (API keys, passwords, PII)
2. **Validate all external input**
3. **Use parameterized queries** for databases
4. **Sanitize user input** before display
5. **Use environment variables** for configuration
6. **Implement rate limiting** for public endpoints
7. **Use HTTPS** for all external requests

---

## Code Review Checklist

- [ ] No `any` types (except justified cases)
- [ ] All functions have explicit return types
- [ ] Error handling implemented (try/catch or Result types)
- [ ] Unit tests written for new functionality
- [ ] JSDoc comments for public APIs
- [ ] No console.log in production code
- [ ] Imports organized correctly
- [ ] File names follow conventions
- [ ] No hardcoded values (use constants/config)
- [ ] Security considerations addressed

---

## Enforcement

These standards are enforced through:
1. **ESLint configuration** - Automated linting
2. **TypeScript strict mode** - Compile-time checks
3. **Pre-commit hooks** - Prevent non-compliant commits
4. **Code reviews** - Manual verification
5. **CI/CD pipeline** - Automated testing and validation