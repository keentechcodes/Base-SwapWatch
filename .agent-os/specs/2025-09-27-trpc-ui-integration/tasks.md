# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-09-27-trpc-ui-integration/spec.md

> Created: 2025-09-27
> Status: **SUPERSEDED** - See @.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/tasks.md

## ⚠️ SUPERSEDED NOTICE

**These tasks have been superseded by the Cloudflare Deployment Architecture tasks.**

The project has pivoted to use Cloudflare's edge infrastructure. Please refer to `.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/tasks.md` for the current implementation tasks.

---

## Original Tasks (For Historical Reference)

- [ ] 1. Set up tRPC backend infrastructure
  - [ ] 1.1 Write tests for tRPC server initialization and context
  - [ ] 1.2 Install tRPC dependencies with pnpm (server, client, adapters, ws, zod, superjson)
  - [ ] 1.3 Create base tRPC server setup with context and router initialization
  - [ ] 1.4 Set up standalone HTTP server on port 3000
  - [ ] 1.5 Configure WebSocket server on port 3001 for subscriptions
  - [ ] 1.6 Implement error handling and CORS configuration
  - [ ] 1.7 Verify all server initialization tests pass

- [ ] 2. Implement room management system
  - [ ] 2.1 Write tests for room CRUD operations and Redis integration
  - [ ] 2.2 Create room router with create, join, and management procedures
  - [ ] 2.3 Implement Redis storage with 24-hour TTL for rooms
  - [ ] 2.4 Add wallet tracking functionality (add/remove/list)
  - [ ] 2.5 Create room code generation logic (5-char alphanumeric)
  - [ ] 2.6 Implement room expiration and cleanup
  - [ ] 2.7 Add room statistics tracking (swaps, volume, top tokens)
  - [ ] 2.8 Verify all room management tests pass

- [ ] 3. Integrate webhook processing with rooms
  - [ ] 3.1 Write tests for webhook-to-room matching logic
  - [ ] 3.2 Modify webhook handler to check room wallet lists
  - [ ] 3.3 Store enriched swaps in room-specific Redis lists
  - [ ] 3.4 Implement EventEmitter for room-based swap broadcasting
  - [ ] 3.5 Add Telegram notification dispatch for configured rooms
  - [ ] 3.6 Verify webhook integration tests pass

- [ ] 4. Implement real-time subscriptions
  - [ ] 4.1 Write tests for WebSocket subscription handlers
  - [ ] 4.2 Create subscription procedures (onSwap, onWalletUpdate, onPresence)
  - [ ] 4.3 Implement observable pattern for real-time events
  - [ ] 4.4 Add presence tracking for active room viewers
  - [ ] 4.5 Test subscription cleanup on disconnect
  - [ ] 4.6 Verify all subscription tests pass

- [ ] 5. Migrate and integrate UI with tRPC client
  - [ ] 5.1 Write tests for tRPC client configuration
  - [ ] 5.2 Move UI folder contents to main app structure
  - [ ] 5.3 Install tRPC client dependencies in frontend
  - [ ] 5.4 Configure tRPC client with WebSocket link
  - [ ] 5.5 Replace mock data with tRPC API calls
  - [ ] 5.6 Convert BroadcastChannel to tRPC subscriptions
  - [ ] 5.7 Update components to display enriched swap data
  - [ ] 5.8 Verify all frontend integration tests pass