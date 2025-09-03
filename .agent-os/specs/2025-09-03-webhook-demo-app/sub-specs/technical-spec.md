# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-03-webhook-demo-app/spec.md

## Technical Requirements

### Server Implementation
- Express.js server running on port 3000 (configurable via PORT env variable)
- Single POST endpoint at `/webhook` to receive CDP webhook notifications
- Request body parsing middleware for JSON payloads up to 10MB
- Raw body access for signature verification (express.raw() middleware)
- Graceful error handling with appropriate HTTP status codes

### Security & Validation
- HMAC-SHA256 signature verification using webhook secret from CDP
- Signature comparison using timing-safe equality check (crypto.timingSafeEqual)
- Request timestamp validation to prevent replay attacks (5-minute window)
- Environment variable validation on startup to ensure required configs

### Event Processing
- Identify event types: `erc20_transfer`, `wallet_activity`, `smart_contract_event`
- Parse swap-specific events from DEX router contracts
- Extract key fields: from, to, token addresses, amounts, transaction hash
- Format output with color coding for different event types (using chalk)
- Timestamp all logged events with ISO 8601 format

### Logging & Monitoring
- Structured console logging with clear event type identification
- Separate log levels: INFO for normal events, ERROR for failures, DEBUG for raw payloads
- Pretty-print JSON payloads for developer readability
- Request/response logging for debugging webhook issues

### Development Tooling
- Ngrok integration script for automatic tunnel creation
- Health check endpoint at `/health` for webhook status verification
- Environment variable template file (.env.example)
- TypeScript type definitions for webhook payload structures

## External Dependencies

- **@coinbase/coinbase-sdk** - Official CDP SDK for webhook signature verification and API interactions
- **Justification:** Required for proper integration with Coinbase Developer Platform webhooks

- **express** (^4.18.0) - Web framework for webhook receiver server
- **Justification:** Lightweight, well-documented framework ideal for simple webhook endpoints

- **dotenv** (^16.0.0) - Environment variable management
- **Justification:** Secure configuration management for API keys and secrets

- **chalk** (^5.0.0) - Terminal output formatting and colors
- **Justification:** Improves developer experience with clear, color-coded console output

- **ngrok** (^5.0.0) - Tunneling service for local development
- **Justification:** Essential for exposing local webhook server to CDP during development