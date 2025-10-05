# Webhook Architecture Documentation

## Overview

SwapWatch uses a **single webhook endpoint architecture** with dynamic filter management for efficient event processing. This approach balances simplicity, scalability, and cost-effectiveness.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Coinbase CDP                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Webhook Configuration                                   │   │
│  │  - URL: api.swapwatch.app/webhook/coinbase              │   │
│  │  - Filters: [Dynamic wallet list updated via API]       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ Webhook Events
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Worker API (Edge)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /webhook/coinbase endpoint                              │   │
│  │  1. Verify HMAC signature                                │   │
│  │  2. Extract wallet address                               │   │
│  │  3. Query KV index for rooms                           │   │
│  │  4. Route to relevant Durable Objects                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Room ABC   │ │   Room XYZ   │ │   Room 123   │
│  (Durable    │ │  (Durable    │ │  (Durable    │
│   Object)    │ │   Object)    │ │   Object)    │
└──────────────┘ └──────────────┘ └──────────────┘
        │                │                │
        ▼                ▼                ▼
   WebSocket        WebSocket        WebSocket
   Clients          Clients          Clients
```

## Core Components

### 1. Single Webhook Endpoint
- **URL:** `https://api.swapwatch.app/webhook/coinbase`
- **Method:** POST
- **Authentication:** HMAC-SHA256 signature verification
- **Purpose:** Receives all wallet activity events for tracked addresses

### 2. KV Wallet Index
Bi-directional index maintained in Cloudflare KV storage:

```
wallet:0x123... → ["ROOM-ABC", "ROOM-XYZ"]  // Which rooms track this wallet
room:ABC:wallets → ["0x123...", "0x456..."]  // Which wallets are in this room
```

### 3. Dynamic Filter Management
CDP webhook filters are automatically updated when wallets are added/removed:

```javascript
// When wallet is added to room
1. Update Durable Object state
2. Update KV index (wallet → rooms mapping)
3. Call CDP API to update webhook filters
4. Only receive events for actively tracked wallets
```

## Key Design Decisions

### Why Single Webhook?

| Aspect | Single Webhook (Our Choice) | Multiple Webhooks |
|--------|----------------------------|-------------------|
| **Setup Complexity** | Simple - one webhook to manage | Complex - webhook per room |
| **CDP Limits** | No quota issues | May hit webhook limits |
| **Maintenance** | Easy - single configuration | Hard - manage many webhooks |
| **Filtering** | Server-side via KV index | Native CDP filtering |
| **Cost** | Single endpoint, cheap KV lookups | Multiple endpoints |
| **Wallet Sharing** | Easy - wallets in multiple rooms | Complex - duplicate webhooks |

### Why Dynamic Filters?

Without dynamic filters, the webhook would receive ALL Base Mainnet activity. With filters:
- **Reduced Traffic:** Only events for tracked wallets
- **Lower Costs:** Less bandwidth and processing
- **Better Performance:** Faster event processing
- **Privacy:** Only see relevant transactions

## Implementation Details

### Webhook Processing Flow

```javascript
// 1. Receive webhook event
POST /webhook/coinbase
{
  "event_type": "wallet_activity",
  "network": "base-mainnet",
  "from": "0x123...",
  "to": "0x456...",
  ...
}

// 2. Verify signature
const signature = request.headers.get('x-webhook-signature');
const isValid = await verifyWebhookSignature(body, signature, secret);

// 3. Extract wallet address
const walletAddress = extractWalletAddress(event);

// 4. Query KV index
const roomCodes = await getRoomsForWallet(kv, walletAddress);
// Returns: ["ROOM-ABC", "ROOM-XYZ"]

// 5. Notify each room
for (const roomCode of roomCodes) {
  const roomStub = env.ROOMS.get(roomId);
  await roomStub.fetch(notifyRequest);
}
```

### Filter Update Flow

```javascript
// When wallet is added to room
async function handleAddWallet(roomCode, walletAddress) {
  // 1. Update room state (Durable Object)
  await roomStub.addWallet(walletAddress);

  // 2. Update KV index
  await addWalletToRoom(kv, walletAddress, roomCode);

  // 3. Update CDP webhook filters (if configured)
  if (cdpConfig) {
    const allWallets = await getAllTrackedWallets(kv);
    await updateCDPWebhookFilters(allWallets);
  }
}
```

## Security Considerations

### 1. Signature Verification
Every webhook request is verified using HMAC-SHA256:
```javascript
const signature = request.headers.get('x-webhook-signature');
if (!verifySignature(body, signature, secret)) {
  return new Response('Unauthorized', { status: 401 });
}
```

### 2. Credential Storage
- **Local:** Environment variables in `.env`
- **Production:** Wrangler secrets
- **Never:** Hardcoded in source files

### 3. Rate Limiting
- CDP has built-in rate limiting
- Worker can add additional rate limiting if needed
- KV operations are naturally rate-limited

## Performance Optimizations

### 1. KV Index Design
- **Normalized Keys:** All wallet addresses lowercase
- **Fast Lookups:** O(1) KV gets
- **Batch Updates:** When possible, batch KV writes

### 2. Parallel Processing
```javascript
// Process room notifications in parallel
await Promise.all(
  roomCodes.map(async (roomCode) => {
    await notifyRoom(roomCode, event);
  })
);
```

### 3. Edge Computing
- Worker runs at Cloudflare edge locations
- Low latency globally
- Automatic scaling

## Monitoring & Debugging

### 1. Worker Logs
```bash
# Real-time logs
wrangler tail --env production

# Filter for webhook events
wrangler tail --env production | grep webhook
```

### 2. KV Inspection
```bash
# List all tracked wallets
wrangler kv key list --namespace-id YOUR_KV_ID --prefix wallet:

# Get rooms for a wallet
wrangler kv key get --namespace-id YOUR_KV_ID wallet:0x123...
```

### 3. CDP Dashboard
- Monitor webhook delivery status
- View failed attempts
- Check event history

## Failure Handling

### 1. Webhook Delivery Failures
- CDP automatically retries failed webhooks
- Exponential backoff: 1s, 2s, 4s, 8s...
- Maximum 10 retry attempts

### 2. Filter Update Failures
- Non-blocking: Room operations continue even if filter update fails
- Logged for debugging
- Manual recovery via `cdp-webhook-utils.sh`

### 3. KV Index Corruption
- Can rebuild from Durable Object states
- Manual cleanup tools available
- Eventual consistency model

## Scaling Considerations

### Current Limits
- **Wallets per room:** 20 (configurable)
- **Rooms per wallet:** Unlimited
- **Total tracked wallets:** Unlimited (KV can handle millions)
- **Webhook events/second:** 1000+ (Worker auto-scales)

### Future Optimizations
1. **Batch Filter Updates:** Update CDP filters in batches
2. **Index Sharding:** Split KV index across multiple namespaces
3. **Event Queuing:** Use Cloudflare Queues for event processing
4. **Cache Layer:** Add edge caching for frequently accessed data

## Cost Analysis

### Current Architecture Costs
- **Worker Requests:** $0.50 per million requests
- **KV Operations:** $0.50 per million reads, $5.00 per million writes
- **Durable Objects:** $0.15 per million requests
- **Bandwidth:** Included with Cloudflare

### Estimated Monthly Costs (1000 active rooms)
- Worker requests: ~$5
- KV operations: ~$10
- Durable Objects: ~$15
- **Total:** ~$30/month

## Migration Path

If we need to change approaches in the future:

### To Multiple Webhooks
1. Create webhook per room via CDP API
2. Migrate room state to include webhook ID
3. Remove KV index
4. Update routing logic

### To Event Stream
1. Set up Kafka/Kinesis consumer
2. Migrate from webhooks to stream processing
3. Keep KV index for routing
4. Add event deduplication

## Conclusion

The single webhook endpoint with dynamic filter management provides:
- ✅ **Simple setup and maintenance**
- ✅ **Cost-effective scaling**
- ✅ **Flexible wallet-room relationships**
- ✅ **Efficient event routing**
- ✅ **Production-ready reliability**

This architecture balances simplicity with performance, making it ideal for SwapWatch's requirements.