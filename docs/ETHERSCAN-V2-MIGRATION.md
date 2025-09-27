# Etherscan v2 API Migration Guide

## Overview

As of August 2024, BaseScan v1 API has been deprecated. This project has been updated to use the Etherscan v2 API, which provides unified access to 50+ blockchain networks including Base chain.

## What Changed

### API Endpoint
- **Old**: `https://api.basescan.org/api`
- **New**: `https://api.etherscan.io/v2/api?chainid=8453`

### API Key
- **Old**: BaseScan-specific API key from basescan.org
- **New**: Single Etherscan API key from etherscan.io that works for all chains

### Environment Variables
- **Old**: `BASESCAN_API_KEY`
- **New**: `ETHERSCAN_API_KEY`

## Migration Steps

### 1. Get New API Key

1. Visit [Etherscan.io](https://etherscan.io/register) and create an account
2. Navigate to [API Keys](https://etherscan.io/myapikey)
3. Generate a new API key
4. This single key now works for all supported chains

### 2. Update Environment Variables

Update your `.env` file:

```env
# Remove or comment out old key
# BASESCAN_API_KEY=old_key_here

# Add new Etherscan key
ETHERSCAN_API_KEY=your_new_etherscan_key_here
```

### 3. Verify Migration

Run the validation script to ensure everything works:

```bash
# Test all API connections
npm run validate-apis

# Test Etherscan v2 specifically
node scripts/test-etherscan-v2.js
```

## Backward Compatibility

The service maintains backward compatibility during migration:

1. **Environment Variables**: The service will check both `ETHERSCAN_API_KEY` and `BASESCAN_API_KEY` (in that order)
2. **API Responses**: All response formats remain the same
3. **Cache Keys**: Existing cache entries remain valid

## Benefits of v2

1. **Multi-chain Support**: Single API key for 50+ chains
2. **Unified Interface**: Same endpoints for all chains
3. **Better Reliability**: Centralized infrastructure
4. **Future-proof**: Active development and new features

## Supported Chains

With your Etherscan API key, you can now access data from:
- Base (8453) - Our primary chain
- Ethereum (1)
- Arbitrum (42161)
- Optimism (10)
- Polygon (137)
- And 45+ more chains

## API Rate Limits

Same as before:
- **Free Tier**: 5 calls/second, 100,000 calls/day
- **Pro Tier**: Higher limits available

## Troubleshooting

### "Invalid API Key" Error
- Make sure you're using an Etherscan.io key, not a BaseScan key
- Verify the key is active in your Etherscan dashboard

### "Max rate limit reached (2/sec)" Error
- This indicates you're still using v1 endpoints
- Ensure your service is using the updated code
- Check that `ETHERSCAN_API_KEY` is set properly

### Some Methods Not Working
- The `eth_getCode` proxy method may not work on all chains
- The service includes fallback methods for these cases

## Code Changes

The BaseScan service has been updated internally to:
1. Use Etherscan v2 endpoints
2. Include chain ID parameter (8453 for Base)
3. Support configurable chain IDs for future expansion
4. Include fallback methods for unsupported endpoints

## Testing

Test the integration with real Base addresses:

```javascript
// USDC on Base
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Test contract verification
const verification = await basescan.getContractVerification(USDC);

// Test account balance
const balance = await basescan.getAccountBalance(USDC);
```

## Questions?

- Check the [API Key Setup Guide](./API-KEY-SETUP.md)
- Review [Etherscan v2 Documentation](https://docs.etherscan.io/etherscan-v2)
- Run `node scripts/test-etherscan-v2.js` to debug issues

---

*Migration completed: January 2025*