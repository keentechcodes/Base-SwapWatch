# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-27-trpc-ui-integration/spec.md

> Created: 2025-09-27
> Version: 1.0.0

## tRPC Router Structure

### Room Router (`/trpc/room.*`)

#### room.create
**Purpose:** Create a new room with optional custom code
**Input:** `{ customCode?: string }`
**Response:** `{ code: string }`
**Errors:** INVALID_CODE, DUPLICATE_CODE

#### room.join
**Purpose:** Get room details and initial state
**Input:** `{ code: string }`
**Response:** `{ code, wallets, labels, stats, createdAt, expiresAt }`
**Errors:** NOT_FOUND, EXPIRED

#### room.addWallet
**Purpose:** Add wallet address to room tracking list
**Input:** `{ roomCode: string, address: string, label?: string }`
**Response:** `{ success: boolean, room: Room }`
**Errors:** NOT_FOUND, INVALID_ADDRESS, LIMIT_EXCEEDED

#### room.removeWallet
**Purpose:** Remove wallet from tracking
**Input:** `{ roomCode: string, address: string }`
**Response:** `{ success: boolean, room: Room }`
**Errors:** NOT_FOUND, WALLET_NOT_FOUND

#### room.getSwaps
**Purpose:** Retrieve historical swap data for room
**Input:** `{ roomCode: string, limit?: number, offset?: number }`
**Response:** `{ swaps: EnrichedSwapEvent[], total: number }`
**Errors:** NOT_FOUND

#### room.configureTelegram
**Purpose:** Set up Telegram webhook notifications
**Input:** `{ roomCode: string, webhookUrl: string, threshold: number }`
**Response:** `{ success: boolean }`
**Errors:** NOT_FOUND, INVALID_URL

### Subscription Endpoints

#### room.onSwap
**Purpose:** Subscribe to real-time swap events for a room
**Input:** `{ roomCode: string }`
**Stream:** `EnrichedSwapEvent` objects
**Connection:** WebSocket on port 3001

#### room.onWalletUpdate
**Purpose:** Subscribe to wallet add/remove events
**Input:** `{ roomCode: string }`
**Stream:** `{ type: 'added' | 'removed', address: string, label?: string }`

#### room.onPresence
**Purpose:** Track active users in room
**Input:** `{ roomCode: string }`
**Stream:** `{ viewers: number, lastUpdate: Date }`

### Webhook Endpoint (REST)

#### POST /webhook/coinbase
**Purpose:** Receive and process Coinbase CDP webhook events
**Headers:** `X-Webhook-Signature` for verification
**Body:** WebhookEvent object
**Response:** `{ status: 'ok' | 'error', processed: boolean }`
**Process:**
1. Verify webhook signature
2. Parse swap data from event
3. Enrich with market data
4. Match against room wallets
5. Broadcast to subscribers
6. Send Telegram notifications

## Type Definitions

```typescript
interface Room {
  code: string;
  wallets: string[];
  labels: Record<string, string>;
  stats: {
    swaps24h: number;
    volume24h: number;
    topToken: string;
    gasSpent24h: number;
  };
  telegramWebhook?: string;
  telegramThreshold?: number;
  createdAt: Date;
  expiresAt: Date;
}

interface EnrichedSwapEvent {
  // From webhook
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;

  // Swap data
  wallet: string;
  walletLabel?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;

  // Enrichment
  tokenInData: {
    symbol: string;
    name: string;
    decimals: number;
    price: number;
    verified: boolean;
    logo?: string;
  };
  tokenOutData: {
    symbol: string;
    name: string;
    decimals: number;
    price: number;
    verified: boolean;
    logo?: string;
  };
  usdValues: {
    amountInUsd: number;
    amountOutUsd: number;
    priceImpact: number;
    gasUsd: number;
  };
  dexInfo: {
    name: string;
    router: string;
    pair?: string;
  };
}
```

## Error Handling

All tRPC procedures return typed errors using TRPCError:
- `BAD_REQUEST` - Invalid input parameters
- `NOT_FOUND` - Room or resource doesn't exist
- `FORBIDDEN` - Action not allowed
- `INTERNAL_SERVER_ERROR` - Unexpected server error
- `TOO_MANY_REQUESTS` - Rate limiting

## Rate Limiting

- Room creation: 10 per IP per hour
- Wallet additions: 50 per room lifetime
- API queries: 100 per minute per room
- WebSocket connections: 20 per IP