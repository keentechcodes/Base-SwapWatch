#!/usr/bin/env node

/**
 * API Validation Script
 * Tests all external API connections and validates API keys
 */

const axios = require('axios');
const chalk = require('chalk');
const dotenv = require('dotenv');
const redis = require('redis');

// Load environment variables
dotenv.config();

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper function to print status
function printStatus(service, status, message) {
  const icon = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  const color = status === 'success' ? chalk.green : status === 'warning' ? chalk.yellow : chalk.red;
  console.log(`${icon} ${chalk.bold(service)}: ${color(message)}`);
  
  if (status === 'success') {
    results.passed.push(service);
  } else if (status === 'warning') {
    results.warnings.push({ service, message });
  } else {
    results.failed.push({ service, message });
  }
}

// Test DexScreener API (no key required)
async function testDexScreener() {
  console.log(chalk.cyan('\n📊 Testing DexScreener API...'));
  
  try {
    const testToken = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
    const url = process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com/latest';
    const response = await axios.get(`${url}/dex/tokens/${testToken}`, {
      timeout: 5000
    });
    
    if (response.data && response.data.pairs) {
      printStatus('DexScreener', 'success', `Connected successfully - Found ${response.data.pairs.length} pairs`);
      return true;
    } else {
      printStatus('DexScreener', 'warning', 'Connected but unexpected response format');
      return true;
    }
  } catch (error) {
    printStatus('DexScreener', 'failed', `Connection failed: ${error.message}`);
    return false;
  }
}

// Test Etherscan API v2 (for Base chain)
async function testEtherscan() {
  console.log(chalk.cyan('\n🔍 Testing Etherscan API v2 (Base chain)...'));
  
  const apiKey = process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY; // Support both for migration
  
  if (!apiKey || apiKey === 'your_etherscan_api_key_here' || apiKey === 'your_basescan_api_key_here') {
    printStatus('Etherscan', 'warning', 'API key not configured - Set ETHERSCAN_API_KEY in .env');
    console.log(chalk.gray('  → Sign up at: https://etherscan.io/apis'));
    console.log(chalk.gray('  → Note: BaseScan v1 API is deprecated, use Etherscan v2'));
    return false;
  }
  
  try {
    // Use Etherscan v2 API with Base chain ID (8453)
    const url = 'https://api.etherscan.io/v2/api';
    const response = await axios.get(url, {
      params: {
        chainid: 8453, // Base mainnet chain ID
        module: 'stats',
        action: 'ethprice',
        apikey: apiKey
      },
      timeout: 5000
    });
    
    if (response.data.status === '1') {
      const price = response.data.result?.ethusd || 'N/A';
      printStatus('Etherscan', 'success', `API key valid (Base chain) - ETH price: $${price}`);
      return true;
    } else if (response.data.message === 'NOTOK') {
      printStatus('Etherscan', 'failed', `Invalid API key: ${response.data.result}`);
      return false;
    } else {
      printStatus('Etherscan', 'warning', 'Unexpected response format');
      return true;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      printStatus('Etherscan', 'failed', 'Invalid API key');
    } else {
      printStatus('Etherscan', 'failed', `Connection failed: ${error.message}`);
    }
    return false;
  }
}

// Test Redis connection
async function testRedis() {
  console.log(chalk.cyan('\n💾 Testing Redis connection...'));
  
  const client = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  });
  
  return new Promise((resolve) => {
    client.on('error', (err) => {
      printStatus('Redis', 'warning', `Not connected: ${err.message}`);
      console.log(chalk.gray('  → Redis is optional but recommended for caching'));
      console.log(chalk.gray('  → Install locally: brew install redis (macOS) or apt install redis-server (Linux)'));
      client.quit();
      resolve(false);
    });
    
    client.on('ready', async () => {
      try {
        await client.ping();
        const info = await client.info('server');
        const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
        printStatus('Redis', 'success', `Connected to Redis v${version}`);
        client.quit();
        resolve(true);
      } catch (err) {
        printStatus('Redis', 'failed', `Redis error: ${err.message}`);
        client.quit();
        resolve(false);
      }
    });
    
    client.connect().catch(err => {
      printStatus('Redis', 'warning', 'Redis not running locally');
      console.log(chalk.gray('  → Start Redis: redis-server'));
      resolve(false);
    });
  });
}

// Test RPC endpoint
async function testRPC() {
  console.log(chalk.cyan('\n🔗 Testing RPC endpoint...'));
  
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  
  try {
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.data.result) {
      const blockNumber = parseInt(response.data.result, 16);
      printStatus('RPC Endpoint', 'success', `Connected - Latest block: ${blockNumber.toLocaleString()}`);
      return true;
    } else {
      printStatus('RPC Endpoint', 'warning', 'Connected but unexpected response');
      return true;
    }
  } catch (error) {
    printStatus('RPC Endpoint', 'failed', `Connection failed: ${error.message}`);
    console.log(chalk.gray('  → Consider using Alchemy or Infura for better reliability'));
    return false;
  }
}

// Test optional services
async function testOptionalServices() {
  console.log(chalk.cyan('\n🔧 Checking optional services...'));
  
  // Check Moralis
  if (process.env.MORALIS_API_KEY && process.env.MORALIS_API_KEY !== 'your_moralis_key_here') {
    try {
      const response = await axios.get('https://deep-index.moralis.io/api/v2/info/credits', {
        headers: { 'X-API-Key': process.env.MORALIS_API_KEY },
        timeout: 5000
      });
      printStatus('Moralis', 'success', `API key valid - Credits: ${response.data.total_credits || 'N/A'}`);
    } catch (error) {
      printStatus('Moralis', 'failed', 'Invalid API key or connection failed');
    }
  } else {
    console.log(chalk.gray('  ℹ️  Moralis: Not configured (optional)'));
  }
  
  // Check Alchemy
  if (process.env.ALCHEMY_API_KEY && process.env.ALCHEMY_API_KEY !== 'your_alchemy_key_here') {
    console.log(chalk.green('  ✅ Alchemy: Configured in RPC URL'));
  } else {
    console.log(chalk.gray('  ℹ️  Alchemy: Not configured (optional)'));
  }
}

// Check rate limiting configuration
function checkRateLimiting() {
  console.log(chalk.cyan('\n⚡ Checking rate limiting configuration...'));
  
  const etherscanLimit = process.env.ETHERSCAN_RATE_LIMIT || process.env.BASESCAN_RATE_LIMIT || '5';
  const retryAttempts = process.env.API_RETRY_ATTEMPTS || '3';
  const retryDelay = process.env.API_RETRY_DELAY || '1000';
  
  console.log(chalk.gray(`  • Etherscan rate limit: ${etherscanLimit} req/sec`));
  console.log(chalk.gray(`  • Retry attempts: ${retryAttempts}`));
  console.log(chalk.gray(`  • Retry delay: ${retryDelay}ms`));
  
  printStatus('Rate Limiting', 'success', 'Configuration loaded');
}

// Check cache TTL configuration
function checkCacheConfig() {
  console.log(chalk.cyan('\n⏱️  Checking cache TTL configuration...'));
  
  const ttls = {
    'Market Data': process.env.CACHE_TTL_MARKET || '300',
    'Token Metadata': process.env.CACHE_TTL_METADATA || '7200',
    'Contract Verification': process.env.CACHE_TTL_VERIFICATION || '86400',
    'Factory Info': process.env.CACHE_TTL_FACTORY || '86400'
  };
  
  Object.entries(ttls).forEach(([name, value]) => {
    const hours = (parseInt(value) / 3600).toFixed(1);
    console.log(chalk.gray(`  • ${name}: ${value}s (${hours}h)`));
  });
  
  printStatus('Cache Configuration', 'success', 'TTL settings loaded');
}

// Main validation function
async function validateAPIs() {
  console.log(chalk.bold.blue('\n🔐 SwapWatch API Validation Script\n'));
  console.log(chalk.gray('Checking all API connections and configurations...\n'));
  
  // Run all tests
  await testDexScreener();
  await testEtherscan();
  await testRedis();
  await testRPC();
  await testOptionalServices();
  checkRateLimiting();
  checkCacheConfig();
  
  // Print summary
  console.log(chalk.bold.blue('\n📋 Validation Summary\n'));
  
  if (results.passed.length > 0) {
    console.log(chalk.green.bold(`✅ Passed (${results.passed.length}):`));
    results.passed.forEach(service => {
      console.log(chalk.green(`   • ${service}`));
    });
  }
  
  if (results.warnings.length > 0) {
    console.log(chalk.yellow.bold(`\n⚠️  Warnings (${results.warnings.length}):`));
    results.warnings.forEach(({ service, message }) => {
      console.log(chalk.yellow(`   • ${service}: ${message}`));
    });
  }
  
  if (results.failed.length > 0) {
    console.log(chalk.red.bold(`\n❌ Failed (${results.failed.length}):`));
    results.failed.forEach(({ service, message }) => {
      console.log(chalk.red(`   • ${service}: ${message}`));
    });
  }
  
  // Overall status
  console.log(chalk.bold.blue('\n📊 Overall Status:'));
  if (results.failed.length === 0) {
    if (results.warnings.length === 0) {
      console.log(chalk.green.bold('   ✅ All services configured and working!'));
    } else {
      console.log(chalk.yellow.bold('   ⚠️  System functional with warnings'));
      console.log(chalk.gray('   Some optional services are not configured'));
    }
  } else {
    console.log(chalk.red.bold('   ❌ Some required services need configuration'));
    console.log(chalk.gray('   Review the errors above and update your .env file'));
  }
  
  // Next steps
  console.log(chalk.bold.blue('\n📝 Next Steps:'));
  if (results.failed.length > 0 || results.warnings.length > 0) {
    console.log(chalk.gray('   1. Review the API Key Setup Guide: docs/API-KEY-SETUP.md'));
    console.log(chalk.gray('   2. Update your .env file with the required API keys'));
    console.log(chalk.gray('   3. Run this script again: npm run validate-apis'));
  } else {
    console.log(chalk.gray('   1. Start the development server: npm run dev'));
    console.log(chalk.gray('   2. Test enriched webhooks: ./test-swap-webhook.sh'));
  }
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run validation
validateAPIs().catch(error => {
  console.error(chalk.red.bold('\n❌ Validation script error:'), error.message);
  process.exit(1);
});