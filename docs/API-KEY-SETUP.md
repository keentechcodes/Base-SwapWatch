# API Key Setup Guide

This guide walks you through obtaining and configuring API keys for the SwapWatch data enrichment features. Follow each section to set up the required services.

## Table of Contents
- [Quick Start](#quick-start)
- [Service Overview](#service-overview)
- [DexScreener API](#dexscreener-api)
- [BaseScan API](#basescan-api)
- [Token Metadata Options](#token-metadata-options)
- [Redis Setup](#redis-setup)
- [Environment Configuration](#environment-configuration)
- [Validation](#validation)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Required API Keys
| Service | Required | Free Tier | Setup Time |
|---------|----------|-----------|------------|
| DexScreener | No | ✅ Public API | 0 minutes |
| BaseScan | Yes | ✅ 100k calls/day | 5 minutes |
| Redis | No (local) | ✅ Local or free cloud | 5 minutes |
| Token Metadata | Optional | ✅ Multiple options | 0-10 minutes |

### Minimal Setup (No API Keys)
You can start using the enrichment features immediately with:
- ✅ DexScreener (no key needed)
- ✅ Local Redis (no key needed)
- ✅ Basic token metadata from blockchain

## Service Overview

### What Each Service Provides

**DexScreener API**
- Real-time token prices
- 24h trading volume
- Market capitalization
- Liquidity pool data
- No API key required!

**BaseScan API**
- Contract verification status
- Token creation details
- Transaction history
- Requires free API key

**Token Metadata**
- Token names and symbols
- Decimals for calculations
- Optional: token logos
- Multiple provider options

**Redis Cache**
- Reduces API calls
- Improves response times
- Stores data temporarily
- Local or cloud options

## DexScreener API

### Setup
**Good news! No API key required!** DexScreener provides a public API.

### Configuration
```env
# No configuration needed for DexScreener
# The API is public and free to use
DEXSCREENER_API_URL=https://api.dexscreener.com/latest
```

### Rate Limits
- No documented rate limits
- Best practice: 10 requests/second
- Our implementation includes automatic rate limiting

### Testing
```bash
# Test DexScreener API (no key needed)
curl "https://api.dexscreener.com/latest/dex/tokens/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
```

## BaseScan API

### Step 1: Create Account
1. Visit [BaseScan.org](https://basescan.org/register)
2. Click "Sign Up" in the top right
3. Fill in:
   - Username (any username you prefer)
   - Email address (for API key delivery)
   - Password (secure password)
4. Complete the CAPTCHA
5. Click "Create an Account"
6. Check your email for verification link
7. Click the verification link to activate

### Step 2: Generate API Key
1. Log in to [BaseScan.org](https://basescan.org/login)
2. Navigate to [API Keys](https://basescan.org/myapikey)
3. Click "Add" button to create new key
4. Enter App Name: "SwapWatch" (or your preferred name)
5. Click "Create New API Key"
6. Copy your API key (looks like: `ABC123DEF456...`)

### Step 3: Configure
```env
# Add to your .env file
BASESCAN_API_KEY=your_api_key_here
```

### Rate Limits
- **Free Tier**: 5 calls/second, 100,000 calls/day
- **Pro Tier**: Higher limits available if needed

### Testing
```bash
# Test your BaseScan API key
curl "https://api.basescan.org/api?module=contract&action=getabi&address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&apikey=YOUR_API_KEY"
```

## Token Metadata Options

You have multiple options for token metadata. Choose based on your needs:

### Option 1: Direct Blockchain Calls (No API Key)
**Best for**: Getting started quickly
```env
# Uses public RPC endpoint
BASE_RPC_URL=https://mainnet.base.org
# No API key needed!
```

### Option 2: Alchemy (Enhanced RPC)
**Best for**: Reliable, fast responses

1. Sign up at [alchemy.com](https://www.alchemy.com/)
2. Create new app:
   - Chain: Base
   - Network: Base Mainnet
3. Copy your API key from dashboard

```env
ALCHEMY_API_KEY=your_alchemy_key_here
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your_alchemy_key_here
```

### Option 3: Moralis
**Best for**: Additional token data and NFT support

1. Sign up at [moralis.io](https://moralis.io/)
2. Navigate to Web3 API section
3. Copy your API key

```env
MORALIS_API_KEY=your_moralis_key_here
```

### Option 4: Infura
**Best for**: Ethereum ecosystem integration

1. Sign up at [infura.io](https://infura.io/)
2. Create new project
3. Add Base network to project
4. Copy your project ID

```env
INFURA_PROJECT_ID=your_project_id_here
BASE_RPC_URL=https://base-mainnet.infura.io/v3/your_project_id_here
```

## Redis Setup

### Option 1: Local Redis (Development)
**Best for**: Local development, no API key needed

#### macOS
```bash
# Install with Homebrew
brew install redis

# Start Redis
brew services start redis

# Test connection
redis-cli ping
# Should return: PONG
```

#### Ubuntu/Debian
```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server

# Test connection
redis-cli ping
# Should return: PONG
```

#### Windows (WSL)
```bash
# In WSL terminal
sudo apt update
sudo apt install redis-server

# Start Redis
sudo service redis-server start

# Test connection
redis-cli ping
# Should return: PONG
```

#### Docker
```bash
# Run Redis in Docker
docker run -d -p 6379:6379 --name swapwatch-redis redis:alpine

# Test connection
docker exec -it swapwatch-redis redis-cli ping
# Should return: PONG
```

### Option 2: Redis Cloud (Production)
**Best for**: Production deployment, free tier available

1. Sign up at [redis.com](https://redis.com/try-free/)
2. Create new subscription:
   - Choose "Free" tier (30MB free)
   - Select region closest to you
3. Create database:
   - Name: "swapwatch-cache"
   - Copy connection details
4. Note your credentials:
   - Endpoint: `redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345`
   - Password: `your_redis_password`

### Configuration
```env
# Local Redis (default)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# OR Redis Cloud
REDIS_HOST=redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

## Environment Configuration

### Complete .env Setup

Create or update your `.env` file with all configurations:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Webhook Configuration (existing)
WEBHOOK_SECRET=your-webhook-secret-here

# API Services
DEXSCREENER_API_URL=https://api.dexscreener.com/latest

# BaseScan API (Required for contract verification)
BASESCAN_API_KEY=your_basescan_api_key_here
BASESCAN_API_URL=https://api.basescan.org/api

# Token Metadata (Choose one option)
# Option 1: Public RPC (no key needed)
BASE_RPC_URL=https://mainnet.base.org

# Option 2: Alchemy (better performance)
# ALCHEMY_API_KEY=your_alchemy_key_here
# BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your_alchemy_key_here

# Option 3: Moralis (additional features)
# MORALIS_API_KEY=your_moralis_key_here

# Redis Cache Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Cache TTL Settings (seconds)
CACHE_TTL_MARKET=300        # 5 minutes for prices
CACHE_TTL_METADATA=7200     # 2 hours for token info
CACHE_TTL_VERIFICATION=86400 # 24 hours for contract verification
CACHE_TTL_FACTORY=86400     # 24 hours for factory info

# Rate Limiting
BASESCAN_RATE_LIMIT=5       # requests per second
API_RETRY_ATTEMPTS=3
API_RETRY_DELAY=1000        # milliseconds

# Optional: Admin Features
ADMIN_API_KEY=generate_a_secure_random_key_here
```

## Validation

### Manual Testing

Test each service individually:

```bash
# 1. Test DexScreener (no key needed)
curl "https://api.dexscreener.com/latest/dex/tokens/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# 2. Test BaseScan (replace YOUR_KEY)
curl "https://api.basescan.org/api?module=stats&action=baseprice&apikey=YOUR_KEY"

# 3. Test Redis
redis-cli ping

# 4. Test RPC endpoint
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Automated Validation Script

Run the validation script to check all services:

```bash
npm run validate-apis
```

This will test:
- ✅ DexScreener connectivity
- ✅ BaseScan API key validity
- ✅ Redis connection
- ✅ RPC endpoint availability
- ✅ Rate limiting configuration

## Troubleshooting

### Common Issues

**BaseScan API Key Not Working**
- Ensure you've verified your email
- Check for typos in the API key
- Verify the key is active in your BaseScan dashboard
- Free tier limit: 100,000 calls/day

**Redis Connection Failed**
- Local: Ensure Redis is running (`redis-cli ping`)
- Cloud: Check firewall/security group settings
- Verify password is correct (if set)

**Rate Limit Errors**
- BaseScan: Maximum 5 requests/second
- Implement exponential backoff (already in our code)
- Consider upgrading to Pro tier if needed

**Token Metadata Not Loading**
- Verify RPC endpoint is accessible
- Check if token contract is verified
- Some new tokens may not have metadata immediately

### Fallback Configuration

The system includes automatic fallbacks:

1. **If BaseScan fails** → Shows "Verification Unknown"
2. **If DexScreener fails** → Shows basic swap data without prices
3. **If Redis fails** → Continues without caching
4. **If token metadata fails** → Shows contract addresses only

### Getting Help

If you encounter issues:
1. Check the logs: `npm run dev` shows detailed errors
2. Run validation: `npm run validate-apis`
3. Review this guide for missed steps
4. Check service status pages:
   - [BaseScan Status](https://basescan.org/apis#status)
   - [DexScreener Status](https://dexscreener.com)

## Next Steps

After setting up your API keys:

1. **Run validation** to ensure everything works:
   ```bash
   npm run validate-apis
   ```

2. **Start development** with enrichment features:
   ```bash
   npm run dev
   ```

3. **Test webhook** with enriched data:
   ```bash
   ./test-swap-webhook.sh
   ```

4. **Monitor performance** in logs to see:
   - Cache hit rates
   - API response times
   - Enrichment success rates

---

**Note**: Start with the minimal setup (DexScreener + local Redis) and add other services as needed. The system gracefully handles missing services, so you can incrementally add API keys.