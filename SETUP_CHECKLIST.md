# Cloudflare Setup Checklist

## Task 1: Infrastructure Setup Progress

### ✅ Completed (Automated)
- [x] 1.1 Configuration files created for testing
- [x] 1.2 Cloudflare dependencies installed (wrangler, workers-types)
- [x] 1.3 Wrangler.toml configuration prepared
- [x] 1.4 Package.json scripts updated for pnpm
- [x] 1.5 Environment variable templates created
- [x] 1.6 Node version specified (.nvmrc)
- [x] 1.7 Gitignore updated for Cloudflare files

### ⏳ Manual Steps Required

Please complete these steps following CLOUDFLARE_SETUP.md:

#### Account Setup
- [ ] Create Cloudflare account at https://dash.cloudflare.com/sign-up
- [ ] Verify email address
- [ ] Complete onboarding (select "Personal" account type)

#### Domain Registration
- [ ] Register domain via Cloudflare Registrar
  - Suggested: swapwatch.app, swapwatch.xyz, baseswapwatch.com
- [ ] Wait for domain activation (usually instant)
- [ ] Verify SSL certificate is active

#### Cloudflare Pages
- [ ] Connect GitHub repository (keentechcodes/Base-SwapWatch)
- [ ] Configure build settings:
  - Production branch: main
  - Build command: pnpm build
  - Build output: .next
- [ ] Add environment variables in Pages dashboard

#### Wrangler CLI
- [ ] Run `pnpm cf:login` to authenticate
- [ ] Run `pnpm cf:whoami` to verify authentication
- [ ] Update wrangler.toml with your domain

#### API Tokens
- [ ] Create API token for CI/CD
- [ ] Save token securely
- [ ] Add to GitHub Secrets as CLOUDFLARE_API_TOKEN

## Verification Commands

After completing manual steps, run these commands to verify:

```bash
# Check Wrangler authentication
pnpm cf:whoami

# Test local Worker development
pnpm dev:worker

# Verify domain DNS
dig +short swapwatch.app

# Check SSL certificate
curl -I https://swapwatch.app
```

## Next Tasks

Once infrastructure is verified:
1. Task 2: Implement Durable Objects for room management
2. Task 3: Deploy Workers API and webhook processing
3. Task 4: Migrate frontend to Cloudflare Pages
4. Task 5: Integrate WebSocket connections

## Support Resources

- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Workers Documentation](https://developers.cloudflare.com/workers)
- [Pages Documentation](https://developers.cloudflare.com/pages)
- [Community Discord](https://discord.cloudflare.com)

## Notes

- Domain registration takes ~5 minutes to propagate
- SSL certificates are automatic and instant
- First deployment may take 5-10 minutes
- Subsequent deployments are under 1 minute