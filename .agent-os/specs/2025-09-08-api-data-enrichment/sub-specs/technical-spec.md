# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-08-api-data-enrichment/spec.md

## Technical Requirements

### API Integration Architecture
- Create new `src/services/` directory for API service modules
- Implement separate service classes for each API provider (DexScreenerService, BaseScanService, TokenMetadataService)
- Use axios with custom interceptors for request/response handling
- Implement retry logic with exponential backoff for failed requests
- Add request queuing to respect rate limits (5 req/sec for BaseScan)

### Data Enrichment Pipeline
- Create `SwapEnricher` class that orchestrates API calls when webhook events arrive
- Fetch data in parallel where possible to minimize latency
- Implement graceful degradation - missing API data shouldn't break webhook processing
- Add data transformation layer to normalize responses across different APIs
- Calculate USD values using token decimals and current prices

### Caching Strategy (Redis)
- Implement cache-first approach with fallback to API calls
- Use component-specific TTLs:
  - Market data (prices, volume): 5 minutes
  - Token metadata (name, symbol): 2 hours  
  - Contract verification: 24 hours
  - Factory/deployer info: 24 hours
- Add cache warming for frequently accessed tokens
- Implement cache invalidation endpoints for manual refresh

### Enhanced Logging Format
- Extend existing EventLogger to display enriched data
- Add new sections for market metrics and USD values
- Maintain backward compatibility with current swap detection
- Structure output for future JSON export to dashboard
- Include cache hit/miss indicators in debug mode

### Error Handling
- Implement circuit breaker pattern for API failures
- Log all API errors with context for debugging
- Return partial data when some APIs fail
- Add health check endpoint for API status monitoring
- Queue failed enrichments for retry

### Performance Optimization  
- Target < 500ms additional latency for enrichment
- Implement connection pooling for Redis
- Use batch API calls where supported
- Add performance metrics collection
- Monitor and alert on API quota usage

## External Dependencies

- **redis** (^4.6.0) - High-performance caching layer for API responses
  - **Justification:** Prevents redundant API calls, reduces latency, and helps manage rate limits effectively
  
- **axios** (^1.6.0) - HTTP client for API requests
  - **Justification:** Industry standard with interceptors, retry support, and excellent error handling
  
- **p-limit** (^5.0.0) - Concurrency control for parallel API calls
  - **Justification:** Prevents overwhelming APIs while maximizing throughput
  
- **axios-retry** (^4.0.0) - Automatic retry logic for failed requests
  - **Justification:** Handles transient failures and rate limit responses gracefully