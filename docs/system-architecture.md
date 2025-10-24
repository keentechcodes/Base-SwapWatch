# SwapWatch System Architecture

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLOUDFLARE EDGE                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌──────────────────┐          ┌──────────────────┐         ┌──────────────────┐   │
│  │                  │          │                  │         │                  │   │
│  │  Pages (CDN)     │          │  Workers (API)   │         │  Durable Objects │   │
│  │  *.pages.dev     │─────────▶│  api.swapwatch   │────────▶│  (Stateful)      │   │
│  │                  │  HTTP/WS │                  │  RPC    │                  │   │
│  │  - Next.js App   │          │  - Route Handler │         │  - Room State    │   │
│  │  - Static Assets │          │  - CORS          │         │  - WebSockets    │   │
│  │  - React UI      │          │  - Auth          │         │  - Storage       │   │
│  └──────────────────┘          └──────────────────┘         └──────────────────┘   │
│           │                            │                             │               │
│           │                            │                             │               │
│  ┌────────▼──────────────────────────▼─────────────────────────────▼────────────┐  │
│  │                            KV NAMESPACES                                      │  │
│  ├───────────────────────────────────────────────────────────────────────────────┤  │
│  │  ROOM_INDEX: wallet → roomCode mapping (for swap routing)                    │  │
│  │  TELEGRAM_CREDENTIALS: bot tokens and chat IDs                               │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────────┐
│  Coinbase CDP    │──────▶ Webhooks ──────▶ Workers ──────▶ Durable Objects
│  (Swap Events)   │
└──────────────────┘

┌──────────────────┐
│  Telegram Bot    │◀────── Notifications ◀── Durable Objects
│  (Alerts)        │
└──────────────────┘
```

## Data Flow Diagram

```
┌─────────────────────────── SWAP EVENT FLOW ────────────────────────────┐
│                                                                         │
│  1. CDP Webhook       2. Worker Routes      3. DO Processes           │
│     ┌─────┐              ┌─────┐               ┌─────┐                │
│     │Swap │─────POST────▶│Route│──────RPC─────▶│Room │                │
│     │Event│              │ /   │               │ DO  │                │
│     └─────┘              └─────┘               └─────┘                │
│                               │                     │                  │
│                          4. Index               5. Store               │
│                          ┌─────┐               ┌─────┐                │
│                          │ KV  │◀──────────────│ DO  │                │
│                          │Index│               │Store│                │
│                          └─────┘               └─────┘                │
│                                                     │                  │
│                                              6. Broadcast              │
│                                              ┌──────────┐              │
│                                              │WebSocket │──────▶Clients│
│                                              └──────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Storage Types Comparison

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE STORAGE COMPARISON                           │
├──────────────┬─────────────────┬──────────────────┬───────────────────────────┤
│ Type         │ Durable Objects │ KV Store         │ Cache API                 │
├──────────────┼─────────────────┼──────────────────┼───────────────────────────┤
│ Purpose      │ Stateful Logic  │ Key-Value Store  │ Temporary Cache           │
│ Consistency  │ Strong          │ Eventual         │ None                      │
│ Latency      │ ~0ms (in DO)    │ ~10ms read       │ ~1ms                      │
│ Persistence  │ Permanent       │ Permanent        │ Temporary (TTL)           │
│ Scope        │ Per DO Instance │ Global           │ Per Colo/Region           │
│ Use Case     │ Room State      │ Indexes          │ API Responses             │
│              │ WebSockets      │ Config           │ Static Assets             │
│              │ Transactions    │ Lookups          │                           │
├──────────────┼─────────────────┼──────────────────┼───────────────────────────┤
│ Pricing      │ $0.20/GB-month  │ $0.50/GB-month   │ Free                      │
│              │ 128KB free/DO   │ 100k reads free  │                           │
└──────────────┴─────────────────┴──────────────────┴───────────────────────────┘
```

## Current Request Flows

### 1. Add Wallet Flow
```
User ──────▶ Frontend ─────▶ Worker ─────▶ Durable Object
                │               │               │
                │          POST /rooms/         │
                │          {code}/wallets       │
                │               │               ▼
                │               │          Store in DO
                │               │               │
                │               ▼               │
                │          Update KV           │
                │          ROOM_INDEX          │
                │               │               │
                │               ▼               ▼
                │          Update CDP      Broadcast
                │          Webhook         via WebSocket
                │               │               │
                ◀───────────────────────────────┘
```

### 2. Swap Event Flow (Current - BROKEN)
```
CDP Webhook ───▶ Worker ───▶ Find Room ───▶ Durable Object
                    │         (KV Index)          │
                    │              │              ▼
                    │              │         Store Swap (??)
                    │              │              │
                    │              │              ▼
                    │              │         Broadcast WS
                    │              │              │
                    ▼              ▼              ▼
                 Response       Updated        Clients
```

### 3. Load Room Flow (Current - BROKEN)
```
User ───▶ Frontend ───▶ GET /rooms/{code} ───▶ Worker ───▶ DO
              │                                    │        │
              │                                    │        ▼
              ▼                                    │    Get State
         GET /rooms/{code}/swaps (??)              │        │
              │                                    ▼        ▼
              ▼                                 Response  Return
         Empty Response                            │        │
              │                                    ◀────────┘
              ◀─────────────────────────────────────┘
```

## Problem Analysis

### Current Issues:

1. **Swap Persistence Not Working**
   - Code exists but swaps return empty
   - GET /rooms/{code}/swaps endpoint may not be properly connected
   - DO storage might not be persisting correctly

2. **Viewer Count Stuck at 1**
   - Presence tracking not incrementing
   - WebSocket connection state not properly managed

3. **Architecture Concerns**
   - No clear separation between data and business logic
   - Direct DO access from Worker makes testing difficult
   - No type safety across Worker-DO boundary

## Proposed tRPC Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         IMPROVED ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Frontend                    tRPC Router                Service Layer   │
│  ┌──────────┐               ┌──────────┐              ┌──────────┐     │
│  │          │               │          │              │          │     │
│  │  React   │──tRPC Query──▶│  Router  │─────────────▶│ Services │     │
│  │  + tRPC  │               │          │              │          │     │
│  │  Client  │◀──Type Safe───│  - rooms │◀─────────────│  - Room  │     │
│  │          │               │  - swaps │              │  - Swap  │     │
│  └──────────┘               │  - stats │              │  - Stats │     │
│                             └──────────┘              └──────────┘     │
│                                  │                         │            │
│                                  ▼                         ▼            │
│                          Repository Layer         Storage Abstraction   │
│                          ┌──────────────┐         ┌──────────────┐     │
│                          │              │         │              │     │
│                          │ Repositories │────────▶│   Storage    │     │
│                          │              │         │  Providers   │     │
│                          │ - RoomRepo   │         │              │     │
│                          │ - SwapRepo   │         │ - DO Storage │     │
│                          │ - WalletRepo │         │ - KV Store   │     │
│                          │              │         │ - Cache      │     │
│                          └──────────────┘         └──────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Benefits of tRPC Approach:

1. **Type Safety**: End-to-end TypeScript types
2. **Testing**: Each layer can be tested independently
3. **Separation of Concerns**: Clear boundaries between layers
4. **Caching**: Built-in query caching with React Query
5. **Error Handling**: Consistent error handling across the app

## Repository Pattern Example

```typescript
// Domain Models
interface Swap {
  id: string;
  roomCode: string;
  wallet: string;
  tokenIn: Token;
  tokenOut: Token;
  amountInUsd: number;
  timestamp: number;
  txHash: string;
}

// Repository Interface
interface SwapRepository {
  save(swap: Swap): Promise<void>;
  findByRoom(roomCode: string, limit?: number): Promise<Swap[]>;
  findByWallet(wallet: string, limit?: number): Promise<Swap[]>;
  deleteOlderThan(timestamp: number): Promise<number>;
}

// Implementation
class DurableObjectSwapRepository implements SwapRepository {
  constructor(private state: DurableObjectState) {}

  async save(swap: Swap): Promise<void> {
    const key = `swap:${swap.timestamp}:${swap.txHash}`;
    await this.state.storage.put(key, swap);
  }

  async findByRoom(roomCode: string, limit = 100): Promise<Swap[]> {
    const swaps = await this.state.storage.list<Swap>({
      prefix: 'swap:',
      limit
    });
    return Array.from(swaps.values());
  }
}

// Service Layer
class SwapService {
  constructor(private swapRepo: SwapRepository) {}

  async processSwap(swapData: SwapEventData): Promise<Swap> {
    const swap = this.transformToSwap(swapData);
    await this.swapRepo.save(swap);
    await this.broadcastSwap(swap);
    return swap;
  }

  async getRecentSwaps(roomCode: string): Promise<Swap[]> {
    return this.swapRepo.findByRoom(roomCode, 100);
  }
}

// tRPC Router
const swapRouter = router({
  list: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.swapService.getRecentSwaps(input.roomCode);
    }),

  subscribe: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .subscription(async ({ input, ctx }) => {
      // WebSocket subscription logic
    })
});
```

## Next Steps

1. **Debug Current Implementation**
   - Check if GET /rooms/{code}/swaps is actually deployed
   - Verify DO storage is persisting
   - Fix presence tracking

2. **Consider Architecture Migration**
   - Implement tRPC for type safety
   - Add repository pattern for data access
   - Create proper service layer

3. **Testing Strategy**
   - Unit tests for repositories
   - Integration tests for services
   - E2E tests for critical flows