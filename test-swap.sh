#!/bin/bash

# Test Swap Broadcasting Script
# This script simulates a swap event to test the real-time broadcasting

# Check if wallet address is provided
if [ -z "$1" ]; then
  echo "Usage: ./test-swap.sh <wallet_address>"
  echo "Example: ./test-swap.sh 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
  exit 1
fi

WALLET_ADDRESS="$1"
API_URL="https://api.swapwatch.app"

echo "🧪 Testing swap broadcast for wallet: $WALLET_ADDRESS"
echo ""

# Send test swap event
echo "📡 Sending test swap event..."
RESPONSE=$(curl -s -X POST "$API_URL/test/swap" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletAddress\": \"$WALLET_ADDRESS\",
    \"amountInUsd\": 5000,
    \"tokenIn\": {
      \"symbol\": \"USDC\",
      \"amount\": \"5000\"
    },
    \"tokenOut\": {
      \"symbol\": \"WETH\",
      \"amount\": \"2.5\"
    },
    \"type\": \"buy\"
  }")

echo "$RESPONSE" | jq .

# Check if successful
STATUS=$(echo "$RESPONSE" | jq -r '.status')
ROOMS_NOTIFIED=$(echo "$RESPONSE" | jq -r '.roomsNotified')

if [ "$STATUS" = "processed" ] && [ "$ROOMS_NOTIFIED" -gt 0 ]; then
  echo ""
  echo "✅ Swap event broadcasted successfully!"
  echo "   Rooms notified: $ROOMS_NOTIFIED"
  echo ""
  echo "   Check your browser - the swap should appear in real-time!"
elif [ "$STATUS" = "ignored" ]; then
  echo ""
  echo "⚠️  No rooms are tracking this wallet yet."
  echo "   Please add the wallet to a room first in the UI."
else
  echo ""
  echo "❌ Failed to broadcast swap event"
fi
