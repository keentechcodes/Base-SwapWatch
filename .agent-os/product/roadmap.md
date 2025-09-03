# Product Roadmap

## Phase 1: Core Webhook Infrastructure

**Goal:** Establish reliable webhook reception and processing for swap events
**Success Criteria:** Successfully receive and validate Coinbase webhook notifications for test wallets

### Features

- [ ] Set up Node.js/Express webhook server - Configure endpoint for receiving webhooks `S`
- [ ] Implement Coinbase SDK integration - Initialize SDK with API keys `S`
- [ ] Create webhook signature verification - Validate HMAC signatures for security `S`
- [ ] Set up PostgreSQL database schema - Design tables for wallets and events `M`
- [ ] Implement basic swap event parser - Extract key swap data from webhooks `M`
- [ ] Create wallet registration endpoint - API to add wallets for monitoring `S`
- [ ] Set up development environment - Docker compose for local testing `S`

### Dependencies

- Coinbase Developer Platform account and API keys
- PostgreSQL database instance
- Node.js runtime environment

## Phase 2: Swap Detection & Notification

**Goal:** Accurately detect swap transactions and send real-time notifications
**Success Criteria:** Detect 95% of swap events with <2 second notification latency

### Features

- [ ] Implement smart contract event decoder - Parse swap events from different DEXs `L`
- [ ] Create notification queue system - Redis/Bull for reliable message delivery `M`
- [ ] Build Discord bot integration - Send formatted swap alerts to Discord `M`
- [ ] Add Telegram bot support - Alternative notification channel `M`
- [ ] Implement notification templates - Rich message formatting with swap details `S`
- [ ] Add swap value calculations - Convert token amounts to USD values `M`
- [ ] Create notification rate limiting - Prevent spam during high activity `S`

### Dependencies

- Redis instance for queue management
- Discord/Telegram bot tokens
- Price oracle integration (CoinGecko/Coinbase)

## Phase 3: Analytics Dashboard

**Goal:** Provide comprehensive swap analytics and historical data
**Success Criteria:** Interactive dashboard with <500ms query response times

### Features

- [ ] Build React frontend application - SPA for analytics dashboard `L`
- [ ] Create swap history API endpoints - RESTful API for data retrieval `M`
- [ ] Implement chart visualizations - Swap volume, frequency, token distribution `L`
- [ ] Add wallet portfolio tracking - Track token balances over time `L`
- [ ] Create CSV/JSON export functionality - Download historical data `S`
- [ ] Build search and filtering system - Find specific swaps quickly `M`
- [ ] Add real-time WebSocket updates - Live dashboard updates `M`

### Dependencies

- React development environment
- Chart library (Recharts)
- WebSocket server setup