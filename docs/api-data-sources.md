# API Data Sources Documentation

## Overview
This document provides a comprehensive overview of all external APIs and data sources used by the TNC Bot, including what data is fetched, how it's used, and caching strategies.

## API Data Sources Table

| API Provider | Endpoint/Service | Data Fetched | Usage | Cache TTL | Rate Limits |
|-------------|------------------|--------------|-------|-----------|-------------|
| **Basescan API** | `api.etherscan.io/v2/api` | Contract creation details (deployer, factory, tx hash) | Identify factory contracts and deployers | 24 hours | 5 req/sec, retry with backoff |
| | `getsourcecode` | Contract verification status, source code, compiler info | Display verification status | 24 hours | 5 req/sec |
| | `tokensupply` | Total token supply | Calculate holder percentages | 1 hour | 5 req/sec |
| | `txlist` | Transaction history | Calculate wallet age | 1 hour | 5 req/sec |
| **DexScreener API** | `/dex/tokens/{address}` | Price, volume, market cap, pair info | Display market data | 5 minutes | No explicit limit |
| | `/orders/v1/base/{address}` | Paid feature detection | Check for premium features | 5 minutes | No explicit limit |
| | `/token-profiles/latest/v1` | Token profile banners | Display token branding | 5 minutes | No explicit limit |
| | `/token-boosts/latest/v1` | Boost status | Show promotion status | 5 minutes | No explicit limit |
| **Moralis API** | `getTokenOwners()` | Top token holders, balances, percentages | Display holder distribution | 15 minutes | API key based |
| **Base RPC (Alchemy)** | `base-mainnet.g.alchemy.com` | Contract bytecode, token metadata | Verify contracts, get token info | N/A | Provider limits |
| **Ethereum RPC** | `eth.llamarpc.com` | ENS/Basename resolution | Resolve addresses to names | Disabled | Provider limits |
| **Telegram API** | Bot API | Message operations | Bot communication | N/A | Custom rate limiting |

## Detailed API Usage

### 1. Basescan API (Primary Blockchain Data)

#### Contract Creation Details
- **Purpose**: Identify who deployed a contract and from which factory
- **Response Data**:
  - `contractCreator`: Deployer wallet address
  - `txHash`: Creation transaction hash
  - Factory contract address (if applicable)
- **Business Logic**: Used to determine if a token was deployed by known factories (Clanker, Flaunch, etc.)

#### Contract Verification
- **Purpose**: Check if contract source code is verified on Basescan
- **Response Data**:
  - Verification status (verified/unverified)
  - Source code (if verified)
  - Compiler version and optimization settings
- **Display**: Shows "✅ Verified" or "❌ Not Verified" in bot responses

#### Token Supply
- **Purpose**: Get total supply for percentage calculations
- **Integration**: Combined with holder data to show ownership percentages

### 2. DexScreener API (Market Intelligence)

#### Market Data
- **Real-time Data**:
  - Current price in USD
  - 24-hour trading volume
  - Market capitalization
  - Liquidity pool information
- **Calculated Metrics**:
  - Token age (from pair creation timestamp)
  - Price changes over time periods

#### Premium Features Detection
- **Checks for**:
  - Paid banners
  - Token boosts
  - Profile customization
- **Display**: Shows banner images when available

### 3. Moralis API (Holder Analysis)

#### Token Holder Distribution
- **Processing**:
  1. Fetches all token holders
  2. Filters out contract addresses
  3. Excludes zero addresses
  4. Returns top 5 human holders
- **Data Points**:
  - Holder address (truncated for display)
  - Balance amount
  - Percentage of total supply
- **Display Format**: "1. 0x1234...5678: 2.50%"

### 4. Blockchain RPC Providers

#### Base Network (Primary Chain)
- **Contract Verification**: Checks if address has contract code
- **Token Metadata**: Retrieves name, symbol, decimals
- **Transaction Details**: Gets creation transaction data

#### Ethereum Mainnet
- **ENS/Basename Resolution**: Currently disabled for performance
- **Future Use**: Cross-chain data validation

## Data Aggregation Flow

```
User Request → Bot
    ↓
Cache Check (Redis)
    ↓ (if miss)
Parallel API Calls:
├── Basescan (Creation + Verification)
├── DexScreener (Market Data)
└── Moralis (Holders - if needed)
    ↓
Data Aggregation & Formatting
    ↓
Cache Storage (with TTL)
    ↓
Response to User
```

## Caching Strategy

### Cache Layers
1. **Redis Cache**: Primary cache for all API responses
2. **Component Caching**: Separate TTL for each data type
3. **Smart Invalidation**: Refreshes stale data proactively

### TTL Configuration
- **Short (5 min)**: Market data (prices change frequently)
- **Medium (15 min)**: Holder data (moderate change frequency)
- **Long (1-24 hours)**: Static data (verification, creation info)

## Rate Limiting & Performance

### API Rate Limits
- **Basescan**: 5 requests/second with exponential backoff
- **DexScreener**: No explicit limit, monitored for best practices
- **Moralis**: Based on API subscription tier
- **Telegram**: Custom wrapper to prevent hitting limits

### Performance Optimizations
1. **Parallel Processing**: Multiple API calls executed simultaneously
2. **Cache-First**: Always check cache before external calls
3. **Graceful Degradation**: Missing data doesn't break responses
4. **Retry Logic**: Automatic retries with backoff for failures

## Error Handling

### Failure Scenarios
- **API Timeout**: Falls back to cached data if available
- **Rate Limit Hit**: Implements exponential backoff
- **Invalid Response**: Returns partial data with clear indicators
- **Network Issues**: Queues requests for retry

### Monitoring
- Real-time success/failure tracking per API
- Performance metrics collection
- Error rate monitoring by service
- Automatic health checks and alerts

## Factory Contract Mappings

### Known Factories (customNames.json)
| Factory Address | Platform Name | Purpose |
|----------------|---------------|---------|
| `0x2a787b2362021cc3eea3c24c4748a6cd5b687382` | Clanker | Token deployment |
| `0xfa9e8528ee95eb109bffd1a2d59cb95b300a672a` | Flaunch | Fair launch tokens |
| `0x42f4f5a3389ca0bed694de339f4d432acddb1ea9` | Virtual | Virtual protocol |
| `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` | Zora | NFT/Token creation |
| Multiple addresses | ape.store | Various token operations |

## External Service Links

The bot provides links to external services for additional analysis:
- **Basescan**: Contract and transaction exploration
- **DexScreener**: Trading interface and charts
- **0xppl**: Wallet analysis and history
- **Platform-specific**: Direct links to Clanker, Flaunch, etc.

## Future Enhancements

### Planned API Integrations
- Additional DEX APIs for comprehensive liquidity data
- Social sentiment APIs for community metrics
- On-chain analytics providers for advanced metrics
- Cross-chain data providers for multi-network support

### Performance Improvements
- Implement webhook support for real-time updates
- Add predictive caching for frequently requested tokens
- Optimize batch API calls for multiple token analysis
- Implement distributed caching for scalability