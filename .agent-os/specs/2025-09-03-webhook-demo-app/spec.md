# Spec Requirements Document

> Spec: Webhook Demo App
> Created: 2025-09-03

## Overview

Build a minimal webhook receiver application to test core Coinbase Developer Platform webhook functionality for monitoring wallet swap transactions. This demo will validate webhook integration, signature verification, and basic event processing using ngrok for local development tunneling.

## User Stories

### Webhook Developer Testing

As a developer new to webhooks, I want to quickly set up a local webhook receiver, so that I can test CDP webhook events without deploying to production.

The developer runs a simple Node.js server locally, uses ngrok to expose it to the internet, configures the webhook URL in the CDP portal, and immediately starts receiving real swap events from monitored wallets. They can see formatted webhook payloads in the console with clear indication of swap transactions, helping them understand the webhook data structure and validate their API integration.

### Event Processing Validation

As a developer, I want to verify webhook signature and parse swap events, so that I can ensure secure and accurate event processing.

When a webhook is received, the application automatically validates the HMAC signature to ensure authenticity, parses the event payload to identify swap transactions specifically, and logs detailed information about the swap including token pairs, amounts, and transaction hashes. This provides confidence that the integration is working correctly and securely.

## Spec Scope

1. **Webhook Receiver Server** - Express.js server with POST endpoint to receive CDP webhook notifications
2. **Signature Verification** - HMAC-SHA256 validation to ensure webhook authenticity from Coinbase
3. **Event Parsing & Logging** - Extract and display swap-specific data from webhook payloads in readable format
4. **Ngrok Integration** - Setup instructions and script to create public tunnel for local development
5. **Configuration Management** - Environment variables for API keys, webhook secrets, and monitored addresses

## Out of Scope

- Database storage of events (only console logging)
- Frontend UI or dashboard
- Multiple notification channels (Discord, Telegram, etc.)
- Production deployment configuration
- Complex swap analysis or trading logic
- Historical event replay or persistence

## Expected Deliverable

1. Running local server that successfully receives and validates CDP webhooks when accessed through ngrok tunnel
2. Console output showing parsed swap events with transaction details, token information, and amounts when monitored wallets perform swaps
3. Clear setup documentation with step-by-step instructions for CDP webhook configuration and ngrok setup