# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-09-27-cloudflare-deployment-architecture/spec.md

> Created: 2025-09-27
> Status: Ready for Implementation

## Tasks

- [x] 1. Set up Cloudflare account and domain infrastructure
  - [x] 1.1 Write tests for domain verification and DNS configuration
  - [x] 1.2 Create Cloudflare account and verify email
  - [x] 1.3 Register domain through Cloudflare Registrar (swapwatch.app)
  - [x] 1.4 Configure DNS settings with Cloudflare nameservers
  - [x] 1.5 Enable Universal SSL and configure security settings
  - [x] 1.6 Set up Cloudflare Pages project linked to GitHub repository
  - [x] 1.7 Configure environment variables in Cloudflare dashboard
  - [x] 1.8 Verify domain resolves and SSL certificate is active

- [x] 2. Implement Durable Objects for room management
  - [x] 2.1 Write tests for Durable Object lifecycle and storage operations
  - [x] 2.2 Install Wrangler CLI and initialize Workers project with pnpm
  - [x] 2.3 Create RoomDurableObject class with WebSocket handler
  - [x] 2.4 Implement storage schema for wallets, labels, and configuration
  - [x] 2.5 Add WebSocket hibernation API for cost-effective connections
  - [x] 2.6 Implement room expiration using alarm API (24-hour lifecycle)
  - [x] 2.7 Create RPC methods for inter-service communication
  - [x] 2.8 Verify all Durable Object tests pass locally with Miniflare

- [ ] 3. Deploy Workers API and webhook processing
  - [ ] 3.1 Write tests for API endpoints and webhook signature verification
  - [ ] 3.2 Create main Worker script with routing logic
  - [ ] 3.3 Implement Coinbase webhook handler with signature verification
  - [ ] 3.4 Add room CRUD operations (create, join, manage wallets)
  - [ ] 3.5 Configure Worker bindings for Durable Objects namespace
  - [ ] 3.6 Deploy Worker to Cloudflare with wrangler deploy
  - [ ] 3.7 Set up custom routes for api.swapwatch.app subdomain
  - [ ] 3.8 Verify webhook processing and API endpoints work in production

- [ ] 4. Migrate and deploy frontend to Cloudflare Pages
  - [ ] 4.1 Write tests for edge runtime compatibility
  - [ ] 4.2 Move UI folder contents to main application structure
  - [ ] 4.3 Add @cloudflare/next-on-pages adapter and configure build
  - [ ] 4.4 Update all server components with export const runtime = "edge"
  - [ ] 4.5 Replace environment variables to use Cloudflare bindings
  - [ ] 4.6 Configure Pages build settings and Node 20 in .nvmrc
  - [ ] 4.7 Deploy to Cloudflare Pages and verify build success
  - [ ] 4.8 Verify frontend loads and connects to Worker API

- [ ] 5. Integrate WebSocket connections and real-time updates
  - [ ] 5.1 Write tests for WebSocket client reconnection and message handling
  - [ ] 5.2 Update frontend to connect directly to Durable Object WebSockets
  - [ ] 5.3 Replace mock data generation with real enriched swap events
  - [ ] 5.4 Implement presence tracking and viewer count updates
  - [ ] 5.5 Add connection status indicators and reconnection logic
  - [ ] 5.6 Test real-time swap broadcasting across multiple clients
  - [ ] 5.7 Implement Telegram notification dispatch for configured rooms
  - [ ] 5.8 Verify all real-time features work end-to-end