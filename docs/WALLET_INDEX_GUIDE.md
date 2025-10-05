# Wallet Index Implementation Guide

## Overview

The wallet index is a bi-directional mapping system that efficiently routes webhook events to the appropriate rooms. It uses Cloudflare KV storage for persistence and fast lookups.

## Index Structure

### KV Schema

```
# Wallet to rooms mapping
wallet:{address} → {
  "rooms": ["ROOM-ABC", "ROOM-XYZ"],
  "lastUpdated": 1759680210596
}

# Room to wallets mapping
room:{roomCode}:wallets → {
  "wallets": ["0x123...", "0x456..."],
  "lastUpdated": 1759680210596
}
```

### Example Data

```json
// Key: wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb7
{
  "rooms": ["CRYPTO-WHALES", "BASE-DEGENS", "MY-WATCHLIST"],
  "lastUpdated": 1759680210596
}

// Key: room:CRYPTO-WHALES:wallets
{
  "wallets": [
    "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
    "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"
  ],
  "lastUpdated": 1759680210596
}
```

## Core Operations

### Adding a Wallet to a Room

```typescript
async function addWalletToRoom(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string
): Promise<void> {
  const normalizedWallet = walletAddress.toLowerCase();

  // 1. Update wallet → rooms index
  const walletKey = `wallet:${normalizedWallet}`;
  const existing = await kv.get<WalletIndexEntry>(walletKey, 'json');

  if (existing) {
    if (!existing.rooms.includes(roomCode)) {
      existing.rooms.push(roomCode);
      existing.lastUpdated = Date.now();
      await kv.put(walletKey, JSON.stringify(existing));
    }
  } else {
    await kv.put(walletKey, JSON.stringify({
      rooms: [roomCode],
      lastUpdated: Date.now()
    }));
  }

  // 2. Update room → wallets index
  const roomKey = `room:${roomCode}:wallets`;
  const roomEntry = await kv.get<RoomWalletsEntry>(roomKey, 'json');

  if (roomEntry) {
    if (!roomEntry.wallets.includes(normalizedWallet)) {
      roomEntry.wallets.push(normalizedWallet);
      roomEntry.lastUpdated = Date.now();
      await kv.put(roomKey, JSON.stringify(roomEntry));
    }
  } else {
    await kv.put(roomKey, JSON.stringify({
      wallets: [normalizedWallet],
      lastUpdated: Date.now()
    }));
  }
}
```

### Removing a Wallet from a Room

```typescript
async function removeWalletFromRoom(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string
): Promise<void> {
  const normalizedWallet = walletAddress.toLowerCase();

  // 1. Update wallet → rooms index
  const walletKey = `wallet:${normalizedWallet}`;
  const existing = await kv.get<WalletIndexEntry>(walletKey, 'json');

  if (existing) {
    existing.rooms = existing.rooms.filter(r => r !== roomCode);

    if (existing.rooms.length === 0) {
      // No rooms tracking this wallet anymore
      await kv.delete(walletKey);
    } else {
      existing.lastUpdated = Date.now();
      await kv.put(walletKey, JSON.stringify(existing));
    }
  }

  // 2. Update room → wallets index
  const roomKey = `room:${roomCode}:wallets`;
  const roomEntry = await kv.get<RoomWalletsEntry>(roomKey, 'json');

  if (roomEntry) {
    roomEntry.wallets = roomEntry.wallets.filter(w => w !== normalizedWallet);

    if (roomEntry.wallets.length === 0) {
      await kv.delete(roomKey);
    } else {
      roomEntry.lastUpdated = Date.now();
      await kv.put(roomKey, JSON.stringify(roomEntry));
    }
  }
}
```

### Querying Rooms for a Wallet

```typescript
async function getRoomsForWallet(
  kv: KVNamespace,
  walletAddress: string
): Promise<string[]> {
  const normalizedWallet = walletAddress.toLowerCase();
  const walletKey = `wallet:${normalizedWallet}`;
  const entry = await kv.get<WalletIndexEntry>(walletKey, 'json');

  return entry?.rooms || [];
}
```

### Room Cleanup

When a room expires or is deleted:

```typescript
async function cleanupRoomIndex(
  kv: KVNamespace,
  roomCode: string
): Promise<void> {
  // 1. Get all wallets for this room
  const wallets = await getWalletsForRoom(kv, roomCode);

  // 2. Remove room from each wallet's index
  for (const wallet of wallets) {
    await removeWalletFromRoom(kv, wallet, roomCode);
  }

  // 3. Delete room's wallet list
  await kv.delete(`room:${roomCode}:wallets`);
}
```

## Integration with CDP Webhook Manager

### Automatic Filter Updates

When wallets are added or removed, the system automatically updates CDP webhook filters:

```typescript
export async function onWalletAdded(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string,
  config?: WebhookConfig
): Promise<void> {
  // 1. Update the index
  await addWalletToRoom(kv, walletAddress, roomCode);

  // 2. Update CDP webhook filters
  if (config) {
    const allWallets = await getAllTrackedWallets(kv);
    await updateWebhookFilters(kv, config);
  }
}
```

### Getting All Tracked Wallets

```typescript
async function getAllTrackedWallets(kv: KVNamespace): Promise<string[]> {
  // List all wallet entries in KV
  const walletKeys = await kv.list({ prefix: 'wallet:' });

  const uniqueWallets = new Set<string>();

  for (const key of walletKeys.keys) {
    // Extract wallet address from key
    const walletAddress = key.key.replace('wallet:', '');
    uniqueWallets.add(walletAddress);
  }

  return Array.from(uniqueWallets);
}
```

## Performance Considerations

### Read Performance
- **O(1)** lookups for wallet → rooms mapping
- **O(1)** lookups for room → wallets mapping
- KV reads are cached at edge locations

### Write Performance
- **2 KV writes** per wallet addition/removal
- **Eventual consistency** model (typically < 60 seconds)
- Batch operations when possible

### Scaling Limits
- **KV key size:** Max 512 bytes (plenty for our keys)
- **KV value size:** Max 25 MB (can store thousands of rooms per wallet)
- **KV operations:** 1000 reads/sec, 1000 writes/sec per namespace

## Monitoring & Maintenance

### Viewing Index Status

```bash
# List all tracked wallets
wrangler kv key list --namespace-id YOUR_KV_ID --prefix wallet:

# Get rooms for a specific wallet
wrangler kv key get --namespace-id YOUR_KV_ID wallet:0x742d35cc...

# Get wallets for a specific room
wrangler kv key get --namespace-id YOUR_KV_ID room:CRYPTO-WHALES:wallets

# Count total tracked wallets
wrangler kv key list --namespace-id YOUR_KV_ID --prefix wallet: | jq length
```

### Index Health Check

```javascript
async function checkIndexHealth(kv: KVNamespace): Promise<{
  totalWallets: number;
  totalRooms: number;
  orphanedWallets: number;
  averageRoomsPerWallet: number;
}> {
  const walletKeys = await kv.list({ prefix: 'wallet:' });
  const roomKeys = await kv.list({ prefix: 'room:' });

  let totalRoomCount = 0;
  let orphanedCount = 0;

  for (const key of walletKeys.keys) {
    const entry = await kv.get<WalletIndexEntry>(key.key, 'json');
    if (!entry || entry.rooms.length === 0) {
      orphanedCount++;
    } else {
      totalRoomCount += entry.rooms.length;
    }
  }

  return {
    totalWallets: walletKeys.keys.length,
    totalRooms: roomKeys.keys.length,
    orphanedWallets: orphanedCount,
    averageRoomsPerWallet: totalRoomCount / walletKeys.keys.length
  };
}
```

### Manual Index Rebuild

If the index becomes corrupted, it can be rebuilt from Durable Object states:

```javascript
async function rebuildIndex(env: Env): Promise<void> {
  // 1. Clear existing index
  await clearAllIndexEntries(env.ROOM_INDEX);

  // 2. List all room Durable Objects
  const rooms = await listAllRooms(env.ROOMS);

  // 3. For each room, get wallets and rebuild index
  for (const roomCode of rooms) {
    const roomId = env.ROOMS.idFromName(roomCode);
    const roomStub = env.ROOMS.get(roomId);

    const response = await roomStub.fetch(
      new Request('https://internal/wallets', { method: 'GET' })
    );

    const { wallets } = await response.json();

    for (const wallet of wallets) {
      await addWalletToRoom(env.ROOM_INDEX, wallet.address, roomCode);
    }
  }
}
```

## Error Handling

### Race Conditions

The system handles race conditions gracefully:
- **Duplicate additions:** Idempotent operations (no duplicates added)
- **Concurrent updates:** Last write wins
- **Deletion during update:** Graceful handling of missing entries

### Failure Recovery

```typescript
async function safeAddWallet(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string,
  retries = 3
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      await addWalletToRoom(kv, walletAddress, roomCode);
      return true;
    } catch (error) {
      console.error(`Failed to add wallet (attempt ${i + 1}):`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  return false;
}
```

## Best Practices

### 1. Always Normalize Addresses
```typescript
const normalized = walletAddress.toLowerCase();
```

### 2. Use Batch Operations
```typescript
// Instead of multiple individual updates
for (const wallet of wallets) {
  await addWalletToRoom(kv, wallet, roomCode);
}

// Consider batching
await Promise.all(
  wallets.map(wallet => addWalletToRoom(kv, wallet, roomCode))
);
```

### 3. Include Timestamps
Helps with debugging and cleanup:
```typescript
{
  "rooms": ["ROOM-ABC"],
  "lastUpdated": Date.now(),
  "firstAdded": Date.now()
}
```

### 4. Implement TTL for Cleanup
```typescript
// Cleanup entries older than 30 days
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
if (Date.now() - entry.lastUpdated > THIRTY_DAYS) {
  await kv.delete(key);
}
```

## Testing

### Unit Tests

```typescript
describe('Wallet Index', () => {
  it('should add wallet to room', async () => {
    const kv = createMockKV();
    await addWalletToRoom(kv, '0x123...', 'ROOM-ABC');

    const rooms = await getRoomsForWallet(kv, '0x123...');
    expect(rooms).toContain('ROOM-ABC');
  });

  it('should handle duplicate additions', async () => {
    const kv = createMockKV();
    await addWalletToRoom(kv, '0x123...', 'ROOM-ABC');
    await addWalletToRoom(kv, '0x123...', 'ROOM-ABC');

    const rooms = await getRoomsForWallet(kv, '0x123...');
    expect(rooms).toEqual(['ROOM-ABC']); // No duplicates
  });

  it('should remove wallet from room', async () => {
    const kv = createMockKV();
    await addWalletToRoom(kv, '0x123...', 'ROOM-ABC');
    await removeWalletFromRoom(kv, '0x123...', 'ROOM-ABC');

    const rooms = await getRoomsForWallet(kv, '0x123...');
    expect(rooms).toEqual([]);
  });
});
```

### Integration Tests

```bash
# Create test room
curl -X POST https://api.swapwatch.app/room/TEST/create

# Add wallet
curl -X POST https://api.swapwatch.app/room/TEST/wallets \
  -d '{"address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"}'

# Verify index
wrangler kv key get --namespace-id YOUR_KV_ID \
  wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb7
```

## Troubleshooting

### Common Issues

1. **Wallet not receiving events**
   - Check wallet is normalized (lowercase)
   - Verify index entry exists
   - Ensure room hasn't expired

2. **Duplicate entries in index**
   - Run deduplication script
   - Check for race conditions in code

3. **Index out of sync**
   - Compare with Durable Object state
   - Run index rebuild if necessary

### Debug Commands

```bash
# Check specific wallet
wrangler kv key get --namespace-id YOUR_KV_ID wallet:0x...

# List all rooms
wrangler kv key list --namespace-id YOUR_KV_ID --prefix room: | grep -v wallets

# Count entries
wrangler kv key list --namespace-id YOUR_KV_ID | jq length

# Export index for analysis
wrangler kv bulk get --namespace-id YOUR_KV_ID > index-backup.json
```

## Future Improvements

1. **Index Sharding:** Split across multiple KV namespaces for scale
2. **Caching Layer:** Add edge caching for hot wallets
3. **Compression:** Compress large wallet lists
4. **Analytics:** Track most active wallets/rooms
5. **Automatic Cleanup:** Background job for expired entries