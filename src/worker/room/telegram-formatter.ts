/**
 * Pure functions for formatting Telegram notifications
 * Following functional programming paradigm - no side effects
 */

import type { SwapEvent } from '../types';
import { WALLET_DISPLAY } from '../types';

/**
 * Format swap event as Telegram message with Markdown
 */
export const formatSwapMessage = (swapEvent: SwapEvent): string => {
  const {
    txHash,
    walletAddress,
    tokenIn,
    tokenOut,
    amountInUsd,
    amountOutUsd
  } = swapEvent;

  const walletShort = `${walletAddress.slice(0, WALLET_DISPLAY.PREFIX_LENGTH)}...${walletAddress.slice(-WALLET_DISPLAY.SUFFIX_LENGTH)}`;
  const amountFormatted = formatUsdValue(amountInUsd);
  const amountOutFormatted = amountOutUsd ? formatUsdValue(amountOutUsd) : null;

  const parts = [
    '🔄 *New Swap Detected*',
    '',
    `💰 Amount: ${amountFormatted}`,
    `📍 Wallet: \`${walletShort}\``,
  ];

  if (tokenIn && tokenOut) {
    parts.push(`🔁 ${tokenIn} → ${tokenOut}`);
  }

  if (amountOutFormatted) {
    parts.push(`💵 Received: ${amountOutFormatted}`);
  }

  parts.push(`🔗 [View Transaction](https://basescan.org/tx/${txHash})`);

  return parts.join('\n');
};

/**
 * Format USD value with proper notation
 */
const formatUsdValue = (value: number): string => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/**
 * Create Telegram API request payload
 */
export const createTelegramPayload = (
  message: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Record<string, unknown> => {
  return {
    text: message,
    parse_mode: parseMode,
    disable_web_page_preview: false
  };
};

/**
 * Check if swap meets notification threshold
 */
export const meetsThreshold = (
  amountUsd: number,
  threshold: number | undefined
): boolean => {
  if (threshold === undefined) {
    return true; // No threshold means notify all
  }

  return amountUsd >= threshold;
};
