# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-08-api-data-enrichment/spec.md

## External API Endpoints

### DexScreener API

#### GET /dex/tokens/{address}
**Purpose:** Fetch real-time market data for a token
**Parameters:** 
- address: Token contract address on Base network
**Response:** Price, market cap, 24h volume, liquidity, pair information
**Rate Limit:** No explicit limit, best practice 10 req/sec
**Cache TTL:** 5 minutes

#### GET /token-profiles/latest/v1
**Purpose:** Retrieve token profile metadata and branding
**Parameters:**
- chainId: base
- address: Token contract address
**Response:** Token logo, description, social links
**Rate Limit:** No explicit limit
**Cache TTL:** 2 hours

### BaseScan API

#### GET /api/v2/contracts/{address}
**Purpose:** Get contract creation and verification details
**Parameters:**
- address: Contract address
- apikey: BaseScan API key (required)
**Response:** Creator address, transaction hash, factory contract
**Rate Limit:** 5 requests/second
**Cache TTL:** 24 hours

#### GET /api/v2/contracts/{address}/sourcecode
**Purpose:** Check contract verification status
**Parameters:**
- address: Contract address
- apikey: BaseScan API key (required)
**Response:** Verification status, source code, compiler version
**Rate Limit:** 5 requests/second
**Cache TTL:** 24 hours

### Internal API Enhancements

#### GET /api/enriched-webhook/{transactionHash}
**Purpose:** Retrieve enriched webhook data by transaction hash
**Parameters:** transactionHash (path parameter)
**Response:** Original webhook data + enriched market data
**Errors:** 404 if transaction not found, 503 if enrichment services unavailable

#### GET /api/health/services
**Purpose:** Check status of all external API integrations
**Response:** Service health status for each API provider
**Format:**
```json
{
  "dexscreener": { "status": "healthy", "latency": 45 },
  "basescan": { "status": "healthy", "latency": 120 },
  "redis": { "status": "connected", "memory": "45MB" }
}
```

#### POST /api/cache/invalidate
**Purpose:** Manually invalidate cache for specific tokens
**Parameters:** 
- addresses: Array of token addresses to invalidate
- components: Optional array of cache components to clear
**Response:** Number of cache entries cleared
**Authorization:** Requires admin API key in header

## WebSocket Events (Future)

### Event: enriched-swap
**Purpose:** Real-time enriched swap events for connected clients
**Payload:** Full enriched swap data with market context
**Trigger:** When webhook is received and enrichment completes

## API Response Enrichment

All webhook events will be enriched with:
```json
{
  "enrichment": {
    "timestamp": "2025-09-08T12:00:00Z",
    "cached": false,
    "tokens": {
      "tokenIn": {
        "name": "Wrapped Ether",
        "symbol": "WETH",
        "decimals": 18,
        "price": 3500.50,
        "marketCap": 1000000000,
        "volume24h": 50000000,
        "verified": true
      },
      "tokenOut": {
        "name": "USD Coin", 
        "symbol": "USDC",
        "decimals": 6,
        "price": 1.00,
        "marketCap": 500000000,
        "volume24h": 25000000,
        "verified": true
      }
    },
    "usdValues": {
      "amountIn": 3500.50,
      "amountOut": 3499.00,
      "slippage": -0.04
    },
    "dex": {
      "name": "Uniswap V3",
      "factory": "0x2626664c2603336E57B271c5C0b26F421741e481",
      "liquidity": 10000000
    }
  }
}
```