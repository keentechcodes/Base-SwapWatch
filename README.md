# SwapWatch - Base Network Webhook Demo

A real-time webhook receiver for monitoring swap transactions on Base network using Coinbase Developer Platform (CDP) webhooks.

## Features

- 🔄 **Automatic Swap Detection** - Identifies swaps on major DEXs (Uniswap V3, BaseSwap, Aerodrome, etc.)
- 🔐 **Secure Webhook Handling** - HMAC signature verification with CDP compatibility
- 🎨 **Beautiful Logging** - Color-coded console output for different event types
- 🚀 **Easy Development** - Built-in tunnel setup for local testing
- ✅ **Well Tested** - Comprehensive test suite with 32+ tests

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- CDP account (for webhook configuration)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/keentechcodes/Base-SwapWatch.git
cd Base-SwapWatch
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your webhook secret:
```env
WEBHOOK_SECRET=your-secret-here
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Start the server:
```bash
npm start
```

## Development Setup

### Running with Tunnel (Required for Webhooks)

1. Start the server:
```bash
npm start
```

2. In another terminal, run the tunnel setup:
```bash
./scripts/setup-tunnel.sh
```

3. Choose option 1 for Cloudflare Tunnel (no account needed)
4. Copy the generated URL (e.g., `https://example.trycloudflare.com`)

### Configure CDP Webhook

See [CDP Webhook Setup Guide](docs/CDP-WEBHOOK-SETUP.md) for detailed instructions.

Quick steps:
1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Create new webhook with your tunnel URL + `/webhook`
3. Select Base mainnet and event types
4. Add wallet addresses to monitor
5. Use the same webhook secret from your `.env`

## Testing

### Run Tests
```bash
npm test
```

### Test Webhook Locally
```bash
# Basic webhook test
./test-webhook.sh

# Swap event test
./test-swap-webhook.sh
```

### Manual Testing with curl
```bash
# Generate signature
PAYLOAD='{"webhookId":"test","eventType":"wallet_activity","network":"base-mainnet"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your-secret" | sed 's/^.* //')

# Send request
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and status |
| `/health` | GET | Health check endpoint |
| `/webhook` | POST | CDP webhook receiver |

## Swap Detection

The app automatically detects swaps on these DEXs:

- **Uniswap V3** - `0x2626664c2603336E57B271c5C0b26F421741e481`
- **BaseSwap** - `0x327Df1E6de05895d2ab08513aaDD9313Fe505d86`
- **Aerodrome** - `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- **SushiSwap** - `0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891`
- **PancakeSwap V3** - `0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb`
- **Velodrome** - `0x1B8eea9315bE495187D873DA7773a874545D9D48`

When a swap is detected, you'll see enhanced output:
```
🔄 SWAP DETECTED!
📊 DEX: Uniswap V3
👤 From: 0x1234...5678
📍 Router: 0x2626...e481
💱 Swap:
  → In: WETH (1.5)
  ← Out: USDC (3000)
```

## Project Structure

```
Base-SwapWatch/
├── src/
│   ├── server.ts              # Express server setup
│   ├── middleware/
│   │   └── webhookAuth.ts     # Signature verification
│   ├── utils/
│   │   ├── eventLogger.ts     # Event logging with colors
│   │   └── swapDetector.ts    # Swap detection logic
│   ├── types/
│   │   └── webhook.ts         # TypeScript types
│   └── __tests__/             # Test files
├── scripts/
│   └── setup-tunnel.sh        # Tunnel setup script
├── docs/
│   └── CDP-WEBHOOK-SETUP.md   # CDP configuration guide
├── test-webhook.sh             # Test script for webhooks
├── test-swap-webhook.sh       # Test script for swaps
└── examples/                   # Example payloads
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the production server |
| `npm run dev` | Start development server with hot reload |
| `npm test` | Run all tests |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBHOOK_SECRET` | Yes | - | Secret for webhook signature verification |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment (development/production/test) |
| `LOG_LEVEL` | No | info | Logging level (debug/info/warn/error) |

## CDP Webhook Compatibility

This implementation supports CDP's alpha webhook format:
- ✅ Direct secret signature (CDP alpha format)
- ✅ HMAC-SHA256 signature (standard format)
- ✅ Automatic format detection

## Troubleshooting

### Server won't start
- Check port 3000 is available: `lsof -i :3000`
- Ensure dependencies are installed: `npm install`
- Build TypeScript: `npm run build`

### Webhook signature failures
- Verify webhook secret matches in `.env` and CDP
- Check CDP is sending to correct URL
- Ensure tunnel is running and connected

### No swap detection
- Verify transaction is to a known DEX router
- Check `smart_contract_event` is enabled in CDP
- Review server logs for contract addresses

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- [GitHub Issues](https://github.com/keentechcodes/Base-SwapWatch/issues)
- [CDP Documentation](https://docs.cdp.coinbase.com/)
- [Base Network Docs](https://docs.base.org/)

## Acknowledgments

- Built for Coinbase Developer Platform webhooks
- Optimized for Base network monitoring
- Uses Express.js and TypeScript

---

**Note**: This is a demo application for CDP webhook integration. For production use, consider adding:
- Database for event storage
- Rate limiting and DDoS protection
- Advanced error handling and retry logic
- Notification systems (email, Discord, Telegram)
- Frontend dashboard for visualization