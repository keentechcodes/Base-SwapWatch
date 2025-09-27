# CDP Webhook Manager

A comprehensive command-line tool for managing Coinbase Developer Platform (CDP) webhooks. This tool provides both an interactive mode and direct command-line interface for complete webhook lifecycle management.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Authentication](#authentication)
- [Usage](#usage)
  - [Interactive Mode](#interactive-mode)
  - [Command Line Mode](#command-line-mode)
- [Commands](#commands)
- [Event Types](#event-types)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Features

- 🔍 **List Webhooks** - View all configured webhooks with detailed information
- ➕ **Create Webhooks** - Set up new webhooks with custom configurations
- ✏️ **Update Webhooks** - Modify existing webhook settings
- 📍 **Manage Addresses** - Add or remove monitored wallet addresses
- ✅ **Activate/Deactivate** - Enable or disable webhooks without deletion
- 🗑️ **Delete Webhooks** - Remove webhooks with confirmation
- 🎨 **Color-coded Output** - Enhanced readability with colored terminal output
- 🤝 **Interactive Mode** - Guided interface for webhook management

## Prerequisites

- Node.js (v14 or higher)
- CDP API credentials (API Key ID and Secret)
- `@coinbase/cdp-sdk` package installed

## Installation

The webhook manager is already included in your project. Ensure you have the required dependencies:

```bash
npm install @coinbase/cdp-sdk
```

## Authentication

The tool uses CDP API credentials configured in the script. Update these values in `/scripts/cdp-webhook-manager.js`:

```javascript
const API_KEY_ID = 'your-api-key-id';
const API_SECRET = 'your-api-secret';
```

> **Security Note**: For production use, consider loading these from environment variables:
> ```javascript
> const API_KEY_ID = process.env.CDP_API_KEY_ID;
> const API_SECRET = process.env.CDP_API_SECRET;
> ```

## Usage

### Interactive Mode

Launch the interactive interface for guided webhook management:

```bash
npm run webhook
# or
node scripts/cdp-webhook-manager.js
```

The interactive menu provides numbered options:
1. List webhooks
2. Create webhook
3. Update webhook
4. Manage addresses
5. Activate webhook
6. Deactivate webhook
7. Delete webhook
8. Exit

### Command Line Mode

Execute specific operations directly from the command line:

```bash
# Using npm scripts
npm run webhook:<command> [options]

# Direct execution
node scripts/cdp-webhook-manager.js <command> [options]
```

## Commands

### List Webhooks

Display all configured webhooks:

```bash
npm run webhook:list
# With detailed information
node scripts/cdp-webhook-manager.js list --detailed
```

**Output includes:**
- Webhook ID
- Network (e.g., base-mainnet)
- Event type
- Notification URL
- Status (ACTIVE/INACTIVE)
- Monitored addresses (if configured)
- Creation timestamp

### Create Webhook

Create a new webhook subscription:

```bash
npm run webhook:create -- --url <notification-url> [options]

# With all options
node scripts/cdp-webhook-manager.js create \
  --url https://your-server.com/webhook \
  --event wallet_activity \
  --addresses 0x123...,0x456...
```

**Options:**
- `--url` (required): Webhook notification endpoint URL
- `--event`: Event type to monitor (default: wallet_activity)
- `--addresses`: Comma-separated list of wallet addresses to monitor

### Update Webhook

Modify an existing webhook configuration:

```bash
npm run webhook:update -- <webhook-id> [options]

# Example
node scripts/cdp-webhook-manager.js update abc-123 \
  --url https://new-server.com/webhook \
  --addresses 0x789...,0xabc...
```

**Options:**
- `--url`: New notification URL
- `--addresses`: New set of addresses (replaces existing)
- `--status`: Set status (active|inactive)

### Monitor Addresses

Add or remove addresses from an existing webhook:

```bash
npm run webhook:monitor -- <webhook-id> [options]

# Add addresses
node scripts/cdp-webhook-manager.js monitor abc-123 \
  --add 0x111...,0x222...

# Remove addresses
node scripts/cdp-webhook-manager.js monitor abc-123 \
  --remove 0x333...

# Both operations
node scripts/cdp-webhook-manager.js monitor abc-123 \
  --add 0x444... \
  --remove 0x555...
```

**Options:**
- `--add`: Comma-separated addresses to add
- `--remove`: Comma-separated addresses to remove
- `--list`: Display current addresses after update

### Activate Webhook

Enable a deactivated webhook:

```bash
npm run webhook:activate -- <webhook-id>
# or
node scripts/cdp-webhook-manager.js activate abc-123
```

### Deactivate Webhook

Temporarily disable a webhook without deletion:

```bash
npm run webhook:deactivate -- <webhook-id>
# or
node scripts/cdp-webhook-manager.js deactivate abc-123
```

### Delete Webhook

Permanently remove a webhook (with confirmation):

```bash
npm run webhook:delete -- <webhook-id>
# or
node scripts/cdp-webhook-manager.js delete abc-123
```

## Event Types

CDP supports the following webhook event types:

| Event Type | Description |
|------------|-------------|
| `wallet_activity` | All wallet-related events |
| `erc20_transfer` | ERC-20 token transfers |
| `erc721_transfer` | NFT (ERC-721) transfers |
| `erc1155_transfer` | Multi-token (ERC-1155) transfers |
| `smart_contract_event` | Smart contract interactions |
| `transaction` | All blockchain transactions |

## Examples

### Example 1: Monitor Specific Token Transfers

Create a webhook to monitor USDC transfers for specific wallets:

```bash
node scripts/cdp-webhook-manager.js create \
  --url https://api.myapp.com/cdp-webhook \
  --event erc20_transfer \
  --addresses 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6,0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed
```

### Example 2: Update Webhook URL

Change the notification endpoint for an existing webhook:

```bash
node scripts/cdp-webhook-manager.js update d4f8e9c2-1a3b-4e5d-9f7a-2c8b6e4d0a1f \
  --url https://new-api.myapp.com/webhook
```

### Example 3: Add New Addresses to Monitor

Add additional addresses to an existing webhook:

```bash
node scripts/cdp-webhook-manager.js monitor d4f8e9c2-1a3b-4e5d-9f7a-2c8b6e4d0a1f \
  --add 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199,0xdD2FD4581271e230360230F9337D5c0430Bf44C0
```

### Example 4: Temporarily Disable Webhook

Deactivate a webhook during maintenance:

```bash
# Deactivate
npm run webhook:deactivate -- d4f8e9c2-1a3b-4e5d-9f7a-2c8b6e4d0a1f

# Later, reactivate
npm run webhook:activate -- d4f8e9c2-1a3b-4e5d-9f7a-2c8b6e4d0a1f
```

### Example 5: Interactive Webhook Creation

Use the interactive mode for guided setup:

```bash
$ npm run webhook

CDP Webhook Manager - Interactive Mode

What would you like to do?
  1. List webhooks
  2. Create webhook
  3. Update webhook
  4. Manage addresses
  5. Activate webhook
  6. Deactivate webhook
  7. Delete webhook
  8. Exit

Choice (1-8): 2
Notification URL: https://api.myapp.com/webhook
Available event types:
  • wallet_activity: All wallet events
  • erc20_transfer: ERC-20 token transfers
  ...
Event type (default: wallet_activity): erc20_transfer
Addresses to monitor (comma-separated, optional): 0x123...,0x456...

✅ Webhook created successfully!
  ID: abc-def-123
  Status: ACTIVE
```

## Troubleshooting

### Authentication Errors

If you receive 401 Unauthorized errors:

1. Verify your API credentials are correct
2. Ensure the API secret is properly base64 encoded
3. Check that your API key has webhook permissions in the CDP dashboard

### Connection Issues

For network-related errors:

1. Check your internet connection
2. Verify the CDP API endpoint is accessible: `https://api.cdp.coinbase.com`
3. Check for any firewall or proxy restrictions

### Invalid Event Types

If webhook creation fails with invalid event type:

1. Use one of the supported event types listed above
2. Check CDP documentation for any updates to supported events
3. Ensure the event type matches your network (some events may be chain-specific)

### Address Format Errors

For address-related issues:

1. Ensure addresses are valid Ethereum addresses (42 characters starting with 0x)
2. Remove any spaces or special characters
3. Use lowercase addresses for consistency

## Advanced Configuration

### Environment Variables

For production deployments, use environment variables:

```bash
# .env file
CDP_API_KEY_ID=your-api-key-id
CDP_API_SECRET=your-api-secret
CDP_NETWORK=base-mainnet
```

Update the script to use these variables:

```javascript
require('dotenv').config();

const API_KEY_ID = process.env.CDP_API_KEY_ID;
const API_SECRET = process.env.CDP_API_SECRET;
const DEFAULT_NETWORK = process.env.CDP_NETWORK || 'base-mainnet';
```

### Custom Networks

To monitor different blockchain networks, modify the `createWebhook` function:

```javascript
const webhookData = {
  network_id: options.network || 'base-mainnet', // Allow network selection
  event_type: event,
  notification_uri: url,
  signature_header: secret
};
```

### Batch Operations

For managing multiple webhooks, create wrapper scripts:

```bash
#!/bin/bash
# batch-create-webhooks.sh

ADDRESSES="0x123...,0x456..."
URL="https://api.myapp.com/webhook"

for EVENT in erc20_transfer erc721_transfer; do
  node scripts/cdp-webhook-manager.js create \
    --url "$URL" \
    --event "$EVENT" \
    --addresses "$ADDRESSES"
done
```

## API Rate Limits

CDP API has rate limits. The webhook manager includes:
- Automatic retry logic for failed requests
- Exponential backoff for rate limit errors
- Clear error messages for debugging

## Support

For issues or questions:

1. Check the [CDP Documentation](https://docs.cdp.coinbase.com)
2. Review webhook-specific guides in the CDP dashboard
3. Check the script's help command: `npm run webhook -- help`

## License

This tool is part of your project and follows your project's license terms.