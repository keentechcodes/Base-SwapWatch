# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/spec.md

## Technical Requirements

### Cloudflare Pages Configuration
- Next.js 15 deployment using @cloudflare/next-on-pages adapter
- Edge runtime compatibility with `export const runtime = "edge"` in server components
- Environment variables managed through Cloudflare dashboard
- Build command: `pnpm build` with Node 20 specified in .nvmrc
- Output directory: `.vercel/output/static` for Pages compatibility
- Custom domain setup with CNAME record to pages.dev

### Workers Architecture
- API routes deployed as separate Worker for better control
- Binding to Durable Objects namespace for room management
- Environment bindings for KV namespaces and secrets
- CORS headers for frontend communication
- Request routing: `/api/*` to Worker, `/*` to Pages
- Maximum 50ms CPU time per request (free tier limit)

### Durable Objects Implementation
- One Durable Object instance per room (room code as name)
- WebSocket hibernation API for cost-effective idle connections
- Storage API using both KV (for simple data) and SQL (for swap history)
- Automatic expiration using alarm API (24-hour room lifecycle)
- Maximum 128MB memory per Durable Object instance
- WebSocket message size limit: 1MB per message

### Storage Architecture
```typescript
// Durable Object Storage Schema
interface RoomStorage {
  // KV Storage
  'wallets': string[]              // Tracked wallet addresses
  'labels': Record<string, string> // Wallet labels
  'config': {
    telegramWebhook?: string
    threshold?: number
    createdAt: number
    expiresAt: number
  }

  // SQL Storage (using DO SQL API)
  swaps: {
    id: string
    timestamp: number
    walletAddress: string
    tokenIn: string
    tokenOut: string
    amountInUsd: number
    amountOutUsd: number
    txHash: string
    enrichment: JSON
  }
}
```

### Webhook Processing Flow
- Coinbase webhook → Worker route `/webhook/coinbase`
- Verify signature using Web Crypto API
- Parse swap event and extract wallet address
- Query all active Durable Objects for wallet matches
- Enrich swap data using fetch() to external APIs
- Broadcast to matched rooms via Durable Object RPC
- Store in room's SQL storage for history

### WebSocket Connection Management
- Client connects to: `wss://api.swapwatch.app/room/{code}/ws`
- Worker routes WebSocket upgrade to Durable Object
- Durable Object accepts with hibernation enabled
- Messages batched during hibernation and delivered on wake
- Automatic reconnection handling in frontend
- Presence tracked via connection count

### Edge Runtime Constraints
- No Node.js APIs (fs, path, crypto native modules)
- Use Web Crypto API for cryptographic operations
- Fetch API for all HTTP requests
- Environment variables via `env` binding, not process.env
- Maximum 10ms CPU time for free tier (50ms for paid)
- 128MB memory limit per Worker invocation

### Development Environment
- Wrangler CLI for local development: `wrangler dev`
- Miniflare for Durable Objects testing locally
- Environment files: `.dev.vars` for local secrets
- TypeScript with `@cloudflare/workers-types`
- Vitest for edge-compatible testing

### Deployment Pipeline
- GitHub repository with main branch protection
- Cloudflare Pages GitHub integration for automatic deploys
- Preview deployments for pull requests
- Environment variables per deployment environment
- Rollback capability through Cloudflare dashboard
- Zero-downtime deployments with instant global propagation

### Performance Targets
- Cold start: <50ms for Worker execution
- WebSocket latency: <100ms for message delivery
- Storage operations: <10ms for KV, <20ms for SQL
- Global replication: <1 second for Durable Object state
- Free tier capacity: 100,000 requests/day, 400,000 DO requests/month

## External Dependencies

- **@cloudflare/next-on-pages** - Next.js adapter for Cloudflare Pages
- **wrangler** - Cloudflare Workers CLI for development and deployment
- **@cloudflare/workers-types** - TypeScript definitions for Workers APIs
- **hono** (optional) - Lightweight router for Workers if not using tRPC
- **@trpc/server** - Modified for edge runtime compatibility

**Justification:** Cloudflare's edge-first architecture eliminates traditional infrastructure dependencies while providing global scale, automatic failover, and zero operational overhead. The free tier supports applications up to 100 DAUs with room for 10x growth before incurring costs.