# Coinbase Developer Platform (CDP) Webhook Configuration Guide

This guide walks you through setting up webhooks in the Coinbase Developer Platform to monitor wallet swap transactions on Base network.

## Prerequisites

- CDP account with API access
- Running webhook server (see README.md for setup)
- Public tunnel URL (Cloudflare or ngrok)

## Step 1: Access CDP Portal

1. Navigate to [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
2. Sign in with your Coinbase account
3. Go to the **Webhooks** section

## Step 2: Create a New Webhook

1. Click **"Create Webhook"** button
2. Fill in the webhook configuration:

### Webhook Configuration Fields

| Field | Value | Description |
|-------|-------|-------------|
| **Webhook URL** | Your tunnel URL + `/webhook` | Example: `https://your-tunnel.trycloudflare.com/webhook` |
| **Network** | `base-mainnet` | Select Base mainnet for production |
| **Event Type** | Multiple selections | Choose relevant events (see below) |
| **Wallet Addresses** | Your monitored addresses | Add addresses to track |
| **Webhook Secret** | Your secret key | Must match `.env` WEBHOOK_SECRET |

### Recommended Event Types for Swap Monitoring

- ✅ **smart_contract_event** - Captures DEX router interactions
- ✅ **erc20_transfer** - Token transfer events
- ✅ **wallet_activity** - General wallet activity
- ✅ **transaction** - All transactions from wallet

## Step 3: Configure Webhook Secret

⚠️ **Important CDP Alpha Note**: CDP currently sends the webhook secret directly as the signature header, not as an HMAC hash. Our implementation supports both formats.

1. Generate a secure webhook secret:
```bash
openssl rand -hex 32
```

2. Add to your `.env` file:
```env
WEBHOOK_SECRET=your_generated_secret_here
```

3. Use the **same secret** in the CDP webhook configuration

## Step 4: Add Wallet Addresses

1. Click **"Add Address"** in the CDP webhook configuration
2. Enter wallet addresses you want to monitor
3. These wallets will trigger webhook events for their transactions

## Step 5: Test Your Webhook

### Using CDP Test Feature
1. In CDP portal, click **"Test Webhook"** button
2. CDP will send a test event to your endpoint
3. Check your server logs for the received event

### Manual Testing
Use our test scripts to verify your setup:

```bash
# Test basic webhook
./test-webhook.sh

# Test swap detection
./test-swap-webhook.sh
```

## Step 6: Monitor Real Transactions

Once configured, your webhook will receive real-time events:

1. **Swap Detection**: Automatically identifies swaps on major DEXs:
   - Uniswap V3
   - BaseSwap
   - Aerodrome
   - SushiSwap
   - PancakeSwap V3
   - Velodrome

2. **Event Logging**: Color-coded console output shows:
   - 🔄 Swap transactions with DEX identification
   - 📊 Token pairs and amounts
   - 🔗 Transaction hashes
   - 💱 Detailed swap data

## Troubleshooting

### Webhook Not Receiving Events

1. **Check Server Status**:
```bash
curl http://localhost:3000/health
```

2. **Verify Tunnel is Running**:
   - Cloudflare: Check tunnel terminal for activity
   - ngrok: Visit http://localhost:4040 for inspector

3. **Confirm Webhook Secret**:
   - Ensure `.env` WEBHOOK_SECRET matches CDP configuration
   - Restart server after changing `.env`

### Signature Verification Failures

If you see "Invalid webhook signature" errors:

1. Check webhook secret is correctly set in both places
2. Our implementation supports:
   - CDP's direct secret format (alpha)
   - Standard HMAC-SHA256 format

### No Swap Detection

If swaps aren't being detected:

1. Ensure you selected **smart_contract_event** in CDP
2. Check the transaction is to a known DEX router
3. Review logs for the contract address

## Security Best Practices

1. **Keep webhook secret secure** - Never commit to version control
2. **Use HTTPS only** - Both tunnels provide SSL/TLS
3. **Validate signatures** - Already implemented in our middleware
4. **Monitor logs** - Watch for unusual activity
5. **Rate limiting** - Consider adding rate limits for production

## CDP Alpha Limitations

As CDP webhooks are in alpha:

- Signature format may change (we support both formats)
- Event delivery guarantees may vary
- Some event types might be limited
- Documentation may be incomplete

## Support Resources

- [CDP Documentation](https://docs.cdp.coinbase.com/webhooks)
- [Base Network Docs](https://docs.base.org/)
- [Project Issues](https://github.com/keentechcodes/Base-SwapWatch/issues)

## Next Steps

1. Monitor your configured wallets for swap activity
2. Customize swap detection for additional DEXs
3. Add database storage for historical data
4. Implement notification systems (email, Discord, etc.)
5. Build a frontend dashboard for visualization