import chalk from 'chalk';
import { WebhookEvent, EventType } from '../types/webhook';
import { identifySwapEvent, extractSwapData, formatSwapEvent } from './swapDetector';

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
    
    if (actualValue > 1e9) {
      return `${(actualValue / 1e9).toFixed(4)} B`;
    } else if (actualValue > 1e6) {
      return `${(actualValue / 1e6).toFixed(4)} M`;
    } else if (actualValue > 1e3) {
      return `${(actualValue / 1e3).toFixed(4)} K`;
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
}