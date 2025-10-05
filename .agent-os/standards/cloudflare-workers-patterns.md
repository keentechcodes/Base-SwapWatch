# Cloudflare Workers & Durable Objects Patterns

**Version**: 1.0.0
**Adopted**: 2025-10-05
**Status**: Active

## Overview

This standard defines how to work with Cloudflare Workers and Durable Objects while adhering to our Hybrid Architecture Standard. Platform constraints sometimes require classes, but we minimize business logic within them.

---

## Core Principle

> **Platform-Required Classes Should Be Thin Wrappers**
> Extract all business logic to functional modules, keep classes minimal

---

## Pattern 1: Thin Durable Object Wrapper

### The Challenge

Cloudflare **requires** Durable Objects to be classes:

```typescript
// ❌ Platform requirement - MUST be a class
export class MyDurableObject {
  constructor(state: DurableObjectState, env: Env) { }

  async fetch(request: Request): Promise<Response> { }
  async alarm(): Promise<void> { }
}
```

**But we want:** Function-first architecture with minimal classes.

### The Solution: Thin Wrapper Pattern

```typescript
/**
 * Durable Object - THIN wrapper (routing only)
 * ALL business logic in functional modules
 */
export class RoomDurableObject {
  private handlers: ReturnType<typeof createRequestHandlers>;

  constructor(state: DurableObjectState, _env: Env) {
    // Initialize functional modules with DI
    const storage = createStorageOps(state.storage);
    const websocket = createWebSocketManager();
    this.handlers = createRequestHandlers({ storage, websocket });
  }

  /**
   * Main request handler - JUST ROUTING
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route to handler - no business logic
    if (path === '/wallets' && request.method === 'POST') {
      const body = await request.json() as AddWalletRequest;
      const result = await this.handlers.addWallet(body);
      return this.toResponse(result, 201);
    }

    // ... more routing
  }

  // Minimal helper methods (conversion only)
  private toResponse<T>(result: Result<T>, status = 200): Response {
    return result.success
      ? new Response(JSON.stringify(result.data), { status })
      : new Response(JSON.stringify({ error: result.error.message }), {
          status: this.getErrorStatus(result.error)
        });
  }
}
```

**File Structure:**
```
src/worker/
├── RoomDurableObject.ts      # Thin wrapper (~220 lines, mostly routing)
└── room/
    ├── validators.ts          # Pure validation functions
    ├── storage-ops.ts         # Storage factory
    ├── websocket-manager.ts   # WebSocket factory
    ├── request-handlers.ts    # Business logic orchestration
    └── telegram-formatter.ts  # Pure formatting functions
```

---

## Pattern 2: Factory Pattern for Durable Object State

### ❌ Bad: Business Logic in DO Class

```typescript
export class RoomDurableObject {
  private state: DurableObjectState;

  async addWallet(address: string): Promise<Result<void>> {
    // ❌ Validation in class
    if (!WALLET_REGEX.test(address)) {
      return failure(new Error('Invalid address'));
    }

    // ❌ Storage logic in class
    const wallets = await this.state.storage.get('wallets') || [];
    wallets.push(address);
    await this.state.storage.put('wallets', wallets);

    return success(undefined);
  }
}
```

### ✅ Good: Factory with Injected Storage

```typescript
// room/storage-ops.ts - Factory with DI
export const createStorageOps = (storage: DurableObjectStorage) => ({
  addWallet: async (address: string): Promise<Result<void>> => {
    try {
      const wallets = await storage.get<string[]>('wallets') || [];
      wallets.push(address);
      await storage.put('wallets', wallets);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to add wallet'));
    }
  },

  getWallets: async (): Promise<Result<string[]>> => {
    try {
      const wallets = await storage.get<string[]>('wallets');
      return success(wallets || []);
    } catch (error) {
      return failure(new Error('Failed to retrieve wallets'));
    }
  }
});

// RoomDurableObject.ts - Thin wrapper
export class RoomDurableObject {
  private storage: ReturnType<typeof createStorageOps>;

  constructor(state: DurableObjectState, _env: Env) {
    this.storage = createStorageOps(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    // Just delegate
    const result = await this.storage.addWallet(address);
    return this.toResponse(result);
  }
}
```

---

## Pattern 3: WebSocket State with Closure

### ❌ Bad: WebSocket State in DO Class

```typescript
export class RoomDurableObject {
  private sessions: Set<WebSocket> = new Set();

  async handleWebSocket(ws: WebSocket): Promise<void> {
    this.sessions.add(ws);
    // ... broadcast logic
  }

  async broadcast(message: any): Promise<void> {
    for (const ws of this.sessions) {
      ws.send(JSON.stringify(message));
    }
  }
}
```

### ✅ Good: Factory with Closure for State

```typescript
// room/websocket-manager.ts - Closure pattern
export const createWebSocketManager = () => {
  // Private state - encapsulated in closure
  const sessions = new Set<WebSocket>();

  return {
    track: (ws: WebSocket): Result<void> => {
      sessions.add(ws);
      return success(undefined);
    },

    broadcast: async (message: WebSocketMessage): Promise<Result<number>> => {
      const payload = JSON.stringify(message);
      let delivered = 0;

      for (const ws of sessions) {
        try {
          ws.send(payload);
          delivered++;
        } catch {
          sessions.delete(ws);
        }
      }

      return success(delivered);
    },

    getCount: (): number => sessions.size
  };
};

// RoomDurableObject.ts
export class RoomDurableObject {
  private websocket: ReturnType<typeof createWebSocketManager>;

  constructor(state: DurableObjectState, _env: Env) {
    this.websocket = createWebSocketManager();
  }
}
```

---

## Pattern 4: Request Handler Orchestration

### ✅ Separate Orchestration from Platform Code

```typescript
// room/request-handlers.ts - Business logic orchestration
export const createRequestHandlers = (deps: HandlerDependencies) => {
  const { storage, websocket } = deps;

  return {
    addWallet: async (request: AddWalletRequest): Promise<Result<void>> => {
      // Validate (pure function)
      const addressResult = validateWalletAddress(request.address);
      if (!addressResult.success) return addressResult;

      const labelResult = validateWalletLabel(request.label);
      if (!labelResult.success) return labelResult;

      // Check constraints (pure function)
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const limitCheck = validateWalletLimit(walletsResult.data.length);
      if (!limitCheck.success) return limitCheck;

      // Execute operation
      const addResult = await storage.addWallet(addressResult.data);
      if (!addResult.success) return addResult;

      // Broadcast update
      await websocket.broadcast({
        type: 'wallet_added',
        data: { address: addressResult.data, label: labelResult.data }
      });

      return success(undefined);
    }
  };
};
```

---

## Pattern 5: Environment Binding Access

### ❌ Bad: Access Env in Business Logic

```typescript
// room/telegram.ts
export const sendNotification = async (
  env: Env,  // ❌ Don't pass Env to business logic
  message: string
): Promise<boolean> => {
  const response = await fetch(env.TELEGRAM_BOT_TOKEN, { ... });
  return response.ok;
};
```

### ✅ Good: Extract Values at Boundary

```typescript
// RoomDurableObject.ts - Extract at boundary
export class RoomDurableObject {
  private telegramToken: string;

  constructor(state: DurableObjectState, env: Env) {
    this.telegramToken = env.TELEGRAM_BOT_TOKEN;
    this.handlers = createRequestHandlers({
      storage: createStorageOps(state.storage),
      telegramToken: this.telegramToken  // Pass value, not Env
    });
  }
}

// room/telegram.ts - Accept primitives
export const sendNotification = async (
  webhookUrl: string,  // ✅ Primitive value
  message: string
): Promise<boolean> => {
  const response = await fetch(webhookUrl, { ... });
  return response.ok;
};
```

---

## Pattern 6: Alarm Handler Delegation

### ✅ Delegate Cleanup to Handlers

```typescript
// RoomDurableObject.ts
export class RoomDurableObject {
  async alarm(): Promise<void> {
    // Just delegate - no logic
    await this.handlers.cleanup();
  }
}

// room/request-handlers.ts
export const createRequestHandlers = (deps: HandlerDependencies) => ({
  cleanup: async (): Promise<Result<void>> => {
    // Close WebSockets
    deps.websocket.closeAll(1000, 'Room expired');

    // Delete storage
    const deleteResult = await deps.storage.deleteAll();
    if (!deleteResult.success) return deleteResult;

    // Delete alarm
    await deps.storage.deleteAlarm();

    return success(undefined);
  }
});
```

---

## Pattern 7: Type-Safe Request Routing

### ✅ Use Discriminated Unions for Routes

```typescript
// types.ts
type RouteHandler =
  | { type: 'create_room'; body: CreateRoomRequest }
  | { type: 'add_wallet'; body: AddWalletRequest }
  | { type: 'remove_wallet'; address: string };

// RoomDurableObject.ts
async fetch(request: Request): Promise<Response> {
  const route = this.parseRoute(request);

  switch (route.type) {
    case 'create_room':
      const result = await this.handlers.createRoom(route.body);
      return this.toResponse(result, 201);

    case 'add_wallet':
      const result = await this.handlers.addWallet(route.body);
      return this.toResponse(result, 201);

    case 'remove_wallet':
      const result = await this.handlers.removeWallet(route.address);
      return this.toResponse(result);

    default:
      return new Response('Not Found', { status: 404 });
  }
}
```

---

## Testing Strategies

### Test Functional Modules (Easy)

```typescript
// ✅ Test pure functions
describe('validateWalletAddress', () => {
  it('should validate correct address', () => {
    const result = validateWalletAddress('0xabc...');
    expect(result.success).toBe(true);
  });
});

// ✅ Test factories with mocks
describe('createStorageOps', () => {
  it('should add wallet to storage', async () => {
    const mockStorage = {
      get: jest.fn().mockResolvedValue([]),
      put: jest.fn().mockResolvedValue(undefined)
    };

    const ops = createStorageOps(mockStorage as any);
    const result = await ops.addWallet('0xabc...');

    expect(result.success).toBe(true);
    expect(mockStorage.put).toHaveBeenCalledWith('wallets', ['0xabc...']);
  });
});
```

### Test DO Wrapper (Integration)

```typescript
// ✅ Test routing and delegation
describe('RoomDurableObject', () => {
  it('should route POST /wallets to handler', async () => {
    const mockState = createMockDurableObjectState();
    const mockEnv = { TELEGRAM_BOT_TOKEN: 'token' };

    const room = new RoomDurableObject(mockState, mockEnv);

    const request = new Request('http://test/wallets', {
      method: 'POST',
      body: JSON.stringify({ address: '0xabc...', label: 'Test' })
    });

    const response = await room.fetch(request);
    expect(response.status).toBe(201);
  });
});
```

---

## Edge Runtime Constraints

### What Doesn't Work in Workers

```typescript
// ❌ Node.js APIs
import fs from 'fs';              // NOT AVAILABLE
import { readFile } from 'fs/promises';  // NOT AVAILABLE
const crypto = require('crypto'); // NOT AVAILABLE

// ✅ Use Web Standard APIs
const data = await fetch('...');  // WORKS
crypto.subtle.sign(...);          // WORKS (Web Crypto API)
```

### What to Use Instead

| Don't Use | Use Instead |
|-----------|-------------|
| `fs.readFile` | `fetch()` or KV storage |
| `crypto.createHmac` | `crypto.subtle.sign()` |
| `process.env.VAR` | `env.VAR` (binding) |
| `setTimeout` | `ctx.waitUntil()` |
| `Buffer` | `Uint8Array` or `TextEncoder` |

---

## Performance Best Practices

### 1. Minimize Storage Operations

```typescript
// ❌ Bad: Multiple storage calls
const wallets = await storage.get('wallets');
const labels = await storage.get('labels');
const config = await storage.get('config');

// ✅ Good: Batch with getMultiple
const data = await storage.get(['wallets', 'labels', 'config']);
```

### 2. Use WebSocket Hibernation

```typescript
// ✅ Enable hibernation for cost savings
constructor(state: DurableObjectState, env: Env) {
  // In production runtime (not local dev)
  state.setWebSocketAutoResponse(
    new WebSocketRequestResponsePair(
      JSON.stringify({ type: 'ping' }),
      JSON.stringify({ type: 'pong' })
    )
  );
}
```

### 3. Leverage Alarms for Scheduled Tasks

```typescript
// ✅ Use alarms instead of setInterval
constructor(state: DurableObjectState, env: Env) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  state.storage.setAlarm(expiresAt);
}

async alarm(): Promise<void> {
  await this.handlers.cleanup();
}
```

---

## Migration Checklist

When refactoring a Durable Object to this pattern:

- [ ] Extract all validation to pure functions
- [ ] Create storage factory with injected DurableObjectStorage
- [ ] Create WebSocket manager factory with closure
- [ ] Move business logic to request handlers
- [ ] Keep DO class under 250 lines
- [ ] Ensure DO only does routing and delegation
- [ ] Add unit tests for all functional modules
- [ ] Add integration tests for DO routing
- [ ] Verify TypeScript compilation passes
- [ ] Document any platform-specific constraints

---

## Conclusion

Cloudflare Workers and Durable Objects require classes, but we can still maintain our function-first architecture:

1. **Keep classes minimal** - routing and delegation only
2. **Extract all logic** to functional modules
3. **Use factories with DI** for stateful operations
4. **Test functions separately** from platform code
5. **Document constraints** when platform forces design

This approach gives us:
- ✅ Testability (mock-free unit tests)
- ✅ Reusability (functions work anywhere)
- ✅ Maintainability (clear separation)
- ✅ Performance (optimized for edge runtime)

**Result:** Clean architecture that works with platform constraints, not against them.
