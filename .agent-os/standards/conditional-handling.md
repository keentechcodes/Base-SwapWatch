# Conditional Handling Standard

**Version**: 1.0.0
**Adopted**: 2025-10-05
**Status**: Active

## Overview

This standard defines how to write conditional logic in a flat, readable style that minimizes nesting and cognitive load. Following these patterns makes code easier to understand, test, and maintain.

---

## Core Principle

> **Write code that reads top-to-bottom, not nested inside-out**
> Use early returns, guard clauses, and ternaries to keep logic flat

---

## Pattern 1: Early Returns (Guard Clauses)

### ❌ Bad: Nested If-Else

```typescript
const processRequest = async (request: Request): Promise<Result<Data>> => {
  if (request.valid) {
    if (request.authorized) {
      if (request.data) {
        const result = await processData(request.data);
        return success(result);
      } else {
        return failure(new Error('Missing data'));
      }
    } else {
      return failure(new Error('Unauthorized'));
    }
  } else {
    return failure(new Error('Invalid request'));
  }
};
```

### ✅ Good: Early Returns

```typescript
const processRequest = async (request: Request): Promise<Result<Data>> => {
  if (!request.valid) return failure(new Error('Invalid request'));
  if (!request.authorized) return failure(new Error('Unauthorized'));
  if (!request.data) return failure(new Error('Missing data'));

  // Happy path - flat and clear
  const result = await processData(request.data);
  return success(result);
};
```

**Benefits:**
- Reads top-to-bottom
- Errors handled immediately
- Happy path at the end, unindented
- Cognitive load reduced

---

## Pattern 2: Ternary for Simple Assignments

### ❌ Bad: If-Else for Simple Values

```typescript
let status: string;
if (isActive) {
  status = 'ACTIVE';
} else {
  status = 'INACTIVE';
}

let value: number;
if (condition) {
  value = 100;
} else {
  value = 0;
}
```

### ✅ Good: Ternary Operators

```typescript
const status = isActive ? 'ACTIVE' : 'INACTIVE';
const value = condition ? 100 : 0;

// Also good for object properties
const config = {
  mode: isDev ? 'development' : 'production',
  port: useSSL ? 443 : 80
};
```

**When to use:**
- Simple true/false → value mappings
- One-line conditionals
- No complex logic in either branch

**When NOT to use:**
- Multiple conditions (use if-else or switch)
- Complex expressions (reduces readability)
- Side effects in branches (use if statements)

---

## Pattern 3: Ternary in Returns

### ❌ Bad: If-Else for Simple Returns

```typescript
const getStatus = (active: boolean): string => {
  if (active) {
    return 'ACTIVE';
  } else {
    return 'INACTIVE';
  }
};

const calculateFee = (amount: number, isPremium: boolean): number => {
  if (isPremium) {
    return amount * 0.01;
  } else {
    return amount * 0.03;
  }
};
```

### ✅ Good: Single Return with Ternary

```typescript
const getStatus = (active: boolean): string =>
  active ? 'ACTIVE' : 'INACTIVE';

const calculateFee = (amount: number, isPremium: boolean): number =>
  isPremium ? amount * 0.01 : amount * 0.03;

// For slightly more complex logic
const getDiscount = (isPremium: boolean, amount: number): number => {
  return isPremium
    ? amount > 1000 ? 0.15 : 0.10
    : amount > 1000 ? 0.05 : 0.02;
};
```

---

## Pattern 4: Logical Operators for Defaults

### ❌ Bad: If-Else for Defaults

```typescript
let threshold: number;
if (config.threshold !== undefined) {
  threshold = config.threshold;
} else {
  threshold = DEFAULT_THRESHOLD;
}

let label: string | undefined;
if (request.label && request.label.trim()) {
  label = request.label;
} else {
  label = undefined;
}
```

### ✅ Good: Nullish Coalescing & Logical OR

```typescript
// Use ?? for null/undefined defaults
const threshold = config.threshold ?? DEFAULT_THRESHOLD;

// Use || for falsy defaults (but be careful with 0, '', false)
const label = request.label?.trim() || undefined;

// For function parameters
const processData = (
  data: Data,
  timeout = 5000,        // Default parameter
  retries = 3
): Result<void> => {
  // ...
};
```

---

## Pattern 5: Optional Chaining

### ❌ Bad: Nested Property Checks

```typescript
let webhook: string | undefined;
if (config && config.data && config.data.telegramWebhook) {
  webhook = config.data.telegramWebhook;
}

let count: number;
if (manager && typeof manager.getCount === 'function') {
  count = manager.getCount();
} else {
  count = 0;
}
```

### ✅ Good: Optional Chaining with Defaults

```typescript
const webhook = config?.data?.telegramWebhook;
const count = manager?.getCount() ?? 0;

// Combined with ternary
const status = user?.isActive
  ? 'online'
  : 'offline';
```

---

## Pattern 6: Switch for Multiple Conditions

### ❌ Bad: Long If-Else-If Chains

```typescript
const getColor = (status: string): string => {
  if (status === 'success') {
    return 'green';
  } else if (status === 'error') {
    return 'red';
  } else if (status === 'warning') {
    return 'yellow';
  } else if (status === 'info') {
    return 'blue';
  } else {
    return 'gray';
  }
};
```

### ✅ Good: Switch Statement or Object Lookup

```typescript
// Switch with fall-through
const getColor = (status: string): string => {
  switch (status) {
    case 'success': return 'green';
    case 'error': return 'red';
    case 'warning': return 'yellow';
    case 'info': return 'blue';
    default: return 'gray';
  }
};

// Even better: Object lookup (when no complex logic)
const STATUS_COLORS = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue'
} as const;

const getColor = (status: string): string =>
  STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'gray';
```

---

## Pattern 7: Early Return in Loops

### ❌ Bad: Nested Conditions in Loops

```typescript
const findUser = (users: User[], id: string): User | null => {
  let found: User | null = null;

  for (const user of users) {
    if (user.id === id) {
      if (user.isActive) {
        found = user;
        break;
      }
    }
  }

  return found;
};
```

### ✅ Good: Early Return from Loop

```typescript
const findUser = (users: User[], id: string): User | null => {
  for (const user of users) {
    if (user.id !== id) continue;
    if (!user.isActive) continue;

    return user; // Early return when found
  }

  return null; // Not found
};

// Or use Array methods
const findUser = (users: User[], id: string): User | null =>
  users.find(user => user.id === id && user.isActive) ?? null;
```

---

## Pattern 8: Result<T> Pattern with Early Returns

### ❌ Bad: Nested Result Checks

```typescript
const processWallet = async (address: string): Promise<Result<Wallet>> => {
  const validationResult = validateAddress(address);

  if (validationResult.success) {
    const walletResult = await fetchWallet(validationResult.data);

    if (walletResult.success) {
      const enrichmentResult = await enrichWallet(walletResult.data);

      if (enrichmentResult.success) {
        return success(enrichmentResult.data);
      } else {
        return failure(enrichmentResult.error);
      }
    } else {
      return failure(walletResult.error);
    }
  } else {
    return failure(validationResult.error);
  }
};
```

### ✅ Good: Early Returns with Result Pattern

```typescript
const processWallet = async (address: string): Promise<Result<Wallet>> => {
  const validationResult = validateAddress(address);
  if (!validationResult.success) return validationResult;

  const walletResult = await fetchWallet(validationResult.data);
  if (!walletResult.success) return walletResult;

  const enrichmentResult = await enrichWallet(walletResult.data);
  if (!enrichmentResult.success) return enrichmentResult;

  return success(enrichmentResult.data);
};

// Or use a helper for sequential Result operations
const processWallet = async (address: string): Promise<Result<Wallet>> => {
  return await pipe(
    validateAddress(address),
    andThen(fetchWallet),
    andThen(enrichWallet)
  );
};
```

---

## Dos and Don'ts

### ✅ DO

1. **Use early returns** to handle error cases first
2. **Use ternary operators** for simple value assignments
3. **Use optional chaining** instead of nested if checks
4. **Use nullish coalescing** for default values
5. **Use switch statements** for multiple discrete values
6. **Flatten nested conditions** by inverting logic
7. **Extract complex conditions** to named boolean variables

### ❌ DON'T

1. **Don't nest more than 2 levels** deep
2. **Don't use ternaries** for complex logic
3. **Don't use ternaries** with side effects
4. **Don't chain multiple ternaries** (unreadable)
5. **Don't mix && || operators** without parentheses
6. **Don't use clever tricks** that reduce readability

---

## Complex Example: Before & After

### ❌ Before: Nested Nightmare

```typescript
const addWallet = async (request: AddWalletRequest): Promise<Result<void>> => {
  if (request.address) {
    if (WALLET_REGEX.test(request.address)) {
      const wallets = await getWallets();
      if (wallets.success) {
        if (!wallets.data.includes(request.address)) {
          if (wallets.data.length < MAX_WALLETS) {
            if (request.label) {
              if (request.label.length <= MAX_LABEL_LENGTH) {
                // Finally do the work...
                return await storage.addWallet(request.address, request.label);
              } else {
                return failure(new Error('Label too long'));
              }
            } else {
              return await storage.addWallet(request.address);
            }
          } else {
            return failure(new Error('Max wallets reached'));
          }
        } else {
          return failure(new Error('Duplicate wallet'));
        }
      } else {
        return failure(wallets.error);
      }
    } else {
      return failure(new Error('Invalid address'));
    }
  } else {
    return failure(new Error('Missing address'));
  }
};
```

### ✅ After: Flat & Clean

```typescript
const addWallet = async (request: AddWalletRequest): Promise<Result<void>> => {
  // Validate address
  if (!request.address) return failure(new Error('Missing address'));
  if (!WALLET_REGEX.test(request.address)) return failure(new Error('Invalid address'));

  // Validate label
  if (request.label && request.label.length > MAX_LABEL_LENGTH) {
    return failure(new Error('Label too long'));
  }

  // Get current wallets
  const walletsResult = await getWallets();
  if (!walletsResult.success) return walletsResult;

  const wallets = walletsResult.data;

  // Check constraints
  if (wallets.includes(request.address)) return failure(new Error('Duplicate wallet'));
  if (wallets.length >= MAX_WALLETS) return failure(new Error('Max wallets reached'));

  // Happy path - all validations passed
  const label = request.label || undefined;
  return await storage.addWallet(request.address, label);
};
```

---

## Testing Implications

Flat conditionals are easier to test:

```typescript
// Easy to test each branch
describe('addWallet', () => {
  it('should fail when address is missing', async () => {
    const result = await addWallet({ address: '' });
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Missing address');
  });

  it('should fail when address is invalid', async () => {
    const result = await addWallet({ address: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Invalid address');
  });

  // ... one test per guard clause
});
```

---

## Checklist

Before committing code with conditionals, verify:

- [ ] No nesting deeper than 2 levels
- [ ] Error cases handled with early returns
- [ ] Ternaries used only for simple value assignments
- [ ] Complex conditions extracted to named variables
- [ ] Optional chaining used instead of nested property checks
- [ ] Nullish coalescing used for defaults
- [ ] Happy path is at the end, unindented
- [ ] Each branch is easily testable

---

## Conclusion

Flat conditional handling improves:
- **Readability**: Top-to-bottom flow
- **Maintainability**: Easy to modify
- **Testability**: Clear branch coverage
- **Cognitive Load**: Less mental parsing

Apply these patterns consistently for cleaner, more maintainable code.
