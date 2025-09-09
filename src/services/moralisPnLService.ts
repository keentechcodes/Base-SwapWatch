/**
 * Moralis PnL Service
 * Provides wallet profitability data for swap enrichment
 */

import axios, { AxiosInstance } from 'axios';

export interface WalletPnLSummary {
  totalRealizedProfitUsd: number;
  totalRealizedProfitPercentage: number;
  totalTradeVolume: number;
  totalBuys: number;
  totalSells: number;
  winRate?: number;
}

export interface TokenPnL {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  realizedProfitUsd: number;
  realizedProfitPercentage: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  totalBought: number;
  totalSold: number;
  trades: number;
}

export interface MoralisPnLConfig {
  apiKey: string;
  baseUrl?: string;
  chains?: string[];
  timeout?: number;
}

export class MoralisPnLService {
  private readonly axios: AxiosInstance;
  private readonly chains: string[];

  constructor(config: MoralisPnLConfig) {
    this.chains = config.chains || ['base'];
    
    this.axios = axios.create({
      baseURL: config.baseUrl || 'https://deep-index.moralis.io/api/v2.2',
      timeout: config.timeout || 5000,
      headers: {
        'X-API-Key': config.apiKey,
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Get wallet PnL summary
   */
  async getWalletSummary(address: string): Promise<WalletPnLSummary | null> {
    try {
      const response = await this.axios.get(
        `/wallets/${address}/profitability/summary`,
        {
          params: {
            chains: this.chains.join(',')
          }
        }
      );

      const data = response.data;
      
      return {
        totalRealizedProfitUsd: parseFloat(data.total_realized_profit_usd || '0'),
        totalRealizedProfitPercentage: parseFloat(data.total_realized_profit_percentage || '0'),
        totalTradeVolume: parseFloat(data.total_trade_volume || '0'),
        totalBuys: data.total_buys || 0,
        totalSells: data.total_sells || 0,
        winRate: data.win_rate
      };
    } catch (error: any) {
      console.error('Failed to fetch wallet PnL summary:', error.message);
      return null;
    }
  }

  /**
   * Get token-level PnL breakdown
   */
  async getTokenPnL(address: string, tokenAddress?: string): Promise<TokenPnL[]> {
    try {
      const response = await this.axios.get(
        `/wallets/${address}/profitability`,
        {
          params: {
            chains: this.chains.join(','),
            limit: 100
          }
        }
      );

      const results = response.data.result || [];
      
      const tokenPnLs = results.map((token: any) => ({
        tokenAddress: token.token_address,
        tokenName: token.name || 'Unknown',
        tokenSymbol: token.symbol || 'N/A',
        realizedProfitUsd: parseFloat(token.realized_profit_usd || '0'),
        realizedProfitPercentage: parseFloat(token.realized_profit_percentage || '0'),
        avgBuyPrice: parseFloat(token.avg_buy_price_usd || '0'),
        avgSellPrice: parseFloat(token.avg_sell_price_usd || '0'),
        totalBought: parseFloat(token.total_usd_invested || '0'),
        totalSold: parseFloat(token.total_sold_usd || '0'),
        trades: token.count_of_trades || 0
      }));

      // Filter for specific token if requested
      if (tokenAddress) {
        return tokenPnLs.filter(
          (pnl: TokenPnL) => pnl.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        );
      }

      return tokenPnLs;
    } catch (error: any) {
      console.error('Failed to fetch token PnL:', error.message);
      return [];
    }
  }

  /**
   * Get wallet's trading performance metrics
   */
  async getWalletPerformance(address: string): Promise<{
    summary: WalletPnLSummary | null;
    topPerformers: TokenPnL[];
    worstPerformers: TokenPnL[];
  }> {
    const [summary, tokenPnLs] = await Promise.all([
      this.getWalletSummary(address),
      this.getTokenPnL(address)
    ]);

    // Sort by profit
    const sorted = tokenPnLs.sort((a, b) => b.realizedProfitUsd - a.realizedProfitUsd);
    
    return {
      summary,
      topPerformers: sorted.slice(0, 5),
      worstPerformers: sorted.slice(-5).reverse()
    };
  }

  /**
   * Check if wallet is profitable trader
   */
  async isProfitableTrader(address: string, minProfit: number = 0): Promise<boolean> {
    const summary = await this.getWalletSummary(address);
    return summary ? summary.totalRealizedProfitUsd > minProfit : false;
  }

  /**
   * Get wallet's experience with specific token
   */
  async getTokenExperience(walletAddress: string, tokenAddress: string): Promise<{
    hasTradedBefore: boolean;
    profitLoss?: number;
    profitPercentage?: number;
    avgBuyPrice?: number;
    avgSellPrice?: number;
    trades?: number;
  }> {
    const tokenPnLs = await this.getTokenPnL(walletAddress, tokenAddress);
    
    if (tokenPnLs.length === 0) {
      return { hasTradedBefore: false };
    }

    const pnl = tokenPnLs[0];
    return {
      hasTradedBefore: true,
      profitLoss: pnl.realizedProfitUsd,
      profitPercentage: pnl.realizedProfitPercentage,
      avgBuyPrice: pnl.avgBuyPrice,
      avgSellPrice: pnl.avgSellPrice,
      trades: pnl.trades
    };
  }
}