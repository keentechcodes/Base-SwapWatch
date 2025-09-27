import chalk from 'chalk';
import { WebhookEvent, EventType } from '../types/webhook';
import { identifySwapEvent, extractSwapData, formatSwapEvent } from './swapDetector';
import { EnrichedSwapEvent } from '../services/enrichment/SwapEnricher';
import { formatUsdValue } from '../services/enrichment/calculations';

export class EventLogger {
  private static getEventColor(eventType: EventType): any {
    switch (eventType) {
      case 'erc20_transfer':
        return chalk.cyan;
      case 'erc721_transfer':
        return chalk.magenta;
      case 'erc1155_transfer_single':
      case 'erc1155_transfer_batch':
        return chalk.yellow;
      case 'transaction':
        return chalk.blue;
      case 'smart_contract_event':
        return chalk.green;
      case 'wallet_activity':
        return chalk.white;
      default:
        return chalk.cyan;
    }
  }

  private static formatValue(value: string | number | undefined, decimals: number = 18): string {
    if (!value) return 'N/A';

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const actualValue = numValue / Math.pow(10, decimals);

    // For larger values, show the full number with commas for better readability
    if (actualValue >= 1000) {
      return actualValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (actualValue < 0.0001 && actualValue > 0) {
      return actualValue.toExponential(4);
    }

    return actualValue.toFixed(6);
  }

  private static getTokenDecimals(contractAddress: string | undefined): number {
    if (!contractAddress) return 18;
    
    // Common Base tokens and their decimals
    const tokenDecimals: Record<string, number> = {
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI  
      '0x4200000000000000000000000000000000000006': 18, // WETH
      '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 6,  // USDbC
      '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 18, // cbETH
      '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': 18, // DEGEN
      '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18, // AERO
    };
    
    return tokenDecimals[contractAddress.toLowerCase()] || 18;
  }

  private static formatAddress(address: string | undefined, shorten: boolean = false): string {
    if (!address) return 'N/A';
    if (shorten) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    return address;
  }


  public static logEvent(event: WebhookEvent): void {
    const color = this.getEventColor(event.eventType as EventType);
    const timestamp = new Date().toISOString();
    const isSwap = identifySwapEvent(event);
    const swapData = extractSwapData(event);

    console.log('\n' + chalk.cyan('━'.repeat(80)));
    console.log(chalk.bold.white(`📨 Webhook Event Received`));
    console.log(chalk.cyan(`Time: ${timestamp}`));
    console.log(chalk.cyan('━'.repeat(80)));

    // Event header with enhanced swap detection
    if (isSwap && swapData) {
      formatSwapEvent(swapData);
    }

    // Event type and network
    console.log(color.bold(`Event Type: ${event.eventType}`));
    console.log(chalk.cyan(`Network: ${event.network || 'unknown'}`));
    console.log(chalk.cyan(`Webhook ID: ${event.webhookId}`));

    // Transaction details with BaseScan link
    if (event.transactionHash) {
      const baseScanUrl = `https://basescan.org/tx/${event.transactionHash}`;
      console.log(chalk.blue(`Transaction:`));
      console.log(chalk.cyan.underline(baseScanUrl));
    }
    
    if (event.blockNumber) {
      console.log(chalk.cyan(`Block: ${event.blockNumber} | Time: ${event.blockTime || 'N/A'}`));
    }

    // Transfer details
    if (event.from || event.to) {
      console.log('\n' + chalk.bold('Transfer Details:'));
      if (event.from) {
        console.log(`  From: ${chalk.cyan(event.from)}`);
      }
      if (event.to) {
        console.log(`  To:   ${chalk.cyan(event.to)}`);
      }
      if (event.value !== undefined) {
        const decimals = this.getTokenDecimals(event.contractAddress);
        console.log(`  Value: ${color.bold(this.formatValue(event.value, decimals))}`);
      }
    }

    // Contract details
    if (event.contractAddress) {
      console.log('\n' + chalk.bold('Contract:'));
      console.log(`  Address: ${chalk.cyan(event.contractAddress)}`);
      if (event.func) {
        console.log(`  Function: ${event.func}`);
      }
    }

    // NFT details
    if (event.tokenId !== undefined) {
      console.log('\n' + chalk.bold('NFT Details:'));
      console.log(`  Token ID: ${event.tokenId}`);
    }

    // ERC1155 batch details
    if (event.ids && event.values) {
      console.log('\n' + chalk.bold('Batch Transfer:'));
      event.ids.forEach((id, index) => {
        console.log(`  Token ${id}: ${event.values![index]} units`);
      });
    }

    // Wallet activity details
    if (event.addresses) {
      console.log('\n' + chalk.bold('Monitored Addresses:'));
      event.addresses.forEach(addr => {
        console.log(`  - ${this.formatAddress(addr)}`);
      });
    }

    if (event.walletId) {
      console.log(chalk.cyan(`Wallet ID: ${event.walletId}`));
    }

    console.log(chalk.cyan('━'.repeat(80)) + '\n');

    // Log raw event in debug mode
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(chalk.cyan('Raw Event Data:'));
      console.log(chalk.cyan(JSON.stringify(event, null, 2)));
      console.log(chalk.cyan('━'.repeat(80)) + '\n');
    }
  }

  public static logError(message: string, error?: any): void {
    console.error('\n' + chalk.red.bold('❌ Error:'), message);
    if (error) {
      console.error(chalk.red(error.stack || error));
    }
    console.error(chalk.cyan('━'.repeat(80)) + '\n');
  }

  public static logInfo(message: string, data?: any): void {
    console.log(chalk.blue('ℹ️  ') + message);
    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  public static logSuccess(message: string): void {
    console.log(chalk.green('✅ ') + message);
  }

  public static logWarning(message: string): void {
    console.warn(chalk.yellow('⚠️  ') + message);
  }

  /**
   * Log enriched swap event with comprehensive market data
   */
  public static logEnrichedSwapEvent(event: EnrichedSwapEvent): void {
    console.log('\n' + chalk.green('═'.repeat(80)));
    console.log(chalk.bold.green('💰 ENRICHED SWAP EVENT'));
    console.log(chalk.green('═'.repeat(80)));
    
    // Basic swap info
    console.log(chalk.cyan('\n📊 Swap Details:'));
    console.log(`  ${chalk.gray('DEX:')} ${chalk.white(event.dexName)}`);
    console.log(`  ${chalk.gray('From:')} ${chalk.yellow(this.formatAddress(event.from, true))}`);
    console.log(`  ${chalk.gray('To:')} ${chalk.yellow(event.to ? this.formatAddress(event.to, true) : 'N/A')}`);
    console.log(`  ${chalk.gray('TX:')} ${chalk.blue(event.transactionHash || 'N/A')}`);
    if (event.methodName) {
      console.log(`  ${chalk.gray('Method:')} ${chalk.white(event.methodName)}`);
    }
    
    // Token In Data
    if (event.tokenInData) {
      const token = event.tokenInData;
      console.log(chalk.yellow('\n📥 Token In:'));
      console.log(`  ${chalk.gray('Token:')} ${chalk.white.bold(token.symbol)} ${chalk.gray(`(${token.name})`)}`);
      console.log(`  ${chalk.gray('Address:')} ${chalk.cyan(this.formatAddress(token.address))}`);
      
      if (token.price) {
        const priceChange = token.priceChange24h || 0;
        const changeColor = priceChange > 0 ? chalk.green : priceChange < 0 ? chalk.red : chalk.gray;
        console.log(`  ${chalk.gray('Price:')} ${chalk.green('$' + token.price)} ${changeColor(`(${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%)`)}`);
      }
      
      if (token.marketCap) {
        console.log(`  ${chalk.gray('Market Cap:')} ${chalk.white(formatUsdValue(token.marketCap))}`);
      }
      
      if (token.volume24h) {
        console.log(`  ${chalk.gray('24h Volume:')} ${chalk.white(formatUsdValue(token.volume24h))}`);
      }
      
      if (token.liquidity) {
        console.log(`  ${chalk.gray('Liquidity:')} ${chalk.white(formatUsdValue(token.liquidity))}`);
      }
      
      console.log(`  ${chalk.gray('Verified:')} ${token.isVerified ? chalk.green('✅ Yes') : chalk.yellow('⚠️  No')}`);
    }
    
    // Token Out Data
    if (event.tokenOutData) {
      const token = event.tokenOutData;
      console.log(chalk.yellow('\n📤 Token Out:'));
      console.log(`  ${chalk.gray('Token:')} ${chalk.white.bold(token.symbol)} ${chalk.gray(`(${token.name})`)}`);
      console.log(`  ${chalk.gray('Address:')} ${chalk.cyan(this.formatAddress(token.address))}`);
      
      if (token.price) {
        const priceChange = token.priceChange24h || 0;
        const changeColor = priceChange > 0 ? chalk.green : priceChange < 0 ? chalk.red : chalk.gray;
        console.log(`  ${chalk.gray('Price:')} ${chalk.green('$' + token.price)} ${changeColor(`(${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%)`)}`);
      }
      
      if (token.marketCap) {
        console.log(`  ${chalk.gray('Market Cap:')} ${chalk.white(formatUsdValue(token.marketCap))}`);
      }
      
      if (token.volume24h) {
        console.log(`  ${chalk.gray('24h Volume:')} ${chalk.white(formatUsdValue(token.volume24h))}`);
      }
      
      if (token.liquidity) {
        console.log(`  ${chalk.gray('Liquidity:')} ${chalk.white(formatUsdValue(token.liquidity))}`);
      }
      
      console.log(`  ${chalk.gray('Verified:')} ${token.isVerified ? chalk.green('✅ Yes') : chalk.yellow('⚠️  No')}`);
    }
    
    // USD Values and Swap Metrics
    if (event.usdValues) {
      console.log(chalk.magenta('\n💵 Swap Values:'));
      console.log(`  ${chalk.gray('Amount In:')} ${chalk.green.bold(formatUsdValue(event.usdValues.amountInUsd || '0'))}`);
      console.log(`  ${chalk.gray('Amount Out:')} ${chalk.green.bold(formatUsdValue(event.usdValues.amountOutUsd || '0'))}`);
      
      if (event.usdValues.slippage !== undefined) {
        const slippageColor = Math.abs(event.usdValues.slippage) > 2 ? chalk.red : 
                             Math.abs(event.usdValues.slippage) > 0.5 ? chalk.yellow : chalk.green;
        console.log(`  ${chalk.gray('Slippage:')} ${slippageColor(event.usdValues.slippage.toFixed(2) + '%')}`);
      }
      
      if (event.usdValues.priceImpact !== undefined) {
        const impactColor = event.usdValues.priceImpact > 2 ? chalk.red : 
                           event.usdValues.priceImpact > 0.5 ? chalk.yellow : chalk.green;
        console.log(`  ${chalk.gray('Price Impact:')} ${impactColor(event.usdValues.priceImpact.toFixed(2) + '%')}`);
      }
    }
    
    // Wallet Profile (if PnL data available)
    if (event.walletData) {
      console.log(chalk.blue('\n👤 Wallet Profile:'));
      console.log(`  ${chalk.gray('Experienced Trader:')} ${event.walletData.isExperiencedTrader ? chalk.green('Yes') : chalk.yellow('No')}`);
      
      if (event.walletData.totalProfit !== undefined) {
        const profitColor = event.walletData.totalProfit >= 0 ? chalk.green : chalk.red;
        console.log(`  ${chalk.gray('Total P&L:')} ${profitColor(formatUsdValue(event.walletData.totalProfit, true))}`);
      }
      
      if (event.walletData.profitPercentage !== undefined) {
        const profitColor = event.walletData.profitPercentage >= 0 ? chalk.green : chalk.red;
        console.log(`  ${chalk.gray('P&L %:')} ${profitColor((event.walletData.profitPercentage >= 0 ? '+' : '') + event.walletData.profitPercentage.toFixed(2) + '%')}`);
      }
      
      if (event.walletData.winRate !== undefined) {
        const winRateColor = event.walletData.winRate > 60 ? chalk.green : 
                            event.walletData.winRate > 40 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.gray('Win Rate:')} ${winRateColor(event.walletData.winRate.toFixed(1) + '%')}`);
      }
      
      console.log(`  ${chalk.gray('Total Trades:')} ${chalk.white(event.walletData.totalTrades || 0)}`);
    }
    
    // Enrichment Metrics
    if (event.enrichmentMetrics) {
      console.log(chalk.gray('\n⚡ Performance Metrics:'));
      
      const latencyColor = event.enrichmentMetrics.latency < 200 ? chalk.green :
                          event.enrichmentMetrics.latency < 500 ? chalk.yellow : chalk.red;
      console.log(`  ${chalk.gray('Enrichment Latency:')} ${latencyColor(event.enrichmentMetrics.latency + 'ms')}`);
      
      console.log(`  ${chalk.gray('Cache Hits:')} ${chalk.green(event.enrichmentMetrics.cacheHits)}`);
      console.log(`  ${chalk.gray('Cache Misses:')} ${chalk.yellow(event.enrichmentMetrics.cacheMisses)}`);
      console.log(`  ${chalk.gray('API Calls:')} ${chalk.cyan(event.enrichmentMetrics.apiCalls)}`);
      
      if (event.enrichmentMetrics.fallbacksUsed && event.enrichmentMetrics.fallbacksUsed.length > 0) {
        console.log(`  ${chalk.gray('Fallbacks Used:')} ${chalk.yellow(event.enrichmentMetrics.fallbacksUsed.join(', '))}`);
      }
      
      // Calculate cache hit rate
      const totalLookups = event.enrichmentMetrics.cacheHits + event.enrichmentMetrics.cacheMisses;
      if (totalLookups > 0) {
        const hitRate = (event.enrichmentMetrics.cacheHits / totalLookups) * 100;
        const hitRateColor = hitRate > 80 ? chalk.green : hitRate > 50 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.gray('Cache Hit Rate:')} ${hitRateColor(hitRate.toFixed(1) + '%')}`);
      }
    }
    
    // Timestamp
    console.log(chalk.gray(`\n⏰ Enriched at: ${event.enrichedAt ? new Date(event.enrichedAt).toISOString() : new Date().toISOString()}`));
    
    console.log(chalk.green('═'.repeat(80)) + '\n');
  }

  /**
   * Log swap summary (compact format)
   */
  public static logSwapSummary(event: EnrichedSwapEvent): void {
    const tokenIn = event.tokenInData?.symbol || 'UNKNOWN';
    const tokenOut = event.tokenOutData?.symbol || 'UNKNOWN';
    const valueIn = event.usdValues?.amountInUsd ? formatUsdValue(event.usdValues.amountInUsd) : 'N/A';
    const valueOut = event.usdValues?.amountOutUsd ? formatUsdValue(event.usdValues.amountOutUsd) : 'N/A';
    
    const summary = `${chalk.green('🔄')} ${chalk.white(event.from.slice(0, 6) + '...')} swapped ${chalk.yellow(tokenIn)} ${chalk.gray('→')} ${chalk.cyan(tokenOut)} | ${chalk.green(valueIn)} ${chalk.gray('→')} ${chalk.green(valueOut)} on ${chalk.white(event.dexName)}`;
    
    console.log(summary);
  }
}