# Cloudflare Setup Guide for SwapWatch

This guide walks you through setting up your Cloudflare infrastructure for SwapWatch deployment.

## Prerequisites

- [x] Email address for Cloudflare account (mayuga.keenan@gmail.com)
- [x] Credit card (for domain registration, ~$10/year)
- [x] GitHub repository (keentechcodes/Base-SwapWatch)

## Step-by-Step Setup

### 1. Create Cloudflare Account ✅

1. ✅ Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. ✅ Enter your email and create a strong password
3. ✅ Verify your email address via the confirmation link
4. ✅ Complete the onboarding survey (select "Personal" for account type)

### 2. Domain Registration ✅

1. ✅ Navigate to **Registrar** in the Cloudflare dashboard
2. ✅ Domain registered: **swapwatch.app**
3. ✅ Purchase completed
4. ✅ Domain automatically configured with Cloudflare nameservers

**Status:** DNS configured with Cloudflare nameservers (jakub.ns.cloudflare.com)

### 3. DNS Configuration ✅

✅ Domain is registered, Cloudflare automatically:
- ✅ Sets up nameservers (jakub.ns.cloudflare.com, dns.cloudflare.com)
- ✅ Enables Universal SSL (free)
- ✅ Configures DNSSEC

**Note:** A records will be created automatically when Workers/Pages are deployed.

### 4. Security Settings ✅

1. ✅ Go to **SSL/TLS** → **Overview**
   - ✅ Mode set to "Full (strict)"
2. ✅ Go to **SSL/TLS** → **Edge Certificates**
   - ✅ Universal SSL: Active
   - ✅ Always Use HTTPS: ON
   - ✅ Automatic HTTPS Rewrites: ON
3. ✅ Go to **Security** → **Settings**
   - ✅ Security Level: Medium/High
   - ✅ Browser Integrity Check: ON
4. ✅ Go to **Security** → **Bots**
   - ✅ Bot Fight Mode: ON

### 5. Cloudflare Pages Setup ✅

1. ✅ Go to **Workers & Pages** → **Create Application**
2. ✅ Select **Pages** tab
3. ✅ Click **Connect to Git**
4. ✅ Authorize GitHub and select `keentechcodes/Base-SwapWatch`
5. ✅ Configure build settings:
   - **Production branch**: `main` (paused until ready)
   - **Build command**: `pnpm build`
   - **Build output directory**: `.next`
   - **Root directory**: `/` (will update when we move UI)
6. ✅ Add environment variables:
   ```
   NODE_VERSION=20
   NEXT_PUBLIC_API_URL=https://api.swapwatch.app
   NEXT_PUBLIC_WS_URL=wss://api.swapwatch.app
   ```
7. ✅ Saved (auto-deploy paused during development)

**Note:** Build failures expected on feature branch - will deploy when ready.

### 6. Workers Setup ⏭️

**SKIPPED** - We'll deploy Workers via Wrangler CLI from code (see Task 2).

Dashboard Worker creation not needed for custom Durable Objects implementation.

### 7. API Keys and Tokens ✅

1. ✅ Go to **My Profile** → **API Tokens**
2. ✅ Click **Create Token**
3. ✅ Use template: "Edit Cloudflare Workers"
4. ✅ Permissions configured:
   - ✅ Account: Workers Scripts:Edit
   - ✅ Account: Workers KV Storage:Edit
   - ✅ Account: Cloudflare Pages:Edit
   - ✅ Zone: Workers Routes:Edit
5. ✅ Token saved securely
6. ✅ Exported as $CLOUDFLARE_API environment variable
7. ✅ Verified with curl test

## Environment Setup Verification ✅

```bash
# Install Wrangler globally
✅ pnpm add -g wrangler

# Login to Cloudflare
✅ wrangler login

# Verify authentication
✅ wrangler whoami
# Account ID: e1e56a9592128ebad1f2b3a1fffda26b
# Email: mayuga.keenan@gmail.com

# Verify DNS configuration
✅ dig @1.1.1.1 swapwatch.app
# Nameservers: jakub.ns.cloudflare.com, dns.cloudflare.com
```

**Status:** All verification complete! ✅

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