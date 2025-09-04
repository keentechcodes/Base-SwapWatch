#!/bin/bash

# Webhook payload
PAYLOAD='{"webhookId":"test","eventType":"wallet_activity","network":"base-mainnet"}'

# Your webhook secret (same as in .env)
SECRET='test-webhook-secret'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

echo "Payload: $PAYLOAD"
echo "Signature: $SIGNATURE"
echo "Sending webhook..."

# Send the webhook
curl -X POST https://concentrations-dean-implies-td.trycloudflare.com/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$PAYLOAD"

echo ""
echo "Webhook test sent! Check your server terminal for the event log."