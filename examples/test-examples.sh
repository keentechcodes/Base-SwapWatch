#!/bin/bash

# Test script for example webhook payloads
# Usage: ./examples/test-examples.sh [payload_name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3000/webhook}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-test-webhook-secret}"
PAYLOADS_FILE="examples/webhook-payloads.json"

# Function to send webhook
send_webhook() {
    local payload_name=$1
    local payload=$2
    
    # Generate signature
    local signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')
    
    echo -e "${BLUE}Sending ${payload_name} webhook...${NC}"
    echo -e "${YELLOW}Payload:${NC}"
    echo "$payload" | jq '.' 2>/dev/null || echo "$payload"
    echo ""
    
    # Send request
    response=$(curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "x-webhook-signature: $signature" \
        -d "$payload")
    
    # Check response
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Response:${NC} $response"
    else
        echo -e "${RED}✗ Failed to send webhook${NC}"
    fi
    echo -e "----------------------------------------\n"
}

# Function to test specific payload
test_payload() {
    local payload_name=$1
    
    # Extract payload from JSON file
    payload=$(jq -c ".${payload_name}" "$PAYLOADS_FILE" 2>/dev/null)
    
    if [ "$payload" == "null" ] || [ -z "$payload" ]; then
        echo -e "${RED}Error: Payload '${payload_name}' not found${NC}"
        echo "Available payloads:"
        jq -r 'keys[]' "$PAYLOADS_FILE" | sed 's/^/  - /'
        exit 1
    fi
    
    send_webhook "$payload_name" "$payload"
}

# Function to test all payloads
test_all() {
    echo -e "${BLUE}Testing all webhook payloads...${NC}\n"
    
    # Get all payload names
    payloads=$(jq -r 'keys[]' "$PAYLOADS_FILE")
    
    for name in $payloads; do
        payload=$(jq -c ".${name}" "$PAYLOADS_FILE")
        send_webhook "$name" "$payload"
        sleep 1 # Small delay between requests
    done
    
    echo -e "${GREEN}All payloads tested!${NC}"
}

# Function to test swap events only
test_swaps() {
    echo -e "${BLUE}Testing swap webhook payloads...${NC}\n"
    
    # Get swap payload names
    swap_payloads=$(jq -r 'keys[] | select(contains("swap"))' "$PAYLOADS_FILE")
    
    for name in $swap_payloads; do
        payload=$(jq -c ".${name}" "$PAYLOADS_FILE")
        send_webhook "$name" "$payload"
        sleep 1
    done
    
    echo -e "${GREEN}All swap payloads tested!${NC}"
}

# Main menu
main() {
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}  SwapWatch Webhook Payload Tester${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}\n"
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed${NC}"
        echo "Install with: apt-get install jq (Ubuntu) or brew install jq (Mac)"
        exit 1
    fi
    
    # Check if server is running
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${YELLOW}Warning: Server doesn't appear to be running on port 3000${NC}"
        echo "Start with: npm start"
        echo ""
    fi
    
    # Parse arguments
    case "${1:-menu}" in
        all)
            test_all
            ;;
        swaps)
            test_swaps
            ;;
        menu)
            echo "Select test option:"
            echo "1) Test all payloads"
            echo "2) Test swap events only"
            echo "3) Test specific payload"
            echo ""
            read -p "Enter choice (1-3): " choice
            
            case $choice in
                1)
                    test_all
                    ;;
                2)
                    test_swaps
                    ;;
                3)
                    echo "Available payloads:"
                    jq -r 'keys[]' "$PAYLOADS_FILE" | sed 's/^/  - /'
                    echo ""
                    read -p "Enter payload name: " payload_name
                    test_payload "$payload_name"
                    ;;
                *)
                    echo -e "${RED}Invalid choice${NC}"
                    exit 1
                    ;;
            esac
            ;;
        *)
            # Test specific payload by name
            test_payload "$1"
            ;;
    esac
}

# Run main function
main "$@"