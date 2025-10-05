/**
 * Telegram notification formatting as pure functions
 */

import type { SwapEvent } from '../types';

/**
 * Format swap event for Telegram message
 */
export const formatTelegramMessage = (swapEvent: SwapEvent): string => {
  const { txHash, walletAddress, tokenIn, tokenOut, amountInUsd, amountOutUsd } = swapEvent;

  const lines = [
    '🔄 *New Swap Detected*',
    '',
    `💰 Amount: $${amountInUsd.toLocaleString()}`,
    `📍 Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
  ];

  if (tokenIn && tokenOut) {
    lines.push(`🔁 ${tokenIn} → ${tokenOut}`);
  }

  if (amountOutUsd) {
    lines.push(`💵 Received: $${amountOutUsd.toLocaleString()}`);
  }

  lines.push(`🔗 [View Transaction](https://basescan.org/tx/${txHash})`);

  return lines.join('\n');
};

/**
 * Send Telegram notification
 */
export const sendTelegramNotification = async (
  webhookUrl: string,
  message: string
): Promise<boolean> => {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Telegram notification error:', error);
    return false;
  }
};

/**
 * Check if swap meets notification threshold
 */
export const shouldNotify = (amountUsd: number, threshold?: number): boolean => {
  if (threshold === undefined) return false;
  return amountUsd >= threshold;
};
