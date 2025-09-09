#!/usr/bin/env node

/**
 * Test script for Moralis API integration
 * Verifies that the Moralis API works correctly for Base chain token data
 */

const axios = require('axios');
const chalk = require('chalk');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

console.log(chalk.bold.blue('\n🔮 Testing Moralis API Integration for Base Chain\n'));

// Get API key from environment
const apiKey = process.env.MORALIS_API_KEY;

if (!apiKey || apiKey === 'your_moralis_key_here') {
  console.log(chalk.red('❌ No Moralis API key found!'));
  console.log(chalk.yellow('Please set MORALIS_API_KEY in your .env file'));
  console.log(chalk.gray('Sign up at: https://moralis.io/'));
  process.exit(1);
}

console.log(chalk.green('✅ API key found'));

// Test addresses on Base
const TEST_ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  WETH: '0x4200000000000000000000000000000000000006', // WETH on Base
  RANDOM_EOA: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Random address
  BASE_TOKEN: '0xd4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7', // A random token on Base
};

// Base chain configuration
const BASE_CHAIN = '0x2105'; // Base chain ID in hex (8453)
const BASE_CHAIN_NAME = 'base';

// Moralis API base URL
const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';

async function testEndpoint(name, url, params = {}, headers = {}) {
  try {
    const response = await axios.get(url, {
      params,
      headers: {
        'X-API-Key': apiKey,
        'accept': 'application/json',
        ...headers
      },
      timeout: 10000
    });

    console.log(chalk.green(`✅ ${name}: Success`));
    return { success: true, data: response.data };
  } catch (error) {
    if (error.response) {
      console.log(chalk.red(`❌ ${name}: ${error.response.status} - ${error.response.statusText}`));
      if (error.response.data?.message) {
        console.log(chalk.gray(`   Error: ${error.response.data.message}`));
      }
    } else {
      console.log(chalk.red(`❌ ${name}: ${error.message}`));
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log(chalk.cyan('\n📊 Running Moralis API Tests...\n'));

  // Test 1: Get native balance
  console.log(chalk.bold('1. Testing Native Balance (ETH on Base)'));
  const balanceTest = await testEndpoint(
    'Native Balance',
    `${MORALIS_BASE_URL}/${TEST_ADDRESSES.RANDOM_EOA}/balance`,
    { chain: BASE_CHAIN_NAME }
  );
  if (balanceTest.success) {
    const balanceEth = (BigInt(balanceTest.data.balance || '0') / BigInt(10 ** 18)).toString();
    console.log(chalk.gray(`   Balance: ${balanceEth} ETH`));
    console.log(chalk.gray(`   Wei: ${balanceTest.data.balance || '0'}`));
  }

  // Test 2: Get ERC20 token metadata
  console.log(chalk.bold('\n2. Testing Token Metadata (USDC)'));
  const metadataTest = await testEndpoint(
    'Token Metadata',
    `${MORALIS_BASE_URL}/erc20/metadata`,
    { 
      chain: BASE_CHAIN_NAME,
      addresses: [TEST_ADDRESSES.USDC]
    }
  );
  if (metadataTest.success && metadataTest.data?.[0]) {
    const token = metadataTest.data[0];
    console.log(chalk.gray(`   Name: ${token.name}`));
    console.log(chalk.gray(`   Symbol: ${token.symbol}`));
    console.log(chalk.gray(`   Decimals: ${token.decimals}`));
    console.log(chalk.gray(`   Total Supply: ${token.total_supply}`));
    if (token.logo) {
      console.log(chalk.gray(`   Logo: ${token.logo.substring(0, 50)}...`));
    }
  }

  // Test 3: Get token price
  console.log(chalk.bold('\n3. Testing Token Price (USDC)'));
  const priceTest = await testEndpoint(
    'Token Price',
    `${MORALIS_BASE_URL}/erc20/${TEST_ADDRESSES.USDC}/price`,
    { chain: BASE_CHAIN_NAME }
  );
  if (priceTest.success) {
    console.log(chalk.gray(`   USD Price: $${priceTest.data.usdPrice || 'N/A'}`));
    console.log(chalk.gray(`   USD Price (formatted): ${priceTest.data.usdPriceFormatted || 'N/A'}`));
    console.log(chalk.gray(`   24h Change: ${priceTest.data['24hrPercentChange'] || 'N/A'}%`));
    console.log(chalk.gray(`   Exchange: ${priceTest.data.exchangeName || 'N/A'}`));
  }

  // Test 4: Get token balances for wallet
  console.log(chalk.bold('\n4. Testing Wallet Token Balances'));
  const tokensTest = await testEndpoint(
    'Wallet Tokens',
    `${MORALIS_BASE_URL}/${TEST_ADDRESSES.RANDOM_EOA}/erc20`,
    { chain: BASE_CHAIN_NAME }
  );
  if (tokensTest.success && Array.isArray(tokensTest.data)) {
    console.log(chalk.gray(`   Tokens Found: ${tokensTest.data.length}`));
    if (tokensTest.data.length > 0) {
      const firstToken = tokensTest.data[0];
      console.log(chalk.gray(`   First Token: ${firstToken.name || firstToken.symbol || 'Unknown'}`));
      console.log(chalk.gray(`   Balance: ${firstToken.balance}`));
    }
  }

  // Test 5: Get token transfers
  console.log(chalk.bold('\n5. Testing Token Transfers (USDC)'));
  const transfersTest = await testEndpoint(
    'Token Transfers',
    `${MORALIS_BASE_URL}/erc20/${TEST_ADDRESSES.USDC}/transfers`,
    { 
      chain: BASE_CHAIN_NAME,
      limit: 5
    }
  );
  if (transfersTest.success && transfersTest.data?.result) {
    console.log(chalk.gray(`   Transfers Found: ${transfersTest.data.result.length}`));
    if (transfersTest.data.result.length > 0) {
      const transfer = transfersTest.data.result[0];
      console.log(chalk.gray(`   Latest Transfer:`));
      console.log(chalk.gray(`     From: ${transfer.from_address?.substring(0, 10)}...`));
      console.log(chalk.gray(`     To: ${transfer.to_address?.substring(0, 10)}...`));
      console.log(chalk.gray(`     Value: ${transfer.value}`));
      console.log(chalk.gray(`     Block: ${transfer.block_number}`));
    }
  }

  // Test 6: Get NFTs owned by wallet
  console.log(chalk.bold('\n6. Testing Wallet NFTs'));
  const nftsTest = await testEndpoint(
    'Wallet NFTs',
    `${MORALIS_BASE_URL}/${TEST_ADDRESSES.RANDOM_EOA}/nft`,
    { 
      chain: BASE_CHAIN_NAME,
      limit: 5
    }
  );
  if (nftsTest.success && nftsTest.data?.result) {
    console.log(chalk.gray(`   NFTs Found: ${nftsTest.data.result.length}`));
    if (nftsTest.data.result.length > 0) {
      const nft = nftsTest.data.result[0];
      console.log(chalk.gray(`   First NFT:`));
      console.log(chalk.gray(`     Collection: ${nft.name || 'Unknown'}`));
      console.log(chalk.gray(`     Token ID: ${nft.token_id}`));
      console.log(chalk.gray(`     Contract: ${nft.token_address?.substring(0, 10)}...`));
    }
  }

  // Test 7: Get transaction history
  console.log(chalk.bold('\n7. Testing Transaction History'));
  const txTest = await testEndpoint(
    'Transaction History',
    `${MORALIS_BASE_URL}/${TEST_ADDRESSES.USDC}`,
    { 
      chain: BASE_CHAIN_NAME,
      limit: 5
    }
  );
  if (txTest.success && txTest.data?.result) {
    console.log(chalk.gray(`   Transactions Found: ${txTest.data.result.length}`));
    if (txTest.data.result.length > 0) {
      const tx = txTest.data.result[0];
      console.log(chalk.gray(`   Latest Transaction:`));
      console.log(chalk.gray(`     Hash: ${tx.hash?.substring(0, 10)}...`));
      console.log(chalk.gray(`     Block: ${tx.block_number}`));
      console.log(chalk.gray(`     Gas Used: ${tx.gas || 'N/A'}`));
    }
  }

  // Test 8: Get multiple token prices (batch)
  console.log(chalk.bold('\n8. Testing Batch Token Prices'));
  const batchPriceTest = await testEndpoint(
    'Batch Token Prices',
    `${MORALIS_BASE_URL}/erc20/prices`,
    {
      chain: BASE_CHAIN_NAME,
      include: 'percent_change'
    },
    {
      'Content-Type': 'application/json'
    }
  );
  
  // Note: This endpoint might require POST with body, so it might fail
  // We're testing it anyway to see the response
  if (batchPriceTest.success) {
    console.log(chalk.gray(`   Response received`));
  }

  // Test 9: Get token allowance
  console.log(chalk.bold('\n9. Testing Token Allowance'));
  const allowanceTest = await testEndpoint(
    'Token Allowance',
    `${MORALIS_BASE_URL}/erc20/${TEST_ADDRESSES.USDC}/allowance`,
    {
      chain: BASE_CHAIN_NAME,
      owner_address: TEST_ADDRESSES.RANDOM_EOA,
      spender_address: TEST_ADDRESSES.WETH // Just for testing
    }
  );
  if (allowanceTest.success) {
    console.log(chalk.gray(`   Allowance: ${allowanceTest.data.allowance || '0'}`));
  }

  // Test 10: Resolve ENS domain (might not work on Base)
  console.log(chalk.bold('\n10. Testing ENS Resolution (Cross-chain)'));
  const ensTest = await testEndpoint(
    'ENS Resolution',
    `${MORALIS_BASE_URL}/resolve/ens/vitalik.eth`,
    {}
  );
  if (ensTest.success) {
    console.log(chalk.gray(`   Address: ${ensTest.data.address || 'Not resolved'}`));
  }

  // Test 11: Get API usage stats
  console.log(chalk.bold('\n11. Testing API Usage Stats'));
  const statsTest = await testEndpoint(
    'API Stats',
    'https://deep-index.moralis.io/api/v2/info/endpointWeights',
    {}
  );
  if (statsTest.success && Array.isArray(statsTest.data)) {
    console.log(chalk.gray(`   Endpoints tracked: ${statsTest.data.length}`));
  }

  // Summary
  console.log(chalk.bold.blue('\n📋 Test Summary\n'));
  
  // Check which features are working
  const workingFeatures = [];
  const notWorkingFeatures = [];
  
  if (balanceTest.success) workingFeatures.push('Native Balance');
  else notWorkingFeatures.push('Native Balance');
  
  if (metadataTest.success) workingFeatures.push('Token Metadata');
  else notWorkingFeatures.push('Token Metadata');
  
  if (priceTest.success) workingFeatures.push('Token Prices');
  else notWorkingFeatures.push('Token Prices');
  
  if (tokensTest.success) workingFeatures.push('Wallet Tokens');
  else notWorkingFeatures.push('Wallet Tokens');
  
  if (transfersTest.success) workingFeatures.push('Token Transfers');
  else notWorkingFeatures.push('Token Transfers');
  
  if (nftsTest.success) workingFeatures.push('NFT Data');
  else notWorkingFeatures.push('NFT Data');

  if (workingFeatures.length > 0) {
    console.log(chalk.green('✅ Working Features:'));
    workingFeatures.forEach(feature => {
      console.log(chalk.gray(`   • ${feature}`));
    });
  }
  
  if (notWorkingFeatures.length > 0) {
    console.log(chalk.yellow('\n⚠️  Not Working:'));
    notWorkingFeatures.forEach(feature => {
      console.log(chalk.gray(`   • ${feature}`));
    });
  }

  console.log(chalk.bold.blue('\n🎉 Moralis API Test Complete!\n'));
  console.log(chalk.gray(`   Chain: Base (${BASE_CHAIN_NAME})`));
  console.log(chalk.gray(`   API Endpoint: ${MORALIS_BASE_URL}`));
  console.log(chalk.gray(`   API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`));
  
  if (workingFeatures.length > 0) {
    console.log(chalk.green('\n✅ Moralis API is configured and working!'));
    console.log(chalk.gray('You can use Moralis for enhanced token metadata, prices, and NFT data.'));
  } else {
    console.log(chalk.red('\n❌ Moralis API is not working properly.'));
    console.log(chalk.gray('Please check your API key and ensure it has access to Base chain.'));
  }
}

// Run the tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test script error:'), error.message);
  process.exit(1);
});