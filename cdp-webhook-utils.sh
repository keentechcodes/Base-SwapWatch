#!/bin/bash

# CDP Webhook Management Utilities
# Helps manage Coinbase Developer Platform webhooks via API

# Load CDP API Credentials from environment or .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# CDP API Credentials from environment
API_KEY="${CDP_API_KEY_NAME}"
API_SECRET="${CDP_API_KEY_PRIVATE_KEY}"
CDP_API_BASE="https://api.developer.coinbase.com"

# Check if credentials are set
if [ -z "$API_KEY" ] || [ -z "$API_SECRET" ]; then
    echo -e "${RED}Error: CDP API credentials not found!${NC}"
    echo "Please set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY in your .env file"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to make authenticated CDP API requests
cdp_request() {
    local method=$1
    local endpoint=$2
    local data=$3

    local url="${CDP_API_BASE}${endpoint}"

    if [ -z "$data" ]; then
        curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -H "Authorization: Bearer $API_SECRET"
    else
        curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -H "Authorization: Bearer $API_SECRET" \
            -d "$data"
    fi
}

# List all webhooks
list_webhooks() {
    echo -e "${GREEN}Listing all webhooks...${NC}"
    echo ""

    response=$(cdp_request "GET" "/webhooks")

    if [ $? -eq 0 ]; then
        echo "$response" | jq -r '.data[] | "ID: \(.id)\nURL: \(.url)\nStatus: \(.status)\nNetwork: \(.network)\nEvent Type: \(.event_type)\n---"' 2>/dev/null || echo "$response"
    else
        echo -e "${RED}Failed to list webhooks${NC}"
    fi
}

# Get specific webhook details
get_webhook() {
    local webhook_id=$1

    if [ -z "$webhook_id" ]; then
        echo -e "${RED}Please provide a webhook ID${NC}"
        return 1
    fi

    echo -e "${GREEN}Getting webhook details for: $webhook_id${NC}"
    echo ""

    response=$(cdp_request "GET" "/webhooks/$webhook_id")

    if [ $? -eq 0 ]; then
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        echo -e "${RED}Failed to get webhook details${NC}"
    fi
}

# Create a new webhook
create_webhook() {
    echo -e "${GREEN}Creating new webhook...${NC}"

    local webhook_data=$(cat <<EOF
{
    "url": "https://api.swapwatch.app/webhook/coinbase",
    "network": "base-mainnet",
    "event_type": "wallet_activity",
    "signature_header": "x-webhook-signature"
}
EOF
)

    response=$(cdp_request "POST" "/webhooks" "$webhook_data")

    if [ $? -eq 0 ]; then
        webhook_id=$(echo "$response" | jq -r '.id' 2>/dev/null)
        webhook_secret=$(echo "$response" | jq -r '.signature' 2>/dev/null)

        echo -e "${GREEN}✅ Webhook created successfully!${NC}"
        echo "ID: $webhook_id"
        echo "Secret: $webhook_secret"
        echo ""
        echo -e "${YELLOW}⚠️  Important: Update these in your Worker:${NC}"
        echo "wrangler secret put CDP_WEBHOOK_ID --env production"
        echo "wrangler secret put COINBASE_WEBHOOK_SECRET --env production"
    else
        echo -e "${RED}Failed to create webhook${NC}"
        echo "$response"
    fi
}

# Update webhook filters
update_webhook_filters() {
    local webhook_id=$1
    shift
    local wallets=("$@")

    if [ -z "$webhook_id" ]; then
        echo -e "${RED}Please provide a webhook ID${NC}"
        return 1
    fi

    if [ ${#wallets[@]} -eq 0 ]; then
        echo -e "${YELLOW}No wallets provided. Webhook will receive all events.${NC}"
        local filter_data='{"filters": {"addresses": []}}'
    else
        # Build JSON array of wallets
        local wallet_json=$(printf ',"%s"' "${wallets[@]}")
        wallet_json="[${wallet_json:1}]"
        local filter_data="{\"filters\": {\"addresses\": $wallet_json}}"
    fi

    echo -e "${GREEN}Updating webhook filters...${NC}"
    echo "Webhook ID: $webhook_id"
    echo "Wallets: ${wallets[*]}"
    echo ""

    response=$(cdp_request "PATCH" "/webhooks/$webhook_id" "$filter_data")

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Webhook filters updated!${NC}"
    else
        echo -e "${RED}Failed to update webhook filters${NC}"
        echo "$response"
    fi
}

# Delete a webhook
delete_webhook() {
    local webhook_id=$1

    if [ -z "$webhook_id" ]; then
        echo -e "${RED}Please provide a webhook ID${NC}"
        return 1
    fi

    echo -e "${YELLOW}Deleting webhook: $webhook_id${NC}"
    read -p "Are you sure? (y/n): " confirm

    if [ "$confirm" != "y" ]; then
        echo "Cancelled"
        return 0
    fi

    response=$(cdp_request "DELETE" "/webhooks/$webhook_id")

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Webhook deleted${NC}"
    else
        echo -e "${RED}Failed to delete webhook${NC}"
        echo "$response"
    fi
}

# Reactivate a webhook
reactivate_webhook() {
    local webhook_id=$1

    if [ -z "$webhook_id" ]; then
        echo -e "${RED}Please provide a webhook ID${NC}"
        return 1
    fi

    echo -e "${GREEN}Attempting to reactivate webhook: $webhook_id${NC}"

    # Try to update status to active
    local activate_data='{"status": "active"}'
    response=$(cdp_request "PATCH" "/webhooks/$webhook_id" "$activate_data")

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Webhook reactivated${NC}"
    else
        echo -e "${YELLOW}Reactivation failed. You may need to create a new webhook.${NC}"
        echo "$response"
        echo ""
        read -p "Create a new webhook instead? (y/n): " create_new

        if [ "$create_new" == "y" ]; then
            create_webhook
        fi
    fi
}

# Main menu
show_menu() {
    echo "======================================"
    echo "    CDP Webhook Management Tool"
    echo "======================================"
    echo "1. List all webhooks"
    echo "2. Get webhook details"
    echo "3. Create new webhook"
    echo "4. Update webhook filters"
    echo "5. Delete webhook"
    echo "6. Reactivate webhook"
    echo "0. Exit"
    echo "======================================"
}

# Main loop
main() {
    while true; do
        show_menu
        read -p "Select an option: " choice

        case $choice in
            1)
                list_webhooks
                ;;
            2)
                read -p "Enter webhook ID: " webhook_id
                get_webhook "$webhook_id"
                ;;
            3)
                create_webhook
                ;;
            4)
                read -p "Enter webhook ID: " webhook_id
                read -p "Enter wallet addresses (space-separated): " -a wallets
                update_webhook_filters "$webhook_id" "${wallets[@]}"
                ;;
            5)
                read -p "Enter webhook ID: " webhook_id
                delete_webhook "$webhook_id"
                ;;
            6)
                read -p "Enter webhook ID: " webhook_id
                reactivate_webhook "$webhook_id"
                ;;
            0)
                echo "Exiting..."
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
        clear
    done
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. JSON output will not be formatted.${NC}"
    echo "Install jq: sudo apt-get install jq"
fi

# Run main if no arguments, otherwise run specific command
if [ $# -eq 0 ]; then
    main
else
    case $1 in
        list)
            list_webhooks
            ;;
        get)
            get_webhook "$2"
            ;;
        create)
            create_webhook
            ;;
        update-filters)
            shift
            webhook_id=$1
            shift
            update_webhook_filters "$webhook_id" "$@"
            ;;
        delete)
            delete_webhook "$2"
            ;;
        reactivate)
            reactivate_webhook "$2"
            ;;
        *)
            echo "Usage: $0 [list|get|create|update-filters|delete|reactivate] [args...]"
            echo "Or run without arguments for interactive menu"
            ;;
    esac
fi