#!/usr/bin/env node

/**
 * Test Moralis Wallet PnL APIs
 */

const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

const WALLET_ADDRESS = '0xA85dc25e248B7C27c5Db9cb86950f06e543a7Fce';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;

if (!MORALIS_API_KEY) {
  console.error(chalk.red('❌ MORALIS_API_KEY not found in environment'));
  process.exit(1);
}

// Test PnL Summary endpoint
async function getWalletPnLSummary() {
  console.log(chalk.cyan('\n📊 Fetching Wallet PnL Summary...'));
  console.log(chalk.gray(`Wallet: ${WALLET_ADDRESS}`));
  
  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${WALLET_ADDRESS}/profitability/summary`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json'
        },
        params: {
          chains: 'base' // Focus on Base chain, can be expanded
        }
      }
    );

    console.log(chalk.green('\n✅ PnL Summary Response:'));
    console.log(JSON.stringify(response.data, null, 2));
    
    // Parse and display key metrics
    if (response.data) {
      console.log(chalk.yellow('\n📈 Key Metrics:'));
      
      if (response.data.total_realized_profit_usd !== undefined) {
        const profit = parseFloat(response.data.total_realized_profit_usd);
        const color = profit >= 0 ? chalk.green : chalk.red;
        console.log(color(`  • Total Realized Profit: $${profit.toFixed(2)}`));
      }
      
      if (response.data.total_unrealized_profit_usd !== undefined) {
        const unrealized = parseFloat(response.data.total_unrealized_profit_usd);
        const color = unrealized >= 0 ? chalk.green : chalk.red;
        console.log(color(`  • Total Unrealized Profit: $${unrealized.toFixed(2)}`));
      }
      
      if (response.data.total_trades) {
        console.log(chalk.blue(`  • Total Trades: ${response.data.total_trades}`));
      }
      
      if (response.data.win_rate) {
        console.log(chalk.blue(`  • Win Rate: ${(response.data.win_rate * 100).toFixed(2)}%`));
      }
    }
    
    return response.data;
  } catch (error) {
    console.error(chalk.red('❌ Error fetching PnL Summary:'));
    if (error.response) {
      console.error(chalk.red(`  Status: ${error.response.status}`));
      console.error(chalk.red(`  Message: ${JSON.stringify(error.response.data)}`));
    } else {
      console.error(chalk.red(`  ${error.message}`));
    }
    return null;
  }
}

// Test PnL Breakdown endpoint
async function getWalletPnLBreakdown() {
  console.log(chalk.cyan('\n📊 Fetching Wallet PnL Breakdown...'));
  
  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${WALLET_ADDRESS}/profitability`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json'
        },
        params: {
          chains: 'base', // Focus on Base chain
          limit: 10 // Get top 10 tokens
        }
      }
    );

    console.log(chalk.green('\n✅ PnL Breakdown Response:'));
    console.log(JSON.stringify(response.data, null, 2));
    
    // Parse and display token-level breakdown
    if (response.data && response.data.result) {
      console.log(chalk.yellow('\n💰 Token PnL Breakdown:'));
      
      response.data.result.forEach((token, index) => {
        console.log(chalk.cyan(`\n  ${index + 1}. ${token.token_name || 'Unknown Token'} (${token.token_symbol})`));
        console.log(chalk.gray(`     Address: ${token.token_address}`));
        
        if (token.realized_profit_usd !== undefined) {
          const profit = parseFloat(token.realized_profit_usd);
          const color = profit >= 0 ? chalk.green : chalk.red;
          console.log(color(`     Realized P&L: $${profit.toFixed(2)}`));
        }
        
        if (token.unrealized_profit_usd !== undefined) {
          const unrealized = parseFloat(token.unrealized_profit_usd);
          const color = unrealized >= 0 ? chalk.green : chalk.red;
          console.log(color(`     Unrealized P&L: $${unrealized.toFixed(2)}`));
        }
        
        if (token.total_bought && token.total_sold) {
          console.log(chalk.gray(`     Bought: $${parseFloat(token.total_bought).toFixed(2)}`));
          console.log(chalk.gray(`     Sold: $${parseFloat(token.total_sold).toFixed(2)}`));
        }
        
        if (token.avg_buy_price && token.avg_sell_price) {
          console.log(chalk.gray(`     Avg Buy Price: $${parseFloat(token.avg_buy_price).toFixed(6)}`));
          console.log(chalk.gray(`     Avg Sell Price: $${parseFloat(token.avg_sell_price).toFixed(6)}`));
        }
      });
    }
    
    return response.data;
  } catch (error) {
    console.error(chalk.red('❌ Error fetching PnL Breakdown:'));
    if (error.response) {
      console.error(chalk.red(`  Status: ${error.response.status}`));
      console.error(chalk.red(`  Message: ${JSON.stringify(error.response.data)}`));
    } else {
      console.error(chalk.red(`  ${error.message}`));
    }
    return null;
  }
}

// Main function
async function main() {
  console.log(chalk.bold.blue('\n🔍 Testing Moralis Wallet PnL APIs'));
  console.log(chalk.gray('=' .repeat(50)));
  
  // Test both endpoints
  const summary = await getWalletPnLSummary();
  
  if (summary) {
    console.log(chalk.gray('\n' + '=' .repeat(50)));
  }
  
  const breakdown = await getWalletPnLBreakdown();
  
  // Final summary
  console.log(chalk.bold.blue('\n📋 Test Complete'));
  console.log(chalk.gray('=' .repeat(50)));
  
  if (summary || breakdown) {
    console.log(chalk.green('✅ Successfully connected to Moralis API'));
    console.log(chalk.yellow('\nNext Steps:'));
    console.log(chalk.gray('1. Integrate PnL data into swap enrichment'));
    console.log(chalk.gray('2. Cache wallet PnL data with appropriate TTL'));
    console.log(chalk.gray('3. Add PnL tracking to webhook events'));
  } else {
    console.log(chalk.red('❌ Failed to fetch PnL data'));
    console.log(chalk.yellow('\nTroubleshooting:'));
    console.log(chalk.gray('1. Verify API key is valid'));
    console.log(chalk.gray('2. Check if wallet has trading history on Base'));
    console.log(chalk.gray('3. Ensure API plan includes PnL endpoints'));
  }
}

// Run the test
main().catch(error => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});