# Spec Requirements Document

> Spec: tRPC UI Integration
> Created: 2025-09-27
> Status: **SUPERSEDED** - See @.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/spec.md

## ⚠️ SUPERSEDED NOTICE

**This spec has been superseded by the Cloudflare Deployment Architecture spec.**

The project has pivoted to use Cloudflare's edge infrastructure (Workers + Durable Objects) instead of a traditional Node.js/Redis stack. The UI integration concepts from this spec remain valid, but the backend implementation has been replaced with:

- **Cloudflare Workers** instead of Node.js tRPC server
- **Durable Objects** instead of Redis for room state
- **Native WebSocket support** with hibernation instead of Socket.io/tRPC subscriptions
- **Edge runtime** instead of Node.js runtime

Please refer to: `.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/` for the current architecture.

---

## Overview

Integrate the Orchids.app-generated UI with a TypeScript tRPC backend to create a fully functional room-based wallet tracking application. This integration will connect the terminal-inspired frontend to real-time blockchain swap data through type-safe API calls and WebSocket subscriptions.

## User Stories

### Crypto Trading Group Monitoring Wallets

As a crypto trading group member, I want to create a shared room with a simple code, so that my group can collectively monitor wallet swap activities on Base network in real-time.

When I visit SwapWatch, I can either create a new room (getting a 5-character code like "TREK23") or join an existing room. Once in the room, anyone can add wallet addresses to track, and all members see the same live swap feed. The terminal-inspired interface shows enriched swap data including token pairs, USD values, price impact, and verification status. Our Telegram group receives notifications for high-value swaps automatically.

### Individual Trader Tracking Smart Money

As an individual trader, I want to track known smart money wallets in a temporary room, so that I can monitor their trading patterns without maintaining permanent infrastructure.

I create a room, add wallets of known profitable traders, and watch their swap activities in real-time. The enriched data shows me exactly what tokens they're trading, the USD values involved, and which DEXs they're using. The room automatically expires after 24 hours, ensuring no data persistence concerns. I can export the swap history before expiration for further analysis.

## Spec Scope

1. **tRPC Backend Architecture** - Implement TypeScript tRPC server with routers for room management, wallet tracking, and real-time subscriptions
2. **Frontend-Backend Integration** - Connect Next.js UI to tRPC backend using type-safe client with WebSocket support for live updates
3. **Package Manager Migration** - Convert project from npm to pnpm for better dependency management and faster installs
4. **UI Refactoring** - Move and refactor Orchids.app-generated UI from UI/ folder to integrate with existing webhook processing and enrichment services
5. **Room-Based Data Flow** - Implement Redis-based room storage with 24-hour TTL and webhook filtering by tracked wallets per room

## Out of Scope

- User authentication or private rooms
- Persistent data storage beyond 24-hour room lifecycle
- Cross-chain support (Base network only for now)
- Mobile native applications
- Advanced trading features (copy trading, automated execution)

## Expected Deliverable

1. Rooms are created with shareable codes and accessible at swapwatch.app/[CODE], showing real-time enriched swap data from tracked wallets
2. WebSocket subscriptions deliver swap events instantly to all room participants with full type safety from backend to frontend
3. Project runs with `pnpm dev` for development and `pnpm build` for production with integrated UI and backend services