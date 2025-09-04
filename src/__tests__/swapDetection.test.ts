import { identifySwapEvent, extractSwapData, isKnownDexRouter } from '../utils/swapDetector';
import { WebhookEvent } from '../types/webhook';

describe('Swap Detection', () => {
  describe('isKnownDexRouter', () => {
    it('should identify Uniswap V3 router on Base', () => {
      expect(isKnownDexRouter('0x2626664c2603336E57B271c5C0b26F421741e481')).toBe(true);
    });

    it('should identify BaseSwap router', () => {
      expect(isKnownDexRouter('0x327Df1E6de05895d2ab08513aaDD9313Fe505d86')).toBe(true);
    });

    it('should identify Aerodrome router', () => {
      expect(isKnownDexRouter('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43')).toBe(true);
    });

    it('should return false for unknown addresses', () => {
      expect(isKnownDexRouter('0x1234567890123456789012345678901234567890')).toBe(false);
    });

    it('should handle case insensitive addresses', () => {
      expect(isKnownDexRouter('0x2626664C2603336E57B271C5C0B26F421741E481')).toBe(true);
      expect(isKnownDexRouter('0x2626664c2603336e57b271c5c0b26f421741e481')).toBe(true);
    });
  });

  describe('identifySwapEvent', () => {
    it('should identify swap from smart_contract_event with known DEX', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'smart_contract_event',
        network: 'base-mainnet',
        from: '0xuser',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481',
        contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
        methodName: 'swap'
      };

      expect(identifySwapEvent(event)).toBe(true);
    });

    it('should identify swap from method names', () => {
      const swapMethods = ['swap', 'swapExactTokensForTokens', 'swapETHForExactTokens'];
      
      swapMethods.forEach(method => {
        const event: WebhookEvent = {
          webhookId: 'test',
          eventType: 'smart_contract_event',
          network: 'base-mainnet',
          methodName: method
        };
        expect(identifySwapEvent(event)).toBe(true);
      });
    });

    it('should not identify non-swap events', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'erc20_transfer',
        network: 'base-mainnet',
        from: '0xuser',
        to: '0xrecipient'
      };

      expect(identifySwapEvent(event)).toBe(false);
    });

    it('should handle events without method names', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'transaction',
        network: 'base-mainnet'
      };

      expect(identifySwapEvent(event)).toBe(false);
    });
  });

  describe('extractSwapData', () => {
    it('should extract swap data from event with logs', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'smart_contract_event',
        network: 'base-mainnet',
        from: '0xuser',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481',
        contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
        methodName: 'swap',
        transactionHash: '0xabc123',
        value: '1000000000000000000',
        logs: [
          {
            address: '0xtoken1',
            topics: ['0xddf252ad'],
            data: '0x00000000000000000000000000000000000000000000000000000000000003e8'
          }
        ]
      };

      const swapData = extractSwapData(event);

      expect(swapData).toBeDefined();
      expect(swapData?.dexName).toBe('Uniswap V3');
      expect(swapData?.from).toBe('0xuser');
      expect(swapData?.to).toBe('0x2626664c2603336E57B271c5C0b26F421741e481');
      expect(swapData?.transactionHash).toBe('0xabc123');
      expect(swapData?.value).toBe('1000000000000000000');
    });

    it('should extract swap data with token information', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'smart_contract_event',
        network: 'base-mainnet',
        from: '0xuser',
        to: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        contractAddress: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        methodName: 'swapExactTokensForTokens',
        data: {
          tokenIn: '0x4200000000000000000000000000000000000006',
          tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amountIn: '1000000000000000000',
          amountOut: '2500000000'
        }
      };

      const swapData = extractSwapData(event);

      expect(swapData).toBeDefined();
      expect(swapData?.dexName).toBe('Aerodrome');
      expect(swapData?.tokenIn).toBe('0x4200000000000000000000000000000000000006');
      expect(swapData?.tokenOut).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(swapData?.amountIn).toBe('1000000000000000000');
      expect(swapData?.amountOut).toBe('2500000000');
    });

    it('should return undefined for non-swap events', () => {
      const event: WebhookEvent = {
        webhookId: 'test',
        eventType: 'erc20_transfer',
        network: 'base-mainnet'
      };

      expect(extractSwapData(event)).toBeUndefined();
    });
  });
});