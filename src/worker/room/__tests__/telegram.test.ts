/**
 * Tests for Telegram notification functions
 */

import { formatTelegramMessage, shouldNotify } from '../telegram';
import type { SwapEvent } from '../../types';

describe('Telegram Functions', () => {
  describe('formatTelegramMessage', () => {
    it('should format swap event with all fields', () => {
      const swapEvent: SwapEvent = {
        txHash: '0xabc123',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountInUsd: 1000,
        amountOutUsd: 995,
      };

      const message = formatTelegramMessage(swapEvent);

      expect(message).toContain('New Swap Detected');
      expect(message).toContain('$1,000');
      expect(message).toContain('0x742d');
      expect(message).toContain('USDC → ETH');
      expect(message).toContain('$995');
      expect(message).toContain('basescan.org/tx/0xabc123');
    });

    it('should format swap event without token symbols', () => {
      const swapEvent: SwapEvent = {
        txHash: '0xdef456',
        walletAddress: '0x123abc',
        amountInUsd: 500,
      };

      const message = formatTelegramMessage(swapEvent);

      expect(message).toContain('$500');
      expect(message).not.toContain('→');
    });
  });

  describe('shouldNotify', () => {
    it('should return true when amount meets threshold', () => {
      expect(shouldNotify(1000, 500)).toBe(true);
    });

    it('should return true when amount equals threshold', () => {
      expect(shouldNotify(1000, 1000)).toBe(true);
    });

    it('should return false when amount below threshold', () => {
      expect(shouldNotify(500, 1000)).toBe(false);
    });

    it('should return false when no threshold set', () => {
      expect(shouldNotify(1000, undefined)).toBe(false);
    });
  });
});
