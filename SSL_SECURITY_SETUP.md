# SSL and Security Configuration Guide

## Verify and Configure SSL/TLS Settings

### Step 1: Navigate to SSL/TLS Settings

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain: **swapwatch.app**
3. Click **SSL/TLS** in the left sidebar

### Step 2: Configure SSL/TLS Mode

**Setting:** SSL/TLS encryption mode
**Location:** SSL/TLS → Overview

**Select:** **Full (strict)** ✅

Options explained:
- ❌ Off: No encryption (never use)
- ❌ Flexible: Encrypts visitor-to-Cloudflare only (not secure)
- ✅ Full: Encrypts end-to-end but allows self-signed certs
- ✅ **Full (strict)**: Encrypts end-to-end with valid certificate (RECOMMENDED)

**Why Full (strict)?**
- Cloudflare Pages provides automatic valid SSL
- Maximum security for your users
- Required for production apps

### Step 3: Enable Edge Certificates

**Location:** SSL/TLS → Edge Certificates

Verify these are **enabled** (should be automatic):
- ✅ **Universal SSL Status**: Active
- ✅ **Always Use HTTPS**: ON
- ✅ **Automatic HTTPS Rewrites**: ON
- ✅ **Minimum TLS Version**: TLS 1.2 or higher

**To enable "Always Use HTTPS":**
1. Scroll to "Always Use HTTPS"
2. Toggle to **ON**
3. This redirects all HTTP → HTTPS automatically

**To enable "Automatic HTTPS Rewrites":**
1. Scroll to "Automatic HTTPS Rewrites"
2. Toggle to **ON**
3. Fixes mixed content warnings

### Step 4: Configure Security Settings

**Location:** Security → Settings

#### Recommended Settings:

**Security Level:**
- Set to: **Medium** or **High**
- High = more strict, may challenge some visitors
- Medium = balanced protection

**Challenge Passage:**
- Set to: **30 minutes**
- How long verified users skip challenges

**Browser Integrity Check:**
- Toggle: **ON** ✅
- Blocks known malicious browsers

### Step 5: Enable Bot Protection (Optional but Recommended)

**Location:** Security → Bots

- ✅ **Bot Fight Mode**: ON (Free tier)
- Blocks known bad bots automatically
- Allows good bots (Google, search engines)

### Step 6: Verify SSL Certificate

After DNS propagates (5-60 minutes), verify with:

```bash
# Check SSL certificate
curl -vI https://swapwatch.app 2>&1 | grep -i 'SSL\|TLS\|certificate'

# Or use online tool
# https://www.ssllabs.com/ssltest/analyze.html?d=swapwatch.app
```

Expected result: **A or A+ rating**

### Step 7: Configure HSTS (Optional - Advanced)

**Location:** SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS)

⚠️ **Warning:** Only enable after confirming HTTPS works completely!

Settings:
- Status: Enabled
- Max Age: 6 months (15768000 seconds)
- Include subdomains: YES (if using api.swapwatch.app)
- Preload: NO (unless you want to submit to browser preload lists)

## Verification Checklist

After completing the above:

- [ ] SSL/TLS mode set to "Full (strict)"
- [ ] Universal SSL Status shows "Active"
- [ ] Always Use HTTPS is ON
- [ ] Automatic HTTPS Rewrites is ON
- [ ] Security Level set to Medium or High
- [ ] Bot Fight Mode enabled
- [ ] DNS has propagated (test: `dig swapwatch.app`)
- [ ] HTTPS loads without warnings (after DNS propagates)

## Troubleshooting

### "Universal SSL is not active yet"
- Wait 5-15 minutes after domain activation
- Refresh the page
- Should activate automatically

### "Too many redirects" error
- Change SSL mode from Flexible to Full (strict)
- Clear browser cache

### Mixed content warnings
- Enable "Automatic HTTPS Rewrites"
- Check your code for hardcoded http:// URLs

### DNS not resolving
- Normal during first hour
- Check: `dig @1.1.1.1 swapwatch.app`
- Cloudflare DNS may work before ISP DNS

## Screenshots to Take

To verify you completed this:
1. SSL/TLS → Overview (showing "Full (strict)")
2. SSL/TLS → Edge Certificates (showing "Active")
3. Security → Settings (showing your configuration)

## Next Steps

Once SSL is verified:
- Update wrangler.toml to uncomment routes
- Proceed with Task 2: Durable Objects implementation
- Deploy Workers with HTTPS endpoints