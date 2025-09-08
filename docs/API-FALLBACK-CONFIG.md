# API Fallback Configuration

This document describes how the SwapWatch enrichment system handles API failures and missing services, ensuring the webhook processor continues to function even when external services are unavailable.

## Fallback Strategy Overview

The system implements a graceful degradation approach where missing or failed API services don't break the core webhook functionality. Instead, the system provides the best available data and clearly indicates what information is unavailable.

## Service-Specific Fallbacks

### DexScreener API Fallback

**When DexScreener is unavailable:**
- Swap events are still detected and logged
- Token addresses are displayed instead of names
- USD values show as "Price unavailable"
- Market metrics (volume, liquidity) show as "N/A"
- Swap detection continues to work normally

**Fallback Display Example:**
```
🔄 SWAP DETECTED!
📊 DEX: Uniswap V3
👤 From: 0x1234...5678
💱 Swap:
  → In: 0x4200...0006 (1.5 tokens)
  ← Out: 0x8335...2913 (3000 tokens)
  💰 USD Value: Price unavailable
```

### BaseScan API Fallback

**When BaseScan is unavailable or no API key:**
- Contract verification shows as "Unknown"
- Factory detection falls back to local known factories list
- Transaction details from webhook still displayed
- Basic contract info still available from RPC

**Fallback Display Example:**
```
Contract Verification: ⚠️ Unknown (BaseScan unavailable)
Factory: Detected locally as Clanker
```

### Redis Cache Fallback

**When Redis is unavailable:**
- System continues without caching
- Each request makes fresh API calls
- Performance impact: ~200-500ms additional latency
- No data loss, just slower responses
- Warning logged: "Cache unavailable, using direct API calls"

**Impact:**
- Higher API usage (may hit rate limits faster)
- Increased response times
- All functionality remains available

### Token Metadata Fallback

**Fallback hierarchy (tries in order):**
1. Enhanced RPC (Alchemy/Infura) if configured
2. Public Base RPC endpoint
3. Hardcoded popular token list
4. Raw contract addresses only

**Progressive Enhancement:**
```javascript
// Priority order for token data
1. Cache (if available)
2. Enhanced RPC with metadata
3. Public RPC basic calls
4. Local token database
5. Address only (last resort)
```

## Development Mode Fallbacks

### Minimal Configuration (Quick Start)

You can run the enrichment system with zero API keys:

```env
# Minimal .env - everything else uses fallbacks
WEBHOOK_SECRET=test-webhook-secret
PORT=3000
```

**What works without any API keys:**
- ✅ Webhook reception and validation
- ✅ Swap detection for all DEXs
- ✅ Basic token information via public RPC
- ✅ Transaction details from webhook
- ✅ DexScreener data (no key needed)
- ⚠️ No contract verification (needs BaseScan)
- ⚠️ No caching (needs Redis)
- ⚠️ Limited token metadata

### Mock Mode for Testing

Enable mock mode for development without external services:

```env
# Enable mock mode in .env
MOCK_APIS=true
MOCK_DELAY=100  # Simulate API latency
```

**Mock mode provides:**
- Fake price data for testing
- Simulated API responses
- Predictable test data
- No external API calls

## Production Fallback Configuration

### Recommended Minimum Setup

```env
# Minimum recommended for production
WEBHOOK_SECRET=secure-random-secret
BASESCAN_API_KEY=your-key  # For verification
REDIS_HOST=localhost       # For caching
BASE_RPC_URL=https://mainnet.base.org
```

### High Availability Configuration

```env
# Multiple fallback options
PRIMARY_RPC_URL=https://base-mainnet.g.alchemy.com/v2/key
FALLBACK_RPC_URL=https://mainnet.base.org
EMERGENCY_RPC_URL=https://base-mainnet.infura.io/v3/key

# Cache fallback
PRIMARY_REDIS_HOST=redis-primary.example.com
FALLBACK_REDIS_HOST=redis-secondary.example.com

# API timeout settings
API_TIMEOUT=5000           # 5 seconds
API_FALLBACK_TIMEOUT=2000  # 2 seconds for fallback
```

## Error Handling Examples

### API Service Down

```javascript
// Automatic fallback when DexScreener is down
try {
  const priceData = await dexScreenerService.getTokenPrice(address);
  return priceData;
} catch (error) {
  logger.warn('DexScreener unavailable, using fallback');
  return {
    price: null,
    priceDisplay: 'Price unavailable',
    source: 'fallback'
  };
}
```

### Rate Limit Handling

```javascript
// Exponential backoff on rate limits
if (error.status === 429) {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  await sleep(delay);
  return retry(request, attempt + 1);
}
```

### Partial Data Response

When some APIs fail, the system returns partial data:

```json
{
  "enrichment": {
    "status": "partial",
    "available": ["swap_detection", "dex_info"],
    "unavailable": ["price_data", "verification"],
    "tokens": {
      "tokenIn": {
        "address": "0x4200...0006",
        "name": "Unknown Token",
        "price": null,
        "verified": "unknown"
      }
    }
  }
}
```

## Monitoring Fallback Usage

### Health Check Endpoint

```bash
GET /api/health/services
```

Response shows service status:
```json
{
  "services": {
    "dexscreener": { 
      "status": "healthy", 
      "fallback": false 
    },
    "basescan": { 
      "status": "degraded", 
      "fallback": true,
      "reason": "rate_limited" 
    },
    "redis": { 
      "status": "down", 
      "fallback": true,
      "reason": "connection_refused" 
    }
  }
}
```

### Fallback Metrics

Monitor fallback usage in logs:

```
[INFO] API Fallback Active: BaseScan (rate limited)
[WARN] Cache Miss: Using direct API call
[INFO] Fallback Count Today: BaseScan=45, Redis=0, RPC=12
```

## Testing Fallback Behavior

### Simulate API Failures

```bash
# Test with DexScreener blocked
BLOCK_DEXSCREENER=true npm run dev

# Test without Redis
DISABLE_CACHE=true npm run dev

# Test without BaseScan
unset BASESCAN_API_KEY && npm run dev
```

### Validate Fallback Behavior

```bash
# Run validation in fallback mode
FORCE_FALLBACK=true npm run validate-apis
```

## Fallback Priority Matrix

| Feature | Primary | Fallback 1 | Fallback 2 | Final Fallback |
|---------|---------|------------|------------|----------------|
| Token Price | DexScreener | CoinGecko* | Calculated | "N/A" |
| Token Name | Enhanced RPC | Public RPC | Cache | Address only |
| Verification | BaseScan API | Etherscan* | Cache | "Unknown" |
| Swap Detection | Always Works | - | - | - |
| USD Values | Live Price | Cached Price | Estimated | "N/A" |
| Market Data | DexScreener | Cache | - | "N/A" |

*Future implementation

## Best Practices

1. **Always implement fallbacks** for external services
2. **Log fallback usage** for monitoring
3. **Cache successful responses** to use during outages
4. **Set appropriate timeouts** to fail fast
5. **Provide clear indicators** when using fallback data
6. **Test fallback paths** regularly
7. **Monitor API quotas** to prevent hitting limits

## Configuration Priority

The system checks for configuration in this order:

1. Environment variables (.env file)
2. Default values in code
3. Fallback services
4. Graceful degradation to basic functionality

## Summary

The fallback system ensures:
- ✅ Core webhook functionality always works
- ✅ Swap detection never fails
- ✅ Best available data is always provided
- ✅ Clear indication of data quality
- ✅ No silent failures
- ✅ Progressive enhancement as services become available

This approach provides a robust system that degrades gracefully rather than failing completely when external services are unavailable.