# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-27-trpc-ui-integration/spec.md

> Created: 2025-09-27
> Version: 1.0.0

## Technical Requirements

### Backend Architecture
- Implement tRPC server with standalone HTTP adapter on port 3000
- WebSocket server using ws adapter on port 3001 for subscriptions
- Type-safe routers using Zod for input validation
- Redis integration for room storage with 24-hour TTL
- EventEmitter pattern for real-time swap broadcasting
- Superjson transformer for Date/BigInt serialization

### Frontend Integration
- Move UI/ folder contents to src/app for Next.js app directory structure
- Replace BroadcastChannel with tRPC WebSocket subscriptions
- Implement tRPC client with wsLink for real-time updates
- Convert mock data generation to real enriched swap data
- Type-safe API calls using generated AppRouter types
- Environment variables for API_URL and WS_URL configuration

### Room Management System
- 5-character room codes using alphanumeric without confusing characters (I,O,0,1)
- Redis key structure: `room:{code}` for room data, `room:{code}:swaps` for history
- Maximum 50 wallets per room to prevent abuse
- Automatic room expiration after 24 hours of creation
- Room presence tracking using WebSocket connection count

### Data Flow Architecture
- Coinbase webhook → Parse swap → Check all rooms for wallet match
- Matched swaps → Enrich with DexScreener/BaseScan data → Store in room history
- Emit enriched swap via EventEmitter → Broadcast to WebSocket subscribers
- Optional Telegram notification if configured and above threshold

### Package Manager Migration
- Convert package.json scripts from npm to pnpm
- Update CI/CD pipelines to use pnpm
- Create pnpm-workspace.yaml if monorepo structure needed
- Document pnpm installation and usage in README

### Performance Requirements
- WebSocket message delivery < 100ms latency
- Support 100+ concurrent rooms
- Handle 50+ swaps per second across all rooms
- Redis operations < 10ms response time
- API response times < 200ms for queries

## External Dependencies

- **@trpc/server** (^10.x) - Core tRPC server implementation
- **@trpc/client** (^10.x) - tRPC client for frontend
- **@trpc/server/adapters/standalone** - HTTP server adapter
- **@trpc/server/adapters/ws** - WebSocket adapter for subscriptions
- **ws** (^8.x) - WebSocket server implementation
- **zod** (^3.x) - Runtime type validation for tRPC procedures
- **superjson** - Serialization of complex types over network
- **socket.io-client** - Alternative if tRPC subscriptions have issues

**Justification:** tRPC provides end-to-end type safety between backend and frontend, eliminating API contract mismatches and improving developer experience with autocomplete and type checking throughout the stack.