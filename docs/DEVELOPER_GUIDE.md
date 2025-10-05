# SwapWatch Developer Guide

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with Workers enabled
- Coinbase Developer Platform account
- Domain configured in Cloudflare (optional)

### 1. Clone and Install

```bash
git clone https://github.com/keentechcodes/Base-SwapWatch.git
cd Base-SwapWatch
pnpm install
```

### 2. Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your credentials
# Required:
# - CDP_API_KEY_NAME
# - CDP_API_KEY_PRIVATE_KEY
# - CDP_WEBHOOK_ID
# - WEBHOOK_SECRET
```

### 3. Deploy to Cloudflare

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv namespace create ROOM_INDEX

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### 4. Set Production Secrets

```bash
# Run the setup script
./set-production-secrets.sh

# Or manually set each secret
wrangler secret put COINBASE_WEBHOOK_SECRET --env production
wrangler secret put CDP_API_KEY_NAME --env production
wrangler secret put CDP_API_KEY_PRIVATE_KEY --env production
wrangler secret put CDP_WEBHOOK_ID --env production
```

### 5. Configure Coinbase Webhook

1. Go to [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
2. Create a new webhook:
   - URL: `https://api.swapwatch.app/webhook/coinbase`
   - Network: Base Mainnet
   - Event Type: Wallet Activity
3. Save the webhook signature secret

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                  │
│                 Cloudflare Pages                      │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────▼─────────────────────────────┐
│              Worker API (Edge Runtime)                │
│  • Request routing      • Webhook handling            │
│  • CORS management      • Signature verification      │
│  • KV index updates     • CDP filter sync             │
└────────────────────────┬─────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
┌──────────┐      ┌──────────┐       ┌──────────────┐
│  Durable │      │    KV    │       │   Coinbase   │
│  Objects │      │  Storage │       │     CDP      │
│          │      │          │       │   Webhook    │
│  • Room  │      │ • Wallet │       │              │
│   state  │      │   index  │       │ • Event      │
│ • WebSocket     │ • Room   │       │   delivery   │
│   mgmt   │      │   lookup │       │ • Filtering  │
└──────────┘      └──────────┘       └──────────────┘
```

### Request Flow

1. **Room Creation**
   ```
   Client → Worker API → Durable Object → KV Index
   ```

2. **Wallet Addition**
   ```
   Client → Worker API → Durable Object
                      ↓
                   KV Index Update
                      ↓
                 CDP Filter Update
   ```

3. **Webhook Event**
   ```
   Coinbase → Worker API → Verify Signature
                        ↓
                    Query KV Index
                        ↓
                  Route to Durable Objects
                        ↓
                  Broadcast to WebSockets
   ```

## Core Concepts

### 1. Single Webhook Architecture

We use **one webhook endpoint** for all rooms instead of creating a webhook per room:

**Benefits:**
- Simple setup and maintenance
- No CDP webhook quota issues
- Easy wallet sharing between rooms
- Cost-effective scaling

**Implementation:**
- Webhook receives events for all tracked wallets
- KV index maps wallets to rooms
- Events are routed to appropriate rooms
- CDP filters are dynamically updated

### 2. Wallet Index

Bi-directional mapping in KV storage:

```javascript
// Wallet → Rooms
wallet:0x123... → ["ROOM-ABC", "ROOM-XYZ"]

// Room → Wallets
room:ABC:wallets → ["0x123...", "0x456..."]
```

**Operations:**
- O(1) lookups for routing
- Automatic cleanup on room expiration
- Supports wallets in multiple rooms

### 3. Dynamic Filter Management

CDP webhook filters are automatically synchronized:

```javascript
// When wallet is added
1. Update Durable Object
2. Update KV index
3. Call CDP API to update filters
4. Only receive relevant events
```

**Fallback:**
- Works without CDP API credentials
- Falls back to server-side filtering
- No functionality loss

### 4. Durable Objects

Each room is a Durable Object instance:

**Responsibilities:**
- Maintain room state (wallets, config)
- Manage WebSocket connections
- Handle hibernation for cost savings
- Process webhook notifications

**Lifecycle:**
- Created on first access
- Hibernates when idle
- Expires after configured time
- Cleans up index on deletion

## API Reference

### Room Management

```typescript
// Create a room
POST /room/{roomCode}/create
{
  "threshold": 1000,
  "telegramWebhook": "https://...",
  "expiresIn": 24
}

// Add wallet to room
POST /room/{roomCode}/wallets
{
  "address": "0x742d35Cc...",
  "label": "Main Wallet"
}

// Get room wallets
GET /room/{roomCode}/wallets

// Remove wallet
DELETE /room/{roomCode}/wallets/{address}

// WebSocket connection
GET /room/{roomCode}/websocket
Upgrade: websocket
```

### Webhook Processing

```typescript
// Coinbase webhook
POST /webhook/coinbase
Headers:
  x-webhook-signature: {signature}
Body: {Coinbase event payload}
```

See full [API Documentation](./API_DOCUMENTATION.md) for details.

## Configuration

### Worker Configuration (wrangler.toml)

```toml
name = "swapwatch-api"
main = "src/worker/index.ts"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "RoomDurableObject"

[[kv_namespaces]]
binding = "ROOM_INDEX"
id = "your-kv-namespace-id"

[env.production]
route = { pattern = "api.swapwatch.app/*", zone_name = "swapwatch.app" }
```

### Environment Variables

```bash
# Required for webhook signature verification
COINBASE_WEBHOOK_SECRET=your-webhook-secret

# Optional - for dynamic filter updates
CDP_API_KEY_NAME=your-api-key-id
CDP_API_KEY_PRIVATE_KEY=your-api-secret
CDP_WEBHOOK_ID=your-webhook-id

# Optional - for notifications
TELEGRAM_BOT_TOKEN=your-bot-token
```

## Development Workflow

### Local Development

```bash
# Start local Worker
wrangler dev

# Test with local KV
wrangler kv key put --namespace-id YOUR_KV_ID --local \
  wallet:0x123 '{"rooms":["TEST"]}'

# Tail production logs
wrangler tail --env production
```

### Testing

```bash
# Run unit tests
npm test

# Test Worker endpoints
npm run test:worker

# Test webhook signature
npm run test:webhook
```

### Debugging

```bash
# Monitor Worker logs
wrangler tail --env production

# Check KV index
wrangler kv key list --namespace-id YOUR_KV_ID --prefix wallet:

# Test webhook manually
curl -X POST https://api.swapwatch.app/webhook/coinbase \
  -H "x-webhook-signature: {signature}" \
  -d '{"event": "test"}'
```

## Deployment

### Staging Deployment

```bash
# Deploy to staging
wrangler deploy --env staging

# Test staging endpoint
curl https://staging-api.swapwatch.app/health
```

### Production Deployment

```bash
# Deploy to production
wrangler deploy --env production

# Verify deployment
curl https://api.swapwatch.app/health
```

### Rollback

```bash
# List deployments
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback {version-id} --env production
```

## Monitoring

### Health Checks

```bash
# API health
curl https://api.swapwatch.app/health

# Room status
curl https://api.swapwatch.app/room/{roomCode}/presence
```

### Metrics

Track these key metrics:

1. **Webhook Processing**
   - Events received/minute
   - Processing latency
   - Signature verification failures

2. **Room Activity**
   - Active rooms count
   - WebSocket connections
   - Messages/second

3. **KV Operations**
   - Read/write rates
   - Cache hit ratio
   - Storage size

### Alerts

Set up alerts for:
- Webhook signature failures > 10/minute
- Worker errors > 1% of requests
- KV operation failures
- Room expiration issues

## Security

### Best Practices

1. **Never commit credentials**
   - Use `.env` for local development
   - Use Wrangler secrets for production
   - Check `SECURITY_CHECKLIST.md` before pushing

2. **Validate all inputs**
   - Sanitize wallet addresses
   - Validate room codes
   - Check request sizes

3. **Rate limiting**
   - Implement per-IP rate limits
   - Throttle wallet additions
   - Monitor for abuse

4. **Signature verification**
   - Always verify webhook signatures
   - Rotate secrets regularly
   - Log verification failures

### Secret Rotation

```bash
# Generate new webhook secret
openssl rand -hex 32

# Update Worker secret
wrangler secret put COINBASE_WEBHOOK_SECRET --env production

# Update CDP webhook configuration
./cdp-webhook-utils.sh
# Select option 4 (Update webhook)
```

## Troubleshooting

### Common Issues

#### Webhook not receiving events

1. Check webhook is active in CDP dashboard
2. Verify signature secret matches
3. Check Worker logs for errors
4. Ensure wallet filters are set

```bash
# Check webhook status
./cdp-webhook-utils.sh list

# View Worker logs
wrangler tail --env production
```

#### Wallets not being tracked

1. Verify wallet was added successfully
2. Check KV index has entry
3. Ensure room hasn't expired

```bash
# Check wallet index
wrangler kv key get --namespace-id YOUR_KV_ID \
  wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb7
```

#### WebSocket connection issues

1. Check CORS headers
2. Verify room exists
3. Check Durable Object logs

```bash
# Test WebSocket upgrade
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  https://api.swapwatch.app/room/TEST/websocket
```

### Debug Commands

```bash
# Export KV data for analysis
wrangler kv bulk get --namespace-id YOUR_KV_ID > kv-dump.json

# Check Durable Object storage
wrangler d1 execute ROOM_STATE --sql "SELECT * FROM rooms"

# View recent errors
wrangler tail --env production --format json | jq 'select(.level == "error")'
```

## Performance Optimization

### KV Index

- **Batch operations** when adding multiple wallets
- **Use consistent key format** for better caching
- **Implement TTL** for expired entries

### Durable Objects

- **Enable hibernation** for idle rooms
- **Batch WebSocket broadcasts**
- **Limit state size** (< 128KB recommended)

### Worker

- **Minimize cold starts** with smaller bundles
- **Cache static responses**
- **Use streaming for large responses**

## Contributing

### Development Setup

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit pull request

### Code Style

- TypeScript with strict mode
- Prettier formatting
- ESLint rules
- Functional programming patterns

### Testing Requirements

- Unit tests for new functions
- Integration tests for API changes
- Document breaking changes
- Update API documentation

## Support

### Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Webhook Architecture](./WEBHOOK_ARCHITECTURE.md)
- [Wallet Index Guide](./WALLET_INDEX_GUIDE.md)
- [Security Checklist](../SECURITY_CHECKLIST.md)

### Getting Help

- GitHub Issues: [Report bugs](https://github.com/keentechcodes/Base-SwapWatch/issues)
- Documentation: Check `/docs` folder
- Logs: Use `wrangler tail` for debugging

### Common Commands

```bash
# View logs
wrangler tail --env production

# Check webhook
./cdp-webhook-utils.sh

# Test API
curl https://api.swapwatch.app/health

# Manage KV
wrangler kv key list --namespace-id YOUR_KV_ID
```