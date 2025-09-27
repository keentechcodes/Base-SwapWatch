# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/spec.md

> Created: 2025-09-27
> Version: 1.0.0

## Endpoints

### Worker Routes

#### POST /webhook/coinbase
**Purpose:** Receive and process Coinbase CDP webhook events
**Headers:**
- `X-Webhook-Signature`: HMAC signature for verification
- `Content-Type`: application/json
**Body:** WebhookEvent from Coinbase
**Response:** `{ status: 'ok', processed: boolean, rooms: string[] }`
**Process:**
1. Verify webhook signature using Web Crypto API
2. Parse swap data from event
3. Get all active room IDs from KV
4. Check each room's tracked wallets via Durable Object RPC
5. Enrich swap data if matches found
6. Broadcast to matched rooms
**Errors:** 401 (invalid signature), 400 (invalid payload), 500 (processing error)

### Durable Object Routes

#### GET /room/:code
**Purpose:** Get room information and WebSocket URL
**Parameters:**
- `code`: 5-character room code
**Response:**
```json
{
  "code": "TREK23",
  "websocketUrl": "wss://api.swapwatch.app/room/TREK23/ws",
  "wallets": ["0x..."],
  "labels": { "0x...": "Whale 1" },
  "stats": {
    "swaps24h": 145,
    "volume24h": 234567.89,
    "viewers": 5
  },
  "expiresAt": "2025-09-28T12:00:00Z"
}
```
**Errors:** 404 (room not found), 410 (room expired)

#### POST /room/create
**Purpose:** Create a new room with optional custom code
**Body:**
```json
{
  "customCode": "MOON5" // optional
}
```
**Response:**
```json
{
  "code": "MOON5",
  "websocketUrl": "wss://api.swapwatch.app/room/MOON5/ws",
  "expiresAt": "2025-09-28T12:00:00Z"
}
```
**Errors:** 409 (code already exists), 400 (invalid code format)

#### POST /room/:code/wallet
**Purpose:** Add wallet to room tracking
**Parameters:**
- `code`: Room code
**Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
  "label": "Smart Money #1" // optional
}
```
**Response:**
```json
{
  "success": true,
  "walletCount": 12
}
```
**Errors:** 404 (room not found), 400 (invalid address), 429 (wallet limit exceeded)

#### DELETE /room/:code/wallet/:address
**Purpose:** Remove wallet from tracking
**Parameters:**
- `code`: Room code
- `address`: Wallet address to remove
**Response:** `{ success: true, walletCount: 11 }`
**Errors:** 404 (room or wallet not found)

#### GET /room/:code/swaps
**Purpose:** Get historical swaps for room
**Parameters:**
- `code`: Room code
**Query Parameters:**
- `limit`: Number of swaps (default: 50, max: 200)
- `offset`: Pagination offset
**Response:**
```json
{
  "swaps": [
    {
      "id": "swap_123",
      "timestamp": "2025-09-27T10:30:00Z",
      "wallet": "0x...",
      "tokenIn": "USDC",
      "tokenOut": "BRETT",
      "amountInUsd": 1234.56,
      "amountOutUsd": 1289.43,
      "priceImpact": 0.044,
      "txHash": "0x...",
      "dex": "Uniswap V3"
    }
  ],
  "total": 145,
  "hasMore": true
}
```
**Errors:** 404 (room not found)

#### POST /room/:code/telegram
**Purpose:** Configure Telegram notifications
**Parameters:**
- `code`: Room code
**Body:**
```json
{
  "webhookUrl": "https://api.telegram.org/bot.../sendMessage",
  "chatId": "-123456789",
  "threshold": 1000
}
```
**Response:** `{ success: true, testSent: true }`
**Errors:** 404 (room not found), 400 (invalid webhook URL)

### WebSocket Protocol

#### Connection: wss://api.swapwatch.app/room/:code/ws

**Client → Server Messages:**
```typescript
// Add wallet
{
  "type": "ADD_WALLET",
  "address": "0x...",
  "label": "Whale 1"
}

// Remove wallet
{
  "type": "REMOVE_WALLET",
  "address": "0x..."
}

// Request sync
{
  "type": "SYNC"
}
```

**Server → Client Messages:**
```typescript
// New swap event
{
  "type": "SWAP",
  "data": {
    "id": "swap_456",
    "timestamp": 1703667600000,
    "wallet": "0x...",
    "walletLabel": "Whale 1",
    "tokenIn": "USDC",
    "tokenOut": "BRETT",
    "amountIn": "1000",
    "amountOut": "950",
    "amountInUsd": 1000,
    "amountOutUsd": 1045,
    "priceImpact": 0.045,
    "gasUsd": 2.34,
    "txHash": "0x...",
    "dex": "Aerodrome"
  }
}

// Wallet update
{
  "type": "WALLET_UPDATE",
  "action": "added" | "removed",
  "address": "0x...",
  "label": "Smart Money",
  "walletCount": 15
}

// Presence update
{
  "type": "PRESENCE",
  "viewers": 8
}

// Room expiring warning
{
  "type": "EXPIRING",
  "expiresAt": "2025-09-28T12:00:00Z",
  "minutesRemaining": 30
}
```

## Rate Limiting

All endpoints enforce rate limits using Cloudflare's built-in rate limiting:

- Room creation: 10 per hour per IP
- Wallet operations: 100 per hour per room
- Swap queries: 1000 per hour per room
- WebSocket connections: 5 per IP
- Webhook processing: No limit (trusted source)

## Error Response Format

All errors return consistent JSON:
```json
{
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room with code TREK23 not found",
    "details": {} // optional additional context
  }
}
```

## Durable Object RPC Methods

Internal methods callable between Workers and Durable Objects:

```typescript
// Check if wallet is tracked
async isWalletTracked(wallet: string): Promise<boolean>

// Get room statistics
async getStats(): Promise<RoomStats>

// Broadcast swap to all connections
async broadcastSwap(swap: EnrichedSwapEvent): Promise<void>

// Schedule room expiration
async scheduleExpiration(): Promise<void>

// Get all tracked wallets
async getWallets(): Promise<string[]>
```