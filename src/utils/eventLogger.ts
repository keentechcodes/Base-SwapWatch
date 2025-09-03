import chalk from 'chalk';
import { WebhookEvent, EventType, KNOWN_DEX_ROUTERS } from '../types/webhook';

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
        return chalk.gray;
    }
  }

  private static formatValue(value: string | number | undefined): string {
    if (!value) return 'N/A';
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (numValue > 1e9) {
      return `${(numValue / 1e9).toFixed(4)} B`;
    } else if (numValue > 1e6) {
      return `${(numValue / 1e6).toFixed(4)} M`;
    } else if (numValue > 1e3) {
      return `${(numValue / 1e3).toFixed(4)} K`;
    }
    
    return numValue.toString();
  }

  private static formatAddress(address: string | undefined): string {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private static detectSwap(event: WebhookEvent): boolean {
    // Check if it's a swap by looking at known DEX router contracts
    if (event.contractAddress && KNOWN_DEX_ROUTERS[event.contractAddress.toLowerCase()]) {
      return true;
    }

    // Check if it's a smart contract event with swap-related function
    if (event.eventType === 'smart_contract_event' && event.func) {
      const swapFunctions = ['swap', 'swapExact', 'swapTokens', 'exchange'];
      return swapFunctions.some(f => event.func!.toLowerCase().includes(f.toLowerCase()));
    }

    return false;
  }

  public static logEvent(event: WebhookEvent): void {
    const color = this.getEventColor(event.eventType as EventType);
    const timestamp = new Date().toISOString();
    const isSwap = this.detectSwap(event);

    console.log('\n' + chalk.gray('━'.repeat(80)));
    console.log(chalk.bold.white(`📨 Webhook Event Received`));
    console.log(chalk.gray(`Time: ${timestamp}`));
    console.log(chalk.gray('━'.repeat(80)));

    // Event header with swap detection
    if (isSwap) {
      console.log(chalk.bold.green('🔄 SWAP DETECTED!'));
      if (event.contractAddress) {
        const dexName = KNOWN_DEX_ROUTERS[event.contractAddress.toLowerCase()];
        if (dexName) {
          console.log(chalk.green(`   DEX: ${dexName}`));
        }
      }
    }

    // Event type and network
    console.log(color.bold(`Event Type: ${event.eventType}`));
    console.log(chalk.gray(`Network: ${event.network || 'unknown'}`));
    console.log(chalk.gray(`Webhook ID: ${event.webhookId}`));

    // Transaction details
    if (event.transactionHash) {
      console.log(chalk.blue(`Transaction: ${event.transactionHash}`));
    }
    
    if (event.blockNumber) {
      console.log(chalk.gray(`Block: ${event.blockNumber} | Time: ${event.blockTime || 'N/A'}`));
    }

    // Transfer details
    if (event.from || event.to) {
      console.log('\n' + chalk.bold('Transfer Details:'));
      if (event.from) {
        console.log(`  From: ${this.formatAddress(event.from)}`);
      }
      if (event.to) {
        console.log(`  To:   ${this.formatAddress(event.to)}`);
      }
      if (event.value !== undefined) {
        console.log(`  Value: ${color.bold(this.formatValue(event.value))}`);
      }
    }

    // Contract details
    if (event.contractAddress) {
      console.log('\n' + chalk.bold('Contract:'));
      console.log(`  Address: ${this.formatAddress(event.contractAddress)}`);
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
      console.log(chalk.gray(`Wallet ID: ${event.walletId}`));
    }

    console.log(chalk.gray('━'.repeat(80)) + '\n');

    // Log raw event in debug mode
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(chalk.gray('Raw Event Data:'));
      console.log(chalk.gray(JSON.stringify(event, null, 2)));
      console.log(chalk.gray('━'.repeat(80)) + '\n');
    }
  }

  public static logError(message: string, error?: any): void {
    console.error('\n' + chalk.red.bold('❌ Error:'), message);
    if (error) {
      console.error(chalk.red(error.stack || error));
    }
    console.error(chalk.gray('━'.repeat(80)) + '\n');
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