/**
 * Pure calculation functions for USD values and swap metrics
 * Following functional programming paradigm - no side effects
 */

import { Result, success, failure } from '../types';
import BigNumber from 'bignumber.js';

// Configure BigNumber for precision
BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: [-18, 20]
});

/**
 * Token amount with decimals
 */
export interface TokenAmount {
  raw: string;       // Raw amount in smallest unit
  decimals: number;  // Token decimals
  formatted?: string; // Human-readable format
}

/**
 * Price data
 */
export interface PriceData {
  usd: string;
  eth?: string;
  btc?: string;
  timestamp: Date;
}

/**
 * Swap calculation result
 */
export interface SwapCalculation {
  amountInUsd: string;
  amountOutUsd: string;
  pricePerTokenIn: string;
  pricePerTokenOut: string;
  effectivePrice: string;
  slippage: number;
  priceImpact: number;
  fee?: string;
}

/**
 * Liquidity metrics
 */
export interface LiquidityMetrics {
  totalLiquidityUsd: string;
  token0LiquidityUsd: string;
  token1LiquidityUsd: string;
  utilizationRate: number;
  depthRatio: number;
}

/**
 * Convert raw token amount to human-readable format
 */
export const formatTokenAmount = (
  amount: string | number,
  decimals: number,
  displayDecimals: number = 6
): string => {
  try {
    const raw = new BigNumber(amount);
    const divisor = new BigNumber(10).pow(decimals);
    const formatted = raw.dividedBy(divisor);
    
    // Handle very small or very large numbers
    if (formatted.isLessThan(0.000001) && !formatted.isZero()) {
      return formatted.toExponential(displayDecimals);
    }
    
    if (formatted.isGreaterThan(1e9)) {
      return `${formatted.dividedBy(1e9).toFixed(2)}B`;
    }
    
    if (formatted.isGreaterThan(1e6)) {
      return `${formatted.dividedBy(1e6).toFixed(2)}M`;
    }
    
    if (formatted.isGreaterThan(1e3)) {
      return `${formatted.dividedBy(1e3).toFixed(2)}K`;
    }
    
    return formatted.toFixed(displayDecimals);
  } catch (error) {
    return '0';
  }
};

/**
 * Parse token amount to BigNumber
 */
export const parseTokenAmount = (
  amount: string | number,
  decimals: number
): Result<BigNumber> => {
  try {
    const raw = new BigNumber(amount);
    
    if (raw.isNaN() || !raw.isFinite()) {
      return failure(new Error('Invalid amount'));
    }
    
    const divisor = new BigNumber(10).pow(decimals);
    const parsed = raw.dividedBy(divisor);
    
    return success(parsed);
  } catch (error) {
    return failure(new Error(`Failed to parse amount: ${(error as Error).message}`));
  }
};

/**
 * Calculate USD value for a token amount
 */
export const calculateUsdValue = (
  amount: string | number,
  price: string | number,
  decimals: number
): Result<string> => {
  try {
    const amountResult = parseTokenAmount(amount, decimals);
    
    if (!amountResult.success) {
      return failure(amountResult.error);
    }
    
    const priceNum = new BigNumber(price);
    
    if (priceNum.isNaN() || !priceNum.isFinite() || priceNum.isNegative()) {
      return failure(new Error('Invalid price'));
    }
    
    const usdValue = amountResult.data.multipliedBy(priceNum);
    
    return success(usdValue.toFixed(2));
  } catch (error) {
    return failure(new Error(`USD calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Calculate swap metrics
 */
export const calculateSwapMetrics = (
  amountIn: string,
  amountOut: string,
  tokenInPrice: string,
  tokenOutPrice: string,
  decimalsIn: number,
  decimalsOut: number
): Result<SwapCalculation> => {
  try {
    // Parse amounts
    const amountInParsed = parseTokenAmount(amountIn, decimalsIn);
    const amountOutParsed = parseTokenAmount(amountOut, decimalsOut);
    
    if (!amountInParsed.success || !amountOutParsed.success) {
      return failure(new Error('Invalid amounts'));
    }
    
    // Calculate USD values
    const amountInUsd = amountInParsed.data.multipliedBy(tokenInPrice);
    const amountOutUsd = amountOutParsed.data.multipliedBy(tokenOutPrice);
    
    // Calculate effective price (how many tokenOut per tokenIn)
    const effectivePrice = amountOutParsed.data.dividedBy(amountInParsed.data);
    
    // Calculate slippage (difference between expected and actual value)
    const expectedValue = amountInUsd;
    const actualValue = amountOutUsd;
    const slippageAmount = expectedValue.minus(actualValue);
    const slippage = expectedValue.isZero() 
      ? 0 
      : slippageAmount.dividedBy(expectedValue).multipliedBy(100).toNumber();
    
    // Estimate price impact (simplified - actual calculation requires liquidity depth)
    const volumeUsd = amountInUsd;
    const estimatedLiquidity = new BigNumber(tokenInPrice).multipliedBy(1000000); // Assume $1M liquidity
    const priceImpact = volumeUsd.dividedBy(estimatedLiquidity).multipliedBy(100).toNumber();
    
    // Estimate fee (assuming 0.3% for most DEXs)
    const feeRate = 0.003;
    const fee = amountInUsd.multipliedBy(feeRate);
    
    return success({
      amountInUsd: amountInUsd.toFixed(2),
      amountOutUsd: amountOutUsd.toFixed(2),
      pricePerTokenIn: tokenInPrice,
      pricePerTokenOut: tokenOutPrice,
      effectivePrice: effectivePrice.toFixed(6),
      slippage: parseFloat(slippage.toFixed(4)),
      priceImpact: parseFloat(priceImpact.toFixed(4)),
      fee: fee.toFixed(2)
    });
  } catch (error) {
    return failure(new Error(`Swap metrics calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Calculate percentage change
 */
export const calculatePercentageChange = (
  oldValue: string | number,
  newValue: string | number
): number => {
  try {
    const oldNum = new BigNumber(oldValue);
    const newNum = new BigNumber(newValue);
    
    if (oldNum.isZero()) {
      return newNum.isZero() ? 0 : 100;
    }
    
    const change = newNum.minus(oldNum).dividedBy(oldNum).multipliedBy(100);
    
    return change.toNumber();
  } catch {
    return 0;
  }
};

/**
 * Calculate weighted average price
 */
export const calculateWeightedAveragePrice = (
  prices: Array<{ price: string; volume: string }>
): Result<string> => {
  try {
    if (prices.length === 0) {
      return failure(new Error('No prices provided'));
    }
    
    let totalWeightedPrice = new BigNumber(0);
    let totalVolume = new BigNumber(0);
    
    for (const { price, volume } of prices) {
      const priceNum = new BigNumber(price);
      const volumeNum = new BigNumber(volume);
      
      if (priceNum.isNaN() || volumeNum.isNaN()) {
        continue;
      }
      
      totalWeightedPrice = totalWeightedPrice.plus(priceNum.multipliedBy(volumeNum));
      totalVolume = totalVolume.plus(volumeNum);
    }
    
    if (totalVolume.isZero()) {
      return failure(new Error('Total volume is zero'));
    }
    
    const weightedAverage = totalWeightedPrice.dividedBy(totalVolume);
    
    return success(weightedAverage.toFixed(6));
  } catch (error) {
    return failure(new Error(`Weighted average calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Calculate liquidity metrics for a pool
 */
export const calculateLiquidityMetrics = (
  token0Reserve: string,
  token1Reserve: string,
  token0Price: string,
  token1Price: string,
  volumeUsd24h: string
): Result<LiquidityMetrics> => {
  try {
    const reserve0 = new BigNumber(token0Reserve);
    const reserve1 = new BigNumber(token1Reserve);
    const price0 = new BigNumber(token0Price);
    const price1 = new BigNumber(token1Price);
    const volume = new BigNumber(volumeUsd24h);
    
    // Calculate USD values
    const token0LiquidityUsd = reserve0.multipliedBy(price0);
    const token1LiquidityUsd = reserve1.multipliedBy(price1);
    const totalLiquidityUsd = token0LiquidityUsd.plus(token1LiquidityUsd);
    
    // Calculate utilization rate (24h volume / liquidity)
    const utilizationRate = totalLiquidityUsd.isZero() 
      ? 0 
      : volume.dividedBy(totalLiquidityUsd).toNumber();
    
    // Calculate depth ratio (measure of balance)
    const depthRatio = token0LiquidityUsd.isZero() 
      ? 0 
      : token1LiquidityUsd.dividedBy(token0LiquidityUsd).toNumber();
    
    return success({
      totalLiquidityUsd: totalLiquidityUsd.toFixed(2),
      token0LiquidityUsd: token0LiquidityUsd.toFixed(2),
      token1LiquidityUsd: token1LiquidityUsd.toFixed(2),
      utilizationRate: parseFloat(utilizationRate.toFixed(4)),
      depthRatio: parseFloat(depthRatio.toFixed(4))
    });
  } catch (error) {
    return failure(new Error(`Liquidity metrics calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Estimate gas cost in USD
 */
export const estimateGasCostUsd = (
  gasUsed: string | number,
  gasPrice: string | number, // in gwei
  ethPrice: string | number
): Result<string> => {
  try {
    const gas = new BigNumber(gasUsed);
    const priceGwei = new BigNumber(gasPrice);
    const ethUsd = new BigNumber(ethPrice);
    
    // Convert gwei to ETH (1 gwei = 10^-9 ETH)
    const priceEth = priceGwei.dividedBy(1e9);
    
    // Calculate total ETH cost
    const ethCost = gas.multipliedBy(priceEth);
    
    // Convert to USD
    const usdCost = ethCost.multipliedBy(ethUsd);
    
    return success(usdCost.toFixed(2));
  } catch (error) {
    return failure(new Error(`Gas cost calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Calculate ROI (Return on Investment)
 */
export const calculateROI = (
  initialValue: string | number,
  currentValue: string | number
): Result<number> => {
  try {
    const initial = new BigNumber(initialValue);
    const current = new BigNumber(currentValue);
    
    if (initial.isZero()) {
      return failure(new Error('Initial value cannot be zero'));
    }
    
    const roi = current.minus(initial).dividedBy(initial).multipliedBy(100);
    
    return success(roi.toNumber());
  } catch (error) {
    return failure(new Error(`ROI calculation failed: ${(error as Error).message}`));
  }
};

/**
 * Format USD value with proper notation
 */
export const formatUsdValue = (
  value: string | number,
  includeSign: boolean = false
): string => {
  try {
    const num = new BigNumber(value);
    
    if (num.isNaN() || !num.isFinite()) {
      return '$0.00';
    }
    
    const sign = includeSign && num.isPositive() && !num.isZero() ? '+' : '';
    const absValue = num.abs();
    
    let formatted: string;
    
    if (absValue.isGreaterThanOrEqualTo(1e9)) {
      formatted = `${absValue.dividedBy(1e9).toFixed(2)}B`;
    } else if (absValue.isGreaterThanOrEqualTo(1e6)) {
      formatted = `${absValue.dividedBy(1e6).toFixed(2)}M`;
    } else if (absValue.isGreaterThanOrEqualTo(1e3)) {
      formatted = `${absValue.dividedBy(1e3).toFixed(2)}K`;
    } else if (absValue.isLessThan(0.01) && !absValue.isZero()) {
      formatted = absValue.toFixed(4);
    } else {
      formatted = absValue.toFixed(2);
    }
    
    return `${sign}$${formatted}`;
  } catch {
    return '$0.00';
  }
};

/**
 * Validate price data freshness
 */
export const isPriceFresh = (
  timestamp: Date | string,
  maxAgeSeconds: number = 300 // 5 minutes default
): boolean => {
  try {
    const priceTime = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const ageSeconds = (now.getTime() - priceTime.getTime()) / 1000;
    
    return ageSeconds <= maxAgeSeconds;
  } catch {
    return false;
  }
};

/**
 * Calculate average from array of values
 */
export const calculateAverage = (
  values: Array<string | number>
): Result<string> => {
  try {
    if (values.length === 0) {
      return failure(new Error('No values provided'));
    }
    
    const sum = values.reduce((acc, val) => {
      return acc.plus(new BigNumber(val));
    }, new BigNumber(0));
    
    const average = sum.dividedBy(values.length);
    
    return success(average.toFixed(6));
  } catch (error) {
    return failure(new Error(`Average calculation failed: ${(error as Error).message}`));
  }
};