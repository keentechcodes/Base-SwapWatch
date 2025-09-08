#!/bin/bash

# Webhook payload for a swap event
PAYLOAD='{
  "webhookId": "test-swap",
  "eventType": "smart_contract_event",
  "network": "base-mainnet",
  "from": "0x1234567890123456789012345678901234567890",
  "to": "0x2626664c2603336E57B271c5C0b26F421741e481",
  "contractAddress": "0x2626664c2603336E57B271c5C0b26F421741e481",
  "methodName": "swapExactTokensForTokens",
  "transactionHash": "0xabc1234567890def1234567890abcdef1234567890abcdef1234567890abcdef",
  "value": "1000000000000000000",
  "data": {
    "tokenIn": "0x4200000000000000000000000000000000000006",
    "tokenOut": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amountIn": "1000000000000000000",
    "amountOut": "2500000000"
  }
}'

# Your webhook secret (same as in .env)
SECRET='test-webhook-secret'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

echo "Sending SWAP webhook event..."
echo "DEX: Uniswap V3"
echo "Method: swapExactTokensForTokens"
echo ""

# Send the webhook
curl -X POST https://discussion-module-auditor-unity.trycloudflare.com/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$PAYLOAD"

echo ""
echo ""
echo "Swap webhook test sent! Check your server terminal for the formatted swap event log."
