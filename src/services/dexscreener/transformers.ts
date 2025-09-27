/**
 * Pure transformation functions for DexScreener data
 * Following hybrid architecture: pure functions for business logic
 */

import { DexScreenerPair, DexScreenerTokenResponse } from './types';
import { MarketData } from '../types';
import { ExtendedTokenInfo as TokenInfo } from '../types/extended';
import { DexScreenerDexInfo as DexInfo } from './dex-types';
import BigNumber from 'bignumber.js';

/**
 * Transform DexScreener pair to market data
 * Pure function - no side effects
 */
export const transformPairToMarketData = (pair: DexScreenerPair): MarketData => {
  return {
    price: pair.priceUsd,
    priceChange24h: pair.priceChange.h24,
    volume24h: pair.volume.h24.toString(),
    liquidity: pair.liquidity?.usd?.toString() || '0',
    marketCap: pair.marketCap?.toString() || calculateMarketCap(pair),
    fdv: pair.fdv?.toString() || '0',
    holders: 0, // DexScreener doesn't provide holder count
    lastUpdated: new Date()
  };
};

/**
 * Transform DexScreener pair to token info
 * Pure function - no side effects
 */
export const transformPairToTokenInfo = (pair: DexScreenerPair): TokenInfo => {
  const token = pair.baseToken;
  return {
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    decimals: 18, // DexScreener doesn't provide decimals, default to 18
    totalSupply: '0', // Not provided by DexScreener
    circulatingSupply: undefined,
    logo: pair.info?.imageUrl,
    description: undefined,
    website: pair.info?.websites?.[0]?.url,
    social: {
      twitter: pair.info?.socials?.find(s => s.type === 'twitter')?.url,
      telegram: pair.info?.socials?.find(s => s.type === 'telegram')?.url,
      discord: pair.info?.socials?.find(s => s.type === 'discord')?.url
    }
  };
};

/**
 * Transform DexScreener pair to DEX info
 * Pure function - no side effects
 */
export const transformPairToDexInfo = (pair: DexScreenerPair): DexInfo => {
  return {
    dexName: pair.dexId,
    routerAddress: pair.pairAddress,
    factoryAddress: undefined, // Not provided by DexScreener
    pairAddress: pair.pairAddress,
    poolUrl: pair.url,
    liquidity: {
      token0: pair.liquidity?.base?.toString() || '0',
      token1: pair.liquidity?.quote?.toString() || '0',
      usd: pair.liquidity?.usd?.toString() || '0'
    },
    fees: {
      swapFee: '0.003', // Default 0.3% for most DEXs
      protocolFee: '0'
    }
  };
};

/**
 * Find the best pair from multiple pairs
 * Prioritizes by liquidity and volume
 */
export const selectBestPair = (pairs: DexScreenerPair[]): DexScreenerPair | null => {
  if (pairs.length === 0) return null;
  
  return pairs.reduce((best, current) => {
    const bestScore = calculatePairScore(best);
    const currentScore = calculatePairScore(current);
    return currentScore > bestScore ? current : best;
  });
};

/**
 * Calculate a score for pair quality
 * Higher liquidity and volume = better pair
 */
const calculatePairScore = (pair: DexScreenerPair): number => {
  const liquidityScore = pair.liquidity?.usd || 0;
  const volumeScore = pair.volume.h24 || 0;
  const ageScore = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0;
  
  // Weight: 50% liquidity, 30% volume, 20% age
  return liquidityScore * 0.5 + volumeScore * 0.3 + ageScore * 0.0000002;
};

/**
 * Calculate market cap if not provided
 * Pure function using price and supply
 */
const calculateMarketCap = (pair: DexScreenerPair): string => {
  if (pair.fdv && pair.liquidity?.base) {
    // Rough estimate: fdv * (liquidity / total supply approximation)
    return new BigNumber(pair.fdv).multipliedBy(0.1).toFixed(0);
  }
  return '0';
};

/**
 * Calculate USD value for a token amount
 * Pure function for value calculations
 */
export const calculateUsdValue = (
  amount: string,
  price: string,
  decimals: number = 18
): string => {
  if (!amount || !price) return '0';
  
  return new BigNumber(amount)
    .dividedBy(new BigNumber(10).pow(decimals))
    .multipliedBy(price)
    .toFixed(2);
};

/**
 * Format large numbers for display
 * Pure function for formatting
 */
export const formatNumber = (value: string | number): string => {
  const num = new BigNumber(value);
  
  if (num.isGreaterThanOrEqualTo(1e9)) {
    return `${num.dividedBy(1e9).toFixed(2)}B`;
  } else if (num.isGreaterThanOrEqualTo(1e6)) {
    return `${num.dividedBy(1e6).toFixed(2)}M`;
  } else if (num.isGreaterThanOrEqualTo(1e3)) {
    return `${num.dividedBy(1e3).toFixed(2)}K`;
  }
  
  return num.toFixed(2);
};

/**
 * Validate DexScreener response
 * Pure function for validation
 */
export const isValidDexScreenerResponse = (
  response: unknown
): response is DexScreenerTokenResponse => {
  if (!response || typeof response !== 'object') return false;
  
  const res = response as any;
  return (
    Array.isArray(res.pairs) &&
    res.pairs.every((pair: any) => 
      pair.chainId &&
      pair.dexId &&
      pair.pairAddress &&
      pair.baseToken?.address &&
      pair.priceUsd
    )
  );
};