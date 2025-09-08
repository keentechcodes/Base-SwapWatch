# Spec Requirements Document

> Spec: API Data Enrichment
> Created: 2025-09-08

## Overview

Integrate external APIs (DexScreener, BaseScan, Token Metadata) to enrich webhook events with real-time market data, token information, and USD values. This feature will transform basic swap notifications into comprehensive market intelligence reports with price context, token details, and transaction analytics.

## User Stories

### Trader Monitoring Swaps

As a crypto trader, I want to see the USD value and market context when monitoring swap transactions, so that I can quickly assess the significance of trades without manually checking multiple sources.

When a swap webhook is received, the system enriches the event with current token prices, calculates USD values for the swapped amounts, and displays market metrics like liquidity and 24h volume. This enables traders to instantly understand if a whale is making significant moves or if unusual trading patterns are emerging.

### Protocol Analyst Tracking DEX Activity  

As a protocol analyst, I want to see verified contract information and token metadata for swap events, so that I can distinguish between legitimate projects and potential scams.

The system fetches contract verification status from BaseScan, retrieves token metadata including official names and symbols, and identifies if tokens are from known factories like Clanker or Flaunch. This helps analysts filter noise and focus on meaningful DeFi activity.

## Spec Scope

1. **DexScreener Integration** - Fetch real-time price data, market cap, volume, and liquidity metrics for tokens involved in swaps
2. **BaseScan API Integration** - Retrieve contract verification status, creation details, and transaction enrichment data
3. **Token Metadata Service** - Collect token names, symbols, decimals, and logos for improved event readability
4. **Caching Layer** - Implement Redis-based caching with intelligent TTLs to optimize API usage and response times
5. **Rate Limiting Protection** - Add exponential backoff and retry logic to handle API rate limits gracefully

## Out of Scope

- Price aggregator services (CoinGecko, CoinMarketCap) for now
- Historical price charts or technical analysis
- Cross-chain data fetching beyond Base network
- Notification services integration (Discord, Telegram)
- Database storage of enriched events

## Expected Deliverable

1. Webhook events display USD values for all swap amounts with proper decimal handling
2. Console output shows token names, verification status, and key market metrics alongside swap detection
3. API responses are cached appropriately with data freshness indicators for future UI compatibility