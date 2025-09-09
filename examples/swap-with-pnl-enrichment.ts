/**
 * Example: Enriching Swap Events with Wallet PnL Data
 * 
 * This shows how to add trader profitability context to swap events
 */

import { MoralisPnLService } from '../src/services/moralisPnLService';
import chalk from 'chalk';

// Example swap event (from webhook)
interface SwapEvent {
  transactionHash: string;
  from: string;  // Wallet address
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: number;
}

// Enriched swap event with PnL data
interface EnrichedSwapEvent extends SwapEvent {
  walletPnL?: {
    isExperiencedTrader: boolean;
    totalProfit: number;
    profitPercentage: number;
    totalTrades: number;
    tokenInExperience?: {
      hasTradedBefore: boolean;
      previousProfit?: number;
      avgBuyPrice?: number;
    };
    tokenOutExperience?: {
      hasTradedBefore: boolean;
      previousProfit?: number;
      avgSellPrice?: number;
    };
    traderProfile: 'whale' | 'profitable' | 'new' | 'unprofitable';
  };
}

/**
 * Enrich swap event with wallet PnL data
 */
async function enrichSwapWithPnL(
  swap: SwapEvent,
  pnlService: MoralisPnLService
): Promise<EnrichedSwapEvent> {
  try {
    // Fetch wallet's overall performance
    const [summary, tokenInExp, tokenOutExp] = await Promise.all([
      pnlService.getWalletSummary(swap.from),
      pnlService.getTokenExperience(swap.from, swap.tokenIn),
      pnlService.getTokenExperience(swap.from, swap.tokenOut)
    ]);

    // Determine trader profile
    let traderProfile: 'whale' | 'profitable' | 'new' | 'unprofitable' = 'new';
    
    if (summary) {
      if (summary.totalTradeVolume > 1000000) {
        traderProfile = 'whale';
      } else if (summary.totalRealizedProfitUsd > 0) {
        traderProfile = 'profitable';
      } else if ((summary.totalBuys + summary.totalSells) > 10) {
        traderProfile = 'unprofitable';
      }
    }

    return {
      ...swap,
      walletPnL: summary ? {
        isExperiencedTrader: (summary.totalBuys + summary.totalSells) > 10,
        totalProfit: summary.totalRealizedProfitUsd,
        profitPercentage: summary.totalRealizedProfitPercentage,
        totalTrades: summary.totalBuys + summary.totalSells,
        tokenInExperience: {
          hasTradedBefore: tokenInExp.hasTradedBefore,
          previousProfit: tokenInExp.profitLoss,
          avgBuyPrice: tokenInExp.avgBuyPrice
        },
        tokenOutExperience: {
          hasTradedBefore: tokenOutExp.hasTradedBefore,
          previousProfit: tokenOutExp.profitLoss,
          avgSellPrice: tokenOutExp.avgSellPrice
        },
        traderProfile
      } : undefined
    };
  } catch (error) {
    console.error('Failed to enrich with PnL data:', error);
    return swap; // Return original swap if enrichment fails
  }
}

/**
 * Display enriched swap with PnL context
 */
function displayEnrichedSwap(swap: EnrichedSwapEvent) {
  console.log(chalk.bold.cyan('\n🔄 ENRICHED SWAP DETECTED\n'));
  
  // Basic swap info
  console.log(chalk.white('Transaction:'), swap.transactionHash);
  console.log(chalk.white('From:'), swap.from);
  console.log(chalk.white('Token In:'), swap.tokenIn);
  console.log(chalk.white('Token Out:'), swap.tokenOut);
  
  // PnL enrichment
  if (swap.walletPnL) {
    console.log(chalk.bold.yellow('\n👤 Trader Profile:'));
    
    // Profile badge
    const profileColors = {
      whale: chalk.bold.blue,
      profitable: chalk.bold.green,
      new: chalk.gray,
      unprofitable: chalk.red
    };
    const profileEmojis = {
      whale: '🐋',
      profitable: '💚',
      new: '🆕',
      unprofitable: '📉'
    };
    
    const color = profileColors[swap.walletPnL.traderProfile];
    const emoji = profileEmojis[swap.walletPnL.traderProfile];
    
    console.log(color(`  ${emoji} ${swap.walletPnL.traderProfile.toUpperCase()} TRADER`));
    
    // Overall stats
    const profitColor = swap.walletPnL.totalProfit >= 0 ? chalk.green : chalk.red;
    console.log(profitColor(`  💰 Total P&L: $${swap.walletPnL.totalProfit.toFixed(2)} (${swap.walletPnL.profitPercentage.toFixed(2)}%)`));
    console.log(chalk.blue(`  📊 Total Trades: ${swap.walletPnL.totalTrades}`));
    
    // Token experience
    if (swap.walletPnL.tokenInExperience?.hasTradedBefore) {
      console.log(chalk.yellow('\n  📈 Previously traded Token In:'));
      if (swap.walletPnL.tokenInExperience.previousProfit !== undefined) {
        const tokenProfitColor = swap.walletPnL.tokenInExperience.previousProfit >= 0 ? chalk.green : chalk.red;
        console.log(tokenProfitColor(`     Previous P&L: $${swap.walletPnL.tokenInExperience.previousProfit.toFixed(2)}`));
      }
      if (swap.walletPnL.tokenInExperience.avgBuyPrice) {
        console.log(chalk.gray(`     Avg Buy Price: $${swap.walletPnL.tokenInExperience.avgBuyPrice.toFixed(6)}`));
      }
    }
    
    if (swap.walletPnL.tokenOutExperience?.hasTradedBefore) {
      console.log(chalk.yellow('\n  📈 Previously traded Token Out:'));
      if (swap.walletPnL.tokenOutExperience.previousProfit !== undefined) {
        const tokenProfitColor = swap.walletPnL.tokenOutExperience.previousProfit >= 0 ? chalk.green : chalk.red;
        console.log(tokenProfitColor(`     Previous P&L: $${swap.walletPnL.tokenOutExperience.previousProfit.toFixed(2)}`));
      }
    }
    
    // Trading insights
    console.log(chalk.bold.cyan('\n💡 Insights:'));
    if (swap.walletPnL.traderProfile === 'whale') {
      console.log(chalk.blue('  • High volume trader - significant market impact possible'));
    } else if (swap.walletPnL.traderProfile === 'profitable' && swap.walletPnL.totalProfit > 1000) {
      console.log(chalk.green('  • Consistently profitable trader - worth following'));
    } else if (swap.walletPnL.isExperiencedTrader && swap.walletPnL.totalProfit < 0) {
      console.log(chalk.yellow('  • Experienced but unprofitable - contrarian indicator'));
    } else if (swap.walletPnL.traderProfile === 'new') {
      console.log(chalk.gray('  • New trader - limited historical data'));
    }
  }
  
  console.log(chalk.cyan('\n' + '═'.repeat(60) + '\n'));
}

// Example usage
async function testPnLEnrichment() {
  // Initialize service
  const pnlService = new MoralisPnLService({
    apiKey: process.env.MORALIS_API_KEY!,
    chains: ['base']
  });

  // Example swap event
  const swapEvent: SwapEvent = {
    transactionHash: '0x123...',
    from: '0xA85dc25e248B7C27c5Db9cb86950f06e543a7Fce', // The wallet we tested
    tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    tokenOut: '0xe1270268fa6fcef965958bf2f24e09d70deed06f', // ZODIA
    amountIn: '1000',
    amountOut: '1200000',
    timestamp: Date.now()
  };

  // Enrich with PnL data
  const enrichedSwap = await enrichSwapWithPnL(swapEvent, pnlService);
  
  // Display results
  displayEnrichedSwap(enrichedSwap);
}

// Run if executed directly
if (require.main === module) {
  require('dotenv').config();
  testPnLEnrichment().catch(console.error);
}

export { enrichSwapWithPnL, MoralisPnLService };