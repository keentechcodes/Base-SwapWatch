import {
  transformPairToMarketData,
  transformPairToTokenInfo,
  transformPairToDexInfo,
  selectBestPair,
  calculateUsdValue,
  formatNumber,
  isValidDexScreenerResponse
} from './transformers';
import { DexScreenerPair } from './types';

describe('DexScreener Transformers', () => {
  const mockPair: DexScreenerPair = {
    chainId: 'base',
    dexId: 'uniswap',
    url: 'https://dexscreener.com/base/0x123',
    pairAddress: '0x123456',
    baseToken: {
      address: '0xabc',
      name: 'Test Token',
      symbol: 'TEST'
    },
    quoteToken: {
      address: '0xdef',
      name: 'USD Coin',
      symbol: 'USDC'
    },
    priceNative: '0.5',
    priceUsd: '1.5',
    txns: {
      m5: { buys: 10, sells: 5 },
      h1: { buys: 100, sells: 50 },
      h6: { buys: 600, sells: 300 },
      h24: { buys: 2400, sells: 1200 }
    },
    volume: {
      m5: 1000,
      h1: 10000,
      h6: 60000,
      h24: 240000
    },
    priceChange: {
      m5: 1.5,
      h1: 2.5,
      h6: 5.0,
      h24: 10.0
    },
    liquidity: {
      usd: 1000000,
      base: 666666,
      quote: 1000000
    },
    fdv: 10000000,
    marketCap: 5000000,
    pairCreatedAt: Date.now() - 86400000
  };

  describe('transformPairToMarketData', () => {
    it('should transform pair to market data correctly', () => {
      const marketData = transformPairToMarketData(mockPair);
      
      expect(marketData.price).toBe('1.5');
      expect(marketData.priceChange24h).toBe(10.0);
      expect(marketData.volume24h).toBe('240000');
      expect(marketData.liquidity).toBe('1000000');
      expect(marketData.marketCap).toBe('5000000');
      expect(marketData.fdv).toBe('10000000');
      expect(marketData.holders).toBe(0);
      expect(marketData.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle missing liquidity data', () => {
      const pairWithoutLiquidity = { ...mockPair, liquidity: undefined };
      const marketData = transformPairToMarketData(pairWithoutLiquidity);
      
      expect(marketData.liquidity).toBe('0');
    });
  });

  describe('transformPairToTokenInfo', () => {
    it('should transform pair to token info correctly', () => {
      const tokenInfo = transformPairToTokenInfo(mockPair);
      
      expect(tokenInfo.address).toBe('0xabc');
      expect(tokenInfo.name).toBe('Test Token');
      expect(tokenInfo.symbol).toBe('TEST');
      expect(tokenInfo.decimals).toBe(18);
      expect(tokenInfo.totalSupply).toBe('0');
      expect(tokenInfo.logo).toBeUndefined();
    });

    it('should include social links if available', () => {
      const pairWithSocials = {
        ...mockPair,
        info: {
          imageUrl: 'https://example.com/logo.png',
          websites: [{ label: 'Website', url: 'https://example.com' }],
          socials: [
            { type: 'twitter', url: 'https://twitter.com/test' },
            { type: 'telegram', url: 'https://t.me/test' }
          ]
        }
      };
      
      const tokenInfo = transformPairToTokenInfo(pairWithSocials);
      
      expect(tokenInfo.logo).toBe('https://example.com/logo.png');
      expect(tokenInfo.website).toBe('https://example.com');
      expect(tokenInfo.social?.twitter).toBe('https://twitter.com/test');
      expect(tokenInfo.social?.telegram).toBe('https://t.me/test');
    });
  });

  describe('transformPairToDexInfo', () => {
    it('should transform pair to DEX info correctly', () => {
      const dexInfo = transformPairToDexInfo(mockPair);
      
      expect(dexInfo.dexName).toBe('uniswap');
      expect(dexInfo.routerAddress).toBe('0x123456');
      expect(dexInfo.pairAddress).toBe('0x123456');
      expect(dexInfo.poolUrl).toBe('https://dexscreener.com/base/0x123');
      expect(dexInfo.liquidity.usd).toBe('1000000');
      expect(dexInfo.fees.swapFee).toBe('0.003');
    });
  });

  describe('selectBestPair', () => {
    it('should select pair with highest score', () => {
      const pairs: DexScreenerPair[] = [
        { ...mockPair, liquidity: { usd: 100000, base: 0, quote: 0 } },
        { ...mockPair, liquidity: { usd: 500000, base: 0, quote: 0 } },
        { ...mockPair, liquidity: { usd: 200000, base: 0, quote: 0 } }
      ];
      
      const bestPair = selectBestPair(pairs);
      expect(bestPair?.liquidity?.usd).toBe(500000);
    });

    it('should return null for empty array', () => {
      const bestPair = selectBestPair([]);
      expect(bestPair).toBeNull();
    });
  });

  describe('calculateUsdValue', () => {
    it('should calculate USD value correctly', () => {
      const value = calculateUsdValue('1000000000000000000', '1.5', 18);
      expect(value).toBe('1.50');
    });

    it('should handle different decimals', () => {
      const value = calculateUsdValue('1000000', '2.0', 6);
      expect(value).toBe('2.00');
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateUsdValue('', '1.5', 18)).toBe('0');
      expect(calculateUsdValue('1000', '', 18)).toBe('0');
    });
  });

  describe('formatNumber', () => {
    it('should format billions', () => {
      expect(formatNumber(1500000000)).toBe('1.50B');
    });

    it('should format millions', () => {
      expect(formatNumber(2500000)).toBe('2.50M');
    });

    it('should format thousands', () => {
      expect(formatNumber(3500)).toBe('3.50K');
    });

    it('should format small numbers', () => {
      expect(formatNumber(42.5)).toBe('42.50');
    });
  });

  describe('isValidDexScreenerResponse', () => {
    it('should validate correct response', () => {
      const validResponse = {
        schemaVersion: '1.0',
        pairs: [mockPair]
      };
      
      expect(isValidDexScreenerResponse(validResponse)).toBe(true);
    });

    it('should reject invalid responses', () => {
      expect(isValidDexScreenerResponse(null)).toBe(false);
      expect(isValidDexScreenerResponse({})).toBe(false);
      expect(isValidDexScreenerResponse({ pairs: null })).toBe(false);
      expect(isValidDexScreenerResponse({ pairs: [{ invalid: true }] })).toBe(false);
    });
  });
});