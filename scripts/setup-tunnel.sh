#!/bin/bash

# Setup Tunnel Script for SwapWatch Webhook Demo
# Supports both Cloudflare Tunnel and ngrok

set -e

echo "🚀 SwapWatch Webhook Tunnel Setup"
echo "================================="
echo ""

# Check if server is running
check_server() {
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "⚠️  Warning: Server is not running on port 3000"
        echo "   Please start the server first with: npm start"
        echo ""
        read -p "Do you want to start the server now? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Starting server..."
            npm start &
            sleep 3
        else
            echo "Please start the server manually and run this script again."
            exit 1
        fi
    else
        echo "✅ Server is running on port 3000"
    fi
}

# Setup Cloudflare Tunnel
setup_cloudflare() {
    echo "📡 Setting up Cloudflare Tunnel..."
    echo ""
    
    # Check if cloudflared is installed
    if ! command -v cloudflared &> /dev/null; then
        echo "Installing cloudflared..."
        npm install -g cloudflared
    fi
    
    echo "Starting Cloudflare Tunnel..."
    echo "================================="
    npx cloudflared tunnel --url http://localhost:3000
}

# Setup ngrok
setup_ngrok() {
    echo "📡 Setting up ngrok tunnel..."
    echo ""
    
    # Check if ngrok is installed
    if ! command -v ngrok &> /dev/null; then
        echo "❌ ngrok is not installed"
        echo "Please install ngrok first:"
        echo "  - Download from: https://ngrok.com/download"
        echo "  - Or install via npm: npm install -g ngrok"
        exit 1
    fi
    
    # Check if ngrok is authenticated
    if ! ngrok config check 2>/dev/null; then
        echo "⚠️  ngrok is not authenticated"
        echo "Please authenticate ngrok first:"
        echo "  1. Sign up at: https://ngrok.com"
        echo "  2. Get your authtoken from the dashboard"
        echo "  3. Run: ngrok config add-authtoken YOUR_TOKEN"
        exit 1
    fi
    
    echo "Starting ngrok tunnel..."
    echo "========================"
    ngrok http 3000
}

# Main menu
main() {
    check_server
    
    echo ""
    echo "Select tunnel provider:"
    echo "1) Cloudflare Tunnel (no account required)"
    echo "2) ngrok (requires account)"
    echo ""
    read -p "Enter your choice (1 or 2): " choice
    
    case $choice in
        1)
            setup_cloudflare
            ;;
        2)
            setup_ngrok
            ;;
        *)
            echo "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
}

# Run main function
main