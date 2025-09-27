import { WebhookEvent } from '../types/webhook';
import chalk from 'chalk';

export interface SwapData {
  dexName: string;
  from: string;
  to: string;
  transactionHash?: string;
  value?: string | number;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOut?: string;
  methodName?: string;
}

const DEX_ROUTERS: Record<string, string> = {
  '0x2626664c2603336E57B271c5C0b26F421741e481': 'Uniswap V3',
  '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86': 'BaseSwap',
  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43': 'Aerodrome',
  '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891': 'SushiSwap',
  '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb': 'PancakeSwap V3',
  '0x1B8eea9315bE495187D873DA7773a874545D9D48': 'Velodrome',
  '0x6e4141d33021b52c91c28608403db4a0ffb50ec6': 'KyberSwap',
  '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5': 'KyberSwap Aggregator',
};

const SWAP_METHOD_PATTERNS = [
  'swap',
  'swapExactTokensForTokens',
  'swapTokensForExactTokens',
  'swapExactETHForTokens',
  'swapTokensForExactETH',
  'swapExactTokensForETH',
  'swapETHForExactTokens',
  'multicall',
  'execute',
];

export function isKnownDexRouter(address: string): boolean {
  if (!address) return false;
  const normalizedAddress = address.toLowerCase();
  return Object.keys(DEX_ROUTERS).some(
    router => router.toLowerCase() === normalizedAddress
  );
}

export function identifySwapEvent(event: WebhookEvent): boolean {
  if (event.eventType === 'smart_contract_event') {
    if (event.contractAddress && isKnownDexRouter(event.contractAddress)) {
      return true;
    }
    
    if (event.to && isKnownDexRouter(event.to)) {
      return true;
    }
    
    if (event.methodName) {
      const methodLower = event.methodName.toLowerCase();
      return SWAP_METHOD_PATTERNS.some(pattern => 
        methodLower.includes(pattern.toLowerCase())
      );
    }
  }
  
  if (event.eventType === 'transaction') {
    if (event.to && isKnownDexRouter(event.to)) {
      return true;
    }
  }
  
  return false;
}

export function extractSwapData(event: WebhookEvent): SwapData | undefined {
  if (!identifySwapEvent(event)) {
    return undefined;
  }
  
  let dexName = 'Unknown DEX';
  const targetAddress = event.contractAddress || event.to;
  
  if (targetAddress) {
    const normalizedAddress = targetAddress.toLowerCase();
    const routerEntry = Object.entries(DEX_ROUTERS).find(
      ([address]) => address.toLowerCase() === normalizedAddress
    );
    if (routerEntry) {
      dexName = routerEntry[1];
    }
  }
  
  const swapData: SwapData = {
    dexName,
    from: event.from || 'Unknown',
    to: targetAddress || 'Unknown',
    transactionHash: event.transactionHash,
    value: event.value,
    methodName: event.methodName,
  };
  
  if (event.data && typeof event.data === 'object') {
    const data = event.data as any;
    swapData.tokenIn = data.tokenIn || data.token0 || data.tokenA;
    swapData.tokenOut = data.tokenOut || data.token1 || data.tokenB;
    swapData.amountIn = data.amountIn || data.amount0In || data.amountA;
    swapData.amountOut = data.amountOut || data.amount1Out || data.amountB;
  }
  
  return swapData;
}

export function formatSwapEvent(swapData: SwapData): void {
  console.log(chalk.yellow.bold('🔄 SWAP DETECTED!'));
  console.log(chalk.cyan('📊 DEX:'), chalk.white(swapData.dexName));
  console.log(chalk.cyan('👤 From:'), chalk.white(swapData.from));
  console.log(chalk.cyan('📍 Router:'), chalk.white(swapData.to));
  
  if (swapData.transactionHash) {
    console.log(chalk.cyan('🔗 Tx Hash:'), chalk.white(swapData.transactionHash));
  }
  
  if (swapData.methodName) {
    console.log(chalk.cyan('⚡ Method:'), chalk.white(swapData.methodName));
  }
  
  if (swapData.tokenIn && swapData.tokenOut) {
    console.log(chalk.cyan('💱 Swap:'));
    console.log(chalk.green('  → In:'), chalk.white(swapData.tokenIn));
    if (swapData.amountIn) {
      console.log(chalk.green('    Amount:'), chalk.white(swapData.amountIn));
    }
    console.log(chalk.red('  ← Out:'), chalk.white(swapData.tokenOut));
    if (swapData.amountOut) {
      console.log(chalk.red('    Amount:'), chalk.white(swapData.amountOut));
    }
  }
  
  if (swapData.value) {
    console.log(chalk.cyan('💰 Value:'), chalk.white(swapData.value));
  }
  
  console.log(chalk.yellow('─'.repeat(50)));
}