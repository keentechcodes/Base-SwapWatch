# CDP Webhook Utils Documentation

## Overview

`cdp-webhook-utils.sh` is a command-line tool for managing Coinbase Developer Platform webhooks. It provides an easy interface to create, update, and manage webhooks without manually calling the CDP API.

## Setup

### Prerequisites

- Bash shell (Linux/Mac/WSL)
- `jq` for JSON formatting (optional but recommended)
- CDP API credentials in `.env` file

### Installation

```bash
# Make script executable
chmod +x cdp-webhook-utils.sh

# Install jq (optional)
# Ubuntu/Debian
sudo apt-get install jq

# Mac
brew install jq
```

### Configuration

The script reads CDP credentials from your `.env` file:

```bash
# .env file
CDP_API_KEY_NAME=your-api-key-id
CDP_API_KEY_PRIVATE_KEY=your-api-secret
CDP_WEBHOOK_ID=your-webhook-id
```

## Usage

### Interactive Mode

Run without arguments for interactive menu:

```bash
./cdp-webhook-utils.sh
```

Menu options:
1. **List all webhooks** - Show all configured webhooks
2. **Get webhook details** - View specific webhook configuration
3. **Create new webhook** - Set up a new webhook
4. **Update webhook filters** - Modify wallet address filters
5. **Delete webhook** - Remove a webhook
6. **Reactivate webhook** - Attempt to reactivate disabled webhook

### Command Line Mode

Run specific commands directly:

```bash
# List all webhooks
./cdp-webhook-utils.sh list

# Get specific webhook details
./cdp-webhook-utils.sh get {webhook-id}

# Create new webhook
./cdp-webhook-utils.sh create

# Update webhook filters with wallet addresses
./cdp-webhook-utils.sh update-filters {webhook-id} 0x123... 0x456...

# Delete webhook
./cdp-webhook-utils.sh delete {webhook-id}

# Reactivate webhook
./cdp-webhook-utils.sh reactivate {webhook-id}
```

## Operations

### List Webhooks

Shows all webhooks in your CDP account:

```bash
$ ./cdp-webhook-utils.sh list

Listing all webhooks...

ID: 68e2a0c2c1638dd8fff9ecf0
URL: https://api.swapwatch.app/webhook/coinbase
Status: active
Network: base-mainnet
Event Type: wallet_activity
---
```

### Get Webhook Details

View complete webhook configuration:

```bash
$ ./cdp-webhook-utils.sh get 68e2a0c2c1638dd8fff9ecf0

Getting webhook details for: 68e2a0c2c1638dd8fff9ecf0

{
  "id": "68e2a0c2c1638dd8fff9ecf0",
  "url": "https://api.swapwatch.app/webhook/coinbase",
  "network": "base-mainnet",
  "event_type": "wallet_activity",
  "filters": {
    "addresses": [
      "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
      "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"
    ]
  },
  "status": "active",
  "signature": "5a0d0bf8181ccecf1d1e2a42361e853a796fad94ba2bc0a7e4b004b8edf6cad5"
}
```

### Create New Webhook

Creates a webhook with default SwapWatch configuration:

```bash
$ ./cdp-webhook-utils.sh create

Creating new webhook...

✅ Webhook created successfully!
ID: abc123def456...
Secret: xyz789...

⚠️  Important: Update these in your Worker:
wrangler secret put CDP_WEBHOOK_ID --env production
wrangler secret put COINBASE_WEBHOOK_SECRET --env production
```

**Default Configuration:**
- URL: `https://api.swapwatch.app/webhook/coinbase`
- Network: `base-mainnet`
- Event Type: `wallet_activity`
- Signature Header: `x-webhook-signature`

### Update Webhook Filters

Add or update wallet address filters:

```bash
$ ./cdp-webhook-utils.sh update-filters 68e2a0c2c1638dd8fff9ecf0 \
    0x742d35cc6634c0532925a3b844bc9e7595f0beb7 \
    0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed

Updating webhook filters...
Webhook ID: 68e2a0c2c1638dd8fff9ecf0
Wallets: 0x742d35cc6634c0532925a3b844bc9e7595f0beb7 0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed

✅ Webhook filters updated!
```

**Note:** This replaces all existing filters. To clear filters, run without wallet addresses.

### Delete Webhook

Permanently remove a webhook:

```bash
$ ./cdp-webhook-utils.sh delete 68e2a0c2c1638dd8fff9ecf0

Deleting webhook: 68e2a0c2c1638dd8fff9ecf0
Are you sure? (y/n): y

✅ Webhook deleted
```

### Reactivate Webhook

Attempt to reactivate a disabled webhook:

```bash
$ ./cdp-webhook-utils.sh reactivate 68e2a0c2c1638dd8fff9ecf0

Attempting to reactivate webhook: 68e2a0c2c1638dd8fff9ecf0

✅ Webhook reactivated
```

If reactivation fails, the script offers to create a new webhook.

## Integration with SwapWatch

### Automatic Filter Updates

SwapWatch automatically calls the CDP API to update filters when wallets are added/removed. The manual script is useful for:

1. **Initial setup** - Creating the webhook
2. **Debugging** - Checking current filter state
3. **Recovery** - Recreating webhook if disabled
4. **Manual override** - Setting filters directly

### Sync with Worker

After creating or updating a webhook:

1. **Update Worker secrets:**
   ```bash
   wrangler secret put CDP_WEBHOOK_ID --env production
   wrangler secret put COINBASE_WEBHOOK_SECRET --env production
   ```

2. **Verify configuration:**
   ```bash
   wrangler tail --env production
   ```

3. **Test webhook:**
   ```bash
   curl -X POST https://api.swapwatch.app/room/TEST/wallets \
     -d '{"address": "0x742d35cc6634c0532925a3b844bc9e7595f0beb7"}'
   ```

## Troubleshooting

### Common Issues

#### "CDP API credentials not found!"

**Solution:** Ensure `.env` file exists with:
```bash
CDP_API_KEY_NAME=your-key-id
CDP_API_KEY_PRIVATE_KEY=your-secret
```

#### "Failed to create webhook"

**Possible causes:**
- Invalid API credentials
- Network issues
- CDP service down
- Webhook limit reached

**Debug:**
```bash
# Test API credentials
curl -H "X-API-Key: $CDP_API_KEY_NAME" \
     -H "Authorization: Bearer $CDP_API_KEY_PRIVATE_KEY" \
     https://api.developer.coinbase.com/webhooks
```

#### "Reactivation failed"

**Solution:** Create a new webhook instead:
```bash
./cdp-webhook-utils.sh create
```

Then update Worker with new webhook ID and secret.

### Debug Mode

Add debug output by modifying the script:

```bash
# Add at top of script
set -x  # Enable debug output
```

Or run with bash debug:
```bash
bash -x cdp-webhook-utils.sh list
```

## CDP API Reference

### Endpoints Used

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List webhooks | GET | `/webhooks` |
| Get webhook | GET | `/webhooks/{id}` |
| Create webhook | POST | `/webhooks` |
| Update webhook | PATCH | `/webhooks/{id}` |
| Delete webhook | DELETE | `/webhooks/{id}` |

### Webhook Payload Structure

```json
{
  "url": "https://api.swapwatch.app/webhook/coinbase",
  "network": "base-mainnet",
  "event_type": "wallet_activity",
  "filters": {
    "addresses": ["0x..."]
  },
  "signature_header": "x-webhook-signature"
}
```

### Response Structure

```json
{
  "id": "webhook-uuid",
  "url": "https://...",
  "network": "base-mainnet",
  "event_type": "wallet_activity",
  "status": "active",
  "signature": "secret-for-verification",
  "created_at": "2025-01-01T00:00:00Z"
}
```

## Security Notes

1. **Never commit the script with credentials** - Always use environment variables
2. **Protect your `.env` file** - Ensure it's in `.gitignore`
3. **Rotate secrets regularly** - Create new webhooks periodically
4. **Log script usage** - Monitor for unauthorized access

## Backup and Recovery

### Export Webhook Configuration

```bash
# Save current webhook config
./cdp-webhook-utils.sh get {webhook-id} > webhook-backup.json
```

### Restore from Backup

```bash
# Extract addresses from backup
addresses=$(cat webhook-backup.json | jq -r '.filters.addresses[]' | tr '\n' ' ')

# Update filters
./cdp-webhook-utils.sh update-filters {webhook-id} $addresses
```

### Full System Backup

```bash
# Backup all webhook configs
for webhook_id in $(./cdp-webhook-utils.sh list | grep "ID:" | awk '{print $2}'); do
  ./cdp-webhook-utils.sh get $webhook_id > webhook-$webhook_id.json
done
```

## Best Practices

1. **Regular Health Checks**
   ```bash
   # Schedule daily webhook status check
   0 0 * * * /path/to/cdp-webhook-utils.sh list >> webhook-status.log
   ```

2. **Filter Synchronization**
   ```bash
   # Sync filters with KV index
   wrangler kv key list --namespace-id YOUR_KV_ID --prefix wallet: | \
     jq -r '.[] | .name' | sed 's/wallet://' | \
     xargs ./cdp-webhook-utils.sh update-filters {webhook-id}
   ```

3. **Automated Recovery**
   ```bash
   # Check webhook status and recreate if needed
   if ! ./cdp-webhook-utils.sh get {webhook-id} | grep -q "active"; then
     ./cdp-webhook-utils.sh create
   fi
   ```

## Support

- **Script Issues:** Check script permissions and dependencies
- **API Issues:** Verify CDP service status
- **Integration Issues:** Check Worker logs with `wrangler tail`