# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-03-webhook-demo-app/spec.md

## Endpoints

### POST /webhook

**Purpose:** Receive and process webhook notifications from Coinbase Developer Platform
**Parameters:** 
- Headers:
  - `x-webhook-signature`: HMAC signature for payload verification
  - `content-type`: Must be `application/json`
- Body: JSON webhook payload containing event data
**Response:** 
- Success: `200 OK` with `{ "status": "received" }`
- Invalid signature: `401 Unauthorized` with error message
- Invalid payload: `400 Bad Request` with error details
**Errors:**
- 401: Invalid or missing webhook signature
- 400: Malformed JSON or missing required fields
- 500: Internal processing error

### GET /health

**Purpose:** Health check endpoint for monitoring webhook server status
**Parameters:** None
**Response:** 
- `200 OK` with status object:
```json
{
  "status": "healthy",
  "uptime": 12345,
  "timestamp": "2025-09-03T10:00:00Z",
  "webhook_configured": true
}
```
**Errors:** None expected

### GET /

**Purpose:** Basic information endpoint for server identification
**Parameters:** None
**Response:**
- `200 OK` with service info:
```json
{
  "service": "SwapWatch Webhook Demo",
  "version": "1.0.0",
  "status": "running"
}
```
**Errors:** None expected

## Webhook Event Handlers

### handleSwapEvent(payload)

**Purpose:** Process swap-specific events from webhook payload
**Logic:**
1. Identify if event is swap-related (check contract addresses against known DEX routers)
2. Extract token pair information from event data
3. Calculate swap amounts and direction
4. Format and log swap details to console

### verifyWebhookSignature(payload, signature)

**Purpose:** Validate webhook authenticity using HMAC signature
**Logic:**
1. Recreate expected signature using webhook secret and payload
2. Compare provided signature with expected using timing-safe comparison
3. Return boolean validation result

### parseWebhookEvent(payload)

**Purpose:** Extract and normalize event data from webhook payload
**Logic:**
1. Identify event type from payload structure
2. Map CDP event fields to internal format
3. Return normalized event object or null if unsupported