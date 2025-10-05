# SwapWatch API Documentation

## Base URLs

- **Production:** `https://api.swapwatch.app`
- **Staging:** `https://staging-api.swapwatch.app`

## Authentication

Currently, the API is public. Future versions may require API keys for certain operations.

## Endpoints

### Health Check

#### `GET /health`

Check if the API is operational.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1759680210596
}
```

---

### Room Management

#### `POST /room/{roomCode}/create`

Create a new room for tracking wallets.

**Parameters:**
- `roomCode` (path): Unique identifier for the room (alphanumeric, max 20 chars)

**Request Body:**
```json
{
  "threshold": 1000,              // Optional: Minimum USD value for notifications
  "telegramWebhook": "https://...", // Optional: Telegram webhook URL
  "expiresIn": 24                 // Optional: Hours until room expires (default: 24)
}
```

**Response (201):**
```json
{
  "roomCode": "ROOM-ABC",
  "createdAt": 1759680210596,
  "expiresAt": 1759766610596,
  "threshold": 1000,
  "wallets": []
}
```

**Error Responses:**
- `400`: Invalid room code or parameters
- `409`: Room already exists

---

#### `POST /room/{roomCode}/extend`

Extend the expiration time of an existing room.

**Parameters:**
- `roomCode` (path): Room identifier

**Request Body:**
```json
{
  "hours": 24  // Additional hours to extend (max: 168)
}
```

**Response (200):**
```json
{
  "expiresAt": 1759853010596
}
```

---

#### `GET /room/{roomCode}/wallets`

Get all wallets being tracked in a room.

**Parameters:**
- `roomCode` (path): Room identifier

**Response (200):**
```json
{
  "wallets": [
    {
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
      "label": "Main Wallet",
      "addedAt": 1759680210596
    },
    {
      "address": "0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed",
      "label": null,
      "addedAt": 1759680310596
    }
  ]
}
```

---

#### `POST /room/{roomCode}/wallets`

Add a wallet to track in the room.

**Parameters:**
- `roomCode` (path): Room identifier

**Request Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
  "label": "Main Wallet"  // Optional: Display name for wallet
}
```

**Response (201):**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
  "label": "Main Wallet",
  "addedAt": 1759680210596
}
```

**Error Responses:**
- `400`: Invalid wallet address
- `409`: Wallet already exists in room
- `422`: Room wallet limit reached (20)

**Side Effects:**
1. Updates KV wallet index
2. Updates CDP webhook filters (if configured)
3. Broadcasts to WebSocket clients

---

#### `DELETE /room/{roomCode}/wallets/{address}`

Remove a wallet from tracking.

**Parameters:**
- `roomCode` (path): Room identifier
- `address` (path): Wallet address to remove

**Response (204):**
No content

**Error Responses:**
- `404`: Wallet not found in room

**Side Effects:**
1. Updates KV wallet index
2. Updates CDP webhook filters (if configured)
3. Broadcasts to WebSocket clients

---

#### `PATCH /room/{roomCode}/wallets/{address}`

Update wallet label.

**Parameters:**
- `roomCode` (path): Room identifier
- `address` (path): Wallet address

**Request Body:**
```json
{
  "label": "Updated Label"
}
```

**Response (200):**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
  "label": "Updated Label",
  "addedAt": 1759680210596
}
```

---

#### `GET /room/{roomCode}/config`

Get room configuration.

**Parameters:**
- `roomCode` (path): Room identifier

**Response (200):**
```json
{
  "threshold": 1000,
  "telegramWebhook": "https://...",
  "createdAt": 1759680210596,
  "expiresAt": 1759766610596,
  "createdBy": "user-id"
}
```

---

#### `PUT /room/{roomCode}/config`

Update room configuration.

**Parameters:**
- `roomCode` (path): Room identifier

**Request Body:**
```json
{
  "threshold": 5000,
  "telegramWebhook": "https://new-webhook-url"
}
```

**Response (200):**
```json
{
  "threshold": 5000,
  "telegramWebhook": "https://new-webhook-url",
  "createdAt": 1759680210596,
  "expiresAt": 1759766610596
}
```

---

#### `GET /room/{roomCode}/presence`

Get current viewer count for the room.

**Parameters:**
- `roomCode` (path): Room identifier

**Response (200):**
```json
{
  "viewers": 5,
  "connections": 3
}
```

---

### WebSocket Connection

#### `GET /room/{roomCode}/websocket`

Establish WebSocket connection for real-time updates.

**Parameters:**
- `roomCode` (path): Room identifier

**Headers:**
- `Upgrade`: websocket
- `Connection`: Upgrade

**Messages (Client → Server):**
```json
// Subscribe to updates
{
  "type": "subscribe",
  "data": {
    "events": ["swaps", "wallets", "presence"]
  }
}

// Ping (keep-alive)
{
  "type": "ping"
}
```

**Messages (Server → Client):**
```json
// Swap event
{
  "type": "swap",
  "data": {
    "txHash": "0x...",
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    "to": "0x...",
    "valueUSD": 1500,
    "tokens": {
      "in": { "symbol": "USDC", "amount": "1500" },
      "out": { "symbol": "ETH", "amount": "0.5" }
    },
    "timestamp": 1759680210596
  }
}

// Wallet added
{
  "type": "wallet_added",
  "data": {
    "address": "0x...",
    "label": "New Wallet"
  }
}

// Wallet removed
{
  "type": "wallet_removed",
  "data": {
    "address": "0x..."
  }
}

// Presence update
{
  "type": "presence",
  "data": {
    "viewers": 5
  }
}

// Pong (keep-alive response)
{
  "type": "pong"
}
```

---

### Webhook Endpoints

#### `POST /webhook/coinbase`

Receive swap events from Coinbase CDP.

**Headers:**
- `x-webhook-signature`: HMAC-SHA256 signature
- `Content-Type`: application/json

**Request Body:**
Coinbase CDP webhook payload (varies by event type)

**Response (200):**
```json
{
  "status": "processed",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
  "roomsNotified": 2,
  "totalRooms": 2,
  "details": [
    { "roomCode": "ROOM-ABC", "status": "notified" },
    { "roomCode": "ROOM-XYZ", "status": "notified" }
  ]
}
```

**Response (200 - No rooms tracking):**
```json
{
  "status": "ignored",
  "walletAddress": "0x...",
  "message": "No rooms tracking this wallet"
}
```

**Error Responses:**
- `401`: Missing or invalid signature
- `500`: Processing error

**Processing Flow:**
1. Verify HMAC signature
2. Extract wallet address from event
3. Query KV index for rooms tracking this wallet
4. Notify each room via Durable Object RPC
5. Rooms broadcast to WebSocket clients
6. Send Telegram notifications if configured

---

## Error Responses

All endpoints may return these standard error responses:

### `400 Bad Request`
```json
{
  "error": "Invalid parameters",
  "message": "Room code must be alphanumeric"
}
```

### `401 Unauthorized`
```json
{
  "error": "Unauthorized",
  "message": "Invalid signature"
}
```

### `404 Not Found`
```json
{
  "error": "Not found",
  "message": "Room does not exist"
}
```

### `422 Unprocessable Entity`
```json
{
  "error": "Validation failed",
  "message": "Maximum wallet limit (20) reached"
}
```

### `500 Internal Server Error`
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limits

Currently, there are no explicit rate limits. However:
- Cloudflare Workers have automatic DDoS protection
- KV operations have natural rate limiting
- CDP webhooks have their own rate limits

Future versions may implement:
- 100 requests/minute per IP
- 20 wallet additions/minute per room
- 1000 WebSocket messages/minute per connection

---

## CORS Policy

The API supports CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

This allows the API to be called from any web application.

---

## Webhook Security

### Signature Verification

All webhook requests must include a valid HMAC-SHA256 signature:

```javascript
const signature = request.headers.get('x-webhook-signature');
const expectedSignature = hmacSha256(requestBody, webhookSecret);
if (signature !== expectedSignature) {
  return new Response('Unauthorized', { status: 401 });
}
```

### Webhook Secret Rotation

To rotate the webhook secret:
1. Generate new secret
2. Update Wrangler secret: `wrangler secret put COINBASE_WEBHOOK_SECRET`
3. Update CDP webhook configuration
4. Deploy Worker update

---

## SDK Examples

### JavaScript/TypeScript

```typescript
// Create a room
const response = await fetch('https://api.swapwatch.app/room/MYROOM/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ threshold: 1000 })
});

// Add a wallet
await fetch('https://api.swapwatch.app/room/MYROOM/wallets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
    label: 'Main Wallet'
  })
});

// Connect WebSocket
const ws = new WebSocket('wss://api.swapwatch.app/room/MYROOM/websocket');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Python

```python
import requests
import websocket

# Create a room
response = requests.post(
    'https://api.swapwatch.app/room/MYROOM/create',
    json={'threshold': 1000}
)

# Add a wallet
requests.post(
    'https://api.swapwatch.app/room/MYROOM/wallets',
    json={
        'address': '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
        'label': 'Main Wallet'
    }
)

# Connect WebSocket
def on_message(ws, message):
    print(f"Received: {message}")

ws = websocket.WebSocketApp(
    "wss://api.swapwatch.app/room/MYROOM/websocket",
    on_message=on_message
)
ws.run_forever()
```

### cURL

```bash
# Create a room
curl -X POST https://api.swapwatch.app/room/MYROOM/create \
  -H "Content-Type: application/json" \
  -d '{"threshold": 1000}'

# Add a wallet
curl -X POST https://api.swapwatch.app/room/MYROOM/wallets \
  -H "Content-Type: application/json" \
  -d '{"address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7", "label": "Main Wallet"}'

# Get wallets
curl https://api.swapwatch.app/room/MYROOM/wallets
```

---

## Status Codes Summary

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `204 No Content`: Request succeeded with no response body
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `422 Unprocessable Entity`: Validation failed
- `500 Internal Server Error`: Server error

---

## Changelog

### v1.0.0 (Current)
- Initial API release
- Room management endpoints
- Wallet tracking with KV index
- CDP webhook integration
- WebSocket support
- Dynamic filter updates