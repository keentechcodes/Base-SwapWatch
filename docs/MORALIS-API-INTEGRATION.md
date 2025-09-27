# Moralis API Integration Guide

## Overview

Moralis provides a powerful Web3 data API that complements our existing DexScreener and Etherscan integrations. It offers enhanced token metadata, real-time prices, NFT data, and cross-chain capabilities.

## Features

### ✅ Working Features on Base Chain

1. **Token Metadata** - Comprehensive token information including logos
2. **Token Prices** - Real-time USD prices with 24h change data
3. **Native Balance** - ETH balance queries
4. **Token Transfers** - Historical transfer data
5. **NFT Data** - NFT ownership and metadata
6. **ENS Resolution** - Cross-chain ENS domain resolution
7. **Transaction History** - Detailed transaction information

### ⚠️ Limitations

- **Wallet Tokens**: May fail for wallets with 2000+ tokens
- **Batch Operations**: Some batch endpoints require POST requests
- **Token Allowance**: Deprecated endpoint (no longer supported)

## Setup

### 1. Get API Key

1. Visit [Moralis.io](https://moralis.io/)
2. Sign up for a free account
3. Navigate to Web3 API section
4. Copy your API key

### 2. Configure Environment

Add to your `.env` file:

```env
# Moralis API (Optional - enhances token data)
MORALIS_API_KEY=your_moralis_api_key_here
```

### 3. Test Integration

```bash
# Run the test script
node scripts/test-moralis-api.js
```

## Usage Examples

### Using the Moralis Service

```typescript
import { createMoralisService } from './services/moralis';

// Initialize service
const moralis = createMoralisService({
  cache,
  logger,
  rateLimiter,
  config: {
    apiKey: process.env.MORALIS_API_KEY,
    chain: 'base' // or 'ethereum', 'polygon', etc.
  }
});

// Get token metadata with logo
const metadata = await moralis.getTokenMetadata(tokenAddress);
if (metadata.success) {
  console.log('Token:', metadata.data.name);
  console.log('Logo:', metadata.data.logo);
}

// Get real-time price
const price = await moralis.getTokenPrice(tokenAddress);
if (price.success) {
  console.log('USD Price:', price.data.price);
  console.log('24h Change:', price.data.priceChange24h);
}

// Get NFTs for wallet
const nfts = await moralis.getNFTs(walletAddress);
if (nfts.success) {
  console.log('NFTs owned:', nfts.data.length);
}
```

## Comparison with Other Services

| Feature | DexScreener | Etherscan v2 | Moralis |
|---------|------------|--------------|---------|
| Token Prices | ✅ Real-time DEX | ❌ | ✅ Real-time |
| Token Metadata | ✅ Basic | ✅ Basic | ✅ Enhanced + Logo |
| Contract Verification | ❌ | ✅ | ❌ |
| Transaction History | ❌ | ✅ | ✅ |
| NFT Data | ❌ | Limited | ✅ Comprehensive |
| Liquidity Data | ✅ | ❌ | ❌ |
| Volume Data | ✅ | ❌ | Limited |
| API Key Required | ❌ | ✅ | ✅ |
| Rate Limits | Generous | 5/sec | 25/sec (free) |

## Best Practices

### 1. Combine Services for Best Results

```typescript
// Use DexScreener for DEX data
const dexData = await dexScreener.getTokenData(address);

// Use Moralis for enhanced metadata
const metadata = await moralis.getTokenMetadata(address);

// Use Etherscan for verification
const verification = await etherscan.getContractVerification(address);

// Combine all data
const enrichedToken = {
  ...metadata.data,
  price: dexData.data?.price,
  liquidity: dexData.data?.liquidity,
  verified: verification.data?.verified
};
```

### 2. Implement Fallbacks

```typescript
// Try Moralis first for price
let priceData = await moralis.getTokenPrice(address);

// Fall back to DexScreener if Moralis fails
if (!priceData.success) {
  priceData = await dexScreener.getTokenData(address);
}
```

### 3. Cache Aggressively

Moralis data is perfect for caching:
- Token metadata: 2-24 hours
- NFT data: 1-2 hours  
- ENS resolution: 24 hours
- Prices: 5 minutes

## API Endpoints

### Base URLs
- **Production**: `https://deep-index.moralis.io/api/v2.2`
- **Chains**: Use chain name ('base', 'ethereum', 'polygon')

### Key Endpoints

```bash
# Token Metadata
GET /erc20/metadata?chain=base&addresses[]={address}

# Token Price
GET /erc20/{address}/price?chain=base

# Native Balance
GET /{address}/balance?chain=base

# Token Transfers
GET /erc20/{address}/transfers?chain=base&limit=100

# NFTs
GET /{address}/nft?chain=base&limit=100

# ENS Resolution
GET /resolve/ens/{domain}
```

## Rate Limits

### Free Tier
- **25 requests/second**
- **40,000 requests/day**
- **Compute Units**: Each endpoint has different costs

### Pro Tier
- Higher limits available
- Priority support
- Advanced endpoints

## Error Handling

Common errors and solutions:

### "Cannot fetch token balances as wallet contains over 2000 tokens"
- Use pagination or filter by specific tokens
- Consider using token transfer history instead

### "Invalid API Key"
- Verify key is correct in `.env`
- Check key is active in Moralis dashboard

### "Chain not supported"
- Ensure using correct chain name
- Check [supported chains](https://docs.moralis.com/web3-data-api/evm/reference#supported-chains)

## Testing

### Quick Test
```bash
# Test your Moralis integration
node scripts/test-moralis-api.js
```

### Test Specific Features
```javascript
// Test token price
curl -X 'GET' \
  'https://deep-index.moralis.io/api/v2.2/erc20/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/price?chain=base' \
  -H 'accept: application/json' \
  -H 'X-API-Key: YOUR_API_KEY'
```

## Integration Status

✅ **Implemented**:
- Service wrapper (`src/services/moralis/`)
- Test script (`scripts/test-moralis-api.js`)
- Type definitions
- Caching support
- Rate limiting

🔄 **Optional Enhancements**:
- Integrate into enrichment service
- Add to API validation script
- Implement batch operations
- Add webhook support

## Resources

- [Moralis Documentation](https://docs.moralis.com/)
- [API Reference](https://docs.moralis.com/web3-data-api/evm/reference)
- [Supported Chains](https://docs.moralis.com/web3-data-api/evm/reference#supported-chains)
- [Pricing](https://moralis.io/pricing/)

---

*Integration added: January 2025*