# Cloudflare Setup Guide for SwapWatch

This guide walks you through setting up your Cloudflare infrastructure for SwapWatch deployment.

## Prerequisites

- [ ] Email address for Cloudflare account
- [ ] Credit card (for domain registration, ~$10/year)
- [ ] GitHub repository (already have: keentechcodes/Base-SwapWatch)

## Step-by-Step Setup

### 1. Create Cloudflare Account

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Enter your email and create a strong password
3. Verify your email address via the confirmation link
4. Complete the onboarding survey (select "Personal" for account type)

### 2. Domain Registration

1. Navigate to **Registrar** in the Cloudflare dashboard
2. Search for your desired domain (suggestions):
   - `swapwatch.app` (recommended)
   - `swapwatch.xyz`
   - `baseswapwatch.com`
   - `swaptracker.app`
3. Add to cart and complete purchase
4. Domain will be automatically configured with Cloudflare nameservers

### 3. DNS Configuration

Once domain is registered, Cloudflare automatically:
- Sets up nameservers
- Enables Universal SSL (free)
- Configures DNSSEC

No additional DNS configuration needed initially.

### 4. Security Settings

1. Go to **SSL/TLS** → **Overview**
   - Ensure mode is set to "Full (strict)"
2. Go to **Security** → **Settings**
   - Enable "Always Use HTTPS"
   - Enable "Automatic HTTPS Rewrites"
3. Go to **Security** → **Bots**
   - Keep "Bot Fight Mode" enabled

### 5. Cloudflare Pages Setup

1. Go to **Workers & Pages** → **Create Application**
2. Select **Pages** tab
3. Click **Connect to Git**
4. Authorize GitHub and select `keentechcodes/Base-SwapWatch`
5. Configure build settings:
   - **Production branch**: `main`
   - **Build command**: `pnpm build`
   - **Build output directory**: `.next`
   - **Root directory**: `/` (will update when we move UI)
6. Add environment variables:
   ```
   NODE_VERSION=20
   NEXT_PUBLIC_API_URL=https://api.swapwatch.app
   NEXT_PUBLIC_WS_URL=wss://api.swapwatch.app
   ```
7. Click **Save and Deploy**

### 6. Workers Setup

1. In **Workers & Pages**, click **Create Application**
2. Select **Workers** tab
3. Name it `swapwatch-api`
4. Select **Start from scratch**
5. We'll deploy code later with Wrangler

### 7. API Keys and Tokens

1. Go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use template: "Edit Cloudflare Workers"
4. Permissions needed:
   - Account: Cloudflare Workers Scripts:Edit
   - Account: Cloudflare Pages:Edit
   - Zone: DNS:Edit
5. Save the token securely for CI/CD

## Environment Setup Verification

Run these commands to verify your setup:

```bash
# Install Wrangler globally
pnpm add -g wrangler

# Login to Cloudflare
wrangler login

# Verify authentication
wrangler whoami

# List your zones (domains)
wrangler zones list
```

## Next Steps

After completing this setup:
1. Update `.env.local` with your domain
2. Configure Wrangler for local development
3. Set up GitHub Actions for CI/CD
4. Begin implementing Durable Objects

## Useful Links

- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Pages Documentation](https://developers.cloudflare.com/pages)
- [Workers Documentation](https://developers.cloudflare.com/workers)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects)

## Support

- Cloudflare Community: https://community.cloudflare.com
- Discord: https://discord.cloudflare.com
- Status Page: https://cloudflarestatus.com