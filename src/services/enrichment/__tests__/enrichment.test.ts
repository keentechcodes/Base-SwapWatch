/**
 * End-to-end tests for enrichment orchestration
 * Tests complete flow from webhook event to enriched output
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WebhookEvent } from '../../../types/webhook';
import { SwapData } from '../../../utils/swapDetector';
import { createSwapEnricher, EnrichedSwapEvent } from '../SwapEnricher';
import { createWebhookProcessor } from '../webhookProcessor';
import { bootstrap, createTestBootstrap } from '../bootstrap';
import { createHealthCheck } from '../healthCheck';
import { 
  calculateUsdValue, 
  calculateSwapMetrics,
  formatTokenAmount,
  formatUsdValue 
} from '../calculations';
import {
  EnrichmentStrategy,
  determineStrategy,
  calculateDataQuality,
  mergeEnrichmentData
} from '../strategies';

// Mock dependencies
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  flush: jest.fn(),
  setLevel: jest.fn(),
  getBufferedLogs: jest.fn(() => [])
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  flush: jest.fn(),
  getStats: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn()
};

const mockRateLimiter = {
  execute: jest.fn((fn) => fn()),
  getStats: jest.fn(() => ({ currentTokens: 5, maxTokens: 10 }))
};

// Mock services
const mockDexScreener = {
  getTokenData: jest.fn(),
  getTokenInfo: jest.fn(),
  getDexInfo: jest.fn()
};

const mockBaseScan = {
  getContractVerification: jest.fn(),
  getContractAbi: jest.fn()
};

const mockTokenMetadata = {
  getTokenMetadata: jest.fn()
};

const mockMoralisPnL = {
  getWalletPnLSummary: jest.fn()
};

describe('Enrichment Orchestration Tests', () => {
  let enricher: any;
  let processor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockCache.get.mockResolvedValue({ success: false, data: null });
    mockCache.set.mockResolvedValue({ success: true });
    mockCache.getStats.mockResolvedValue({
      success: true,
      data: { hitRate: 0.75, hits: 100, misses: 33 }
    });
    
    mockDexScreener.getTokenData.mockResolvedValue({
      success: true,
      data: {
        price: '1.00',
        marketCap: '1000000',
        volume24h: '500000',
        liquidity: '2000000',
        priceChange24h: 2.5
      }
    });
    
    mockBaseScan.getContractVerification.mockResolvedValue({
      success: true,
      data: { isVerified: true }
    });
    
    mockTokenMetadata.getTokenMetadata.mockResolvedValue({
      success: true,
      data: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        logo: 'https://example.com/usdc.png'
      }
    });
    
    mockMoralisPnL.getWalletPnLSummary.mockResolvedValue({
      success: true,
      data: {
        totalRealizedProfitUsd: 5000,
        totalRealizedProfitPercentage: 25,
        totalBuys: 100,
        totalSells: 80,
        winRate: 65
      }
    });
    
    // Create enricher
    enricher = createSwapEnricher(
      {
        cache: mockCache,
        logger: mockLogger,
        rateLimiter: mockRateLimiter,
        dexScreener: mockDexScreener,
        baseScan: mockBaseScan,
        tokenMetadata: mockTokenMetadata,
        moralisPnL: mockMoralisPnL
      },
      {
        enablePnL: true,
        enableVerification: true,
        parallelFetch: true
      }
    );
    
    // Create processor
    processor = createWebhookProcessor(enricher, mockLogger, {
      enableEnrichment: true,
      enrichmentTimeout: 1000
    });
  });

  describe('SwapEnricher', () => {
    it('should enrich swap event with full data', async () => {
      const webhookEvent: WebhookEvent = {
        webhookId: 'test-webhook-1',
        eventType: 'smart_contract_event',
        network: 'base',
        transactionHash: '0xabc123',
        from: '0x1234567890123456789012345678901234567890',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3
        contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481'
      };
      
      const swapData: SwapData = {
        dexName: 'Uniswap V3',
        from: '0x1234567890123456789012345678901234567890',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481',
        transactionHash: '0xabc123',
        tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        tokenOut: '0x4200000000000000000000000000000000000006', // WETH
        amountIn: '1000000000', // 1000 USDC (6 decimals)
        amountOut: '500000000000000000' // 0.5 WETH (18 decimals)
      };
      
      const result = await enricher.enrichSwapEvent(webhookEvent, swapData);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      const enriched = result.data as EnrichedSwapEvent;
      
      // Check basic swap data
      expect(enriched.dexName).toBe('Uniswap V3');
      expect(enriched.transactionHash).toBe('0xabc123');
      
      // Check token data
      expect(enriched.tokenInData).toBeDefined();
      expect(enriched.tokenInData?.symbol).toBe('USDC');
      expect(enriched.tokenInData?.decimals).toBe(6);
      expect(enriched.tokenInData?.price).toBe('1.00');
      
      expect(enriched.tokenOutData).toBeDefined();
      expect(enriched.tokenOutData?.symbol).toBe('USDC'); // Mock returns same data
      
      // Check USD values
      expect(enriched.usdValues).toBeDefined();
      expect(enriched.usdValues?.amountInUsd).toBeDefined();
      expect(enriched.usdValues?.amountOutUsd).toBeDefined();
      
      // Check wallet data
      expect(enriched.walletData).toBeDefined();
      expect(enriched.walletData?.totalProfit).toBe(5000);
      expect(enriched.walletData?.winRate).toBe(65);
      
      // Check metrics
      expect(enriched.enrichmentMetrics).toBeDefined();
      expect(enriched.enrichmentMetrics?.latency).toBeGreaterThan(0);
    });

    it('should handle cache hits efficiently', async () => {
      // Pre-populate cache
      mockCache.get.mockResolvedValueOnce({
        success: true,
        data: {
          name: 'Cached Token',
          symbol: 'CACHED',
          decimals: 18,
          price: '100.00',
          fromCache: true
        }
      });
      
      const result = await enricher.enrichTokenData('0x123');
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data.fromCache).toBe(true);
      expect(result.data.symbol).toBe('CACHED');
      
      // Should not call APIs when cache hit
      expect(mockDexScreener.getTokenData).not.toHaveBeenCalled();
      expect(mockTokenMetadata.getTokenMetadata).not.toHaveBeenCalled();
    });

    it('should handle API failures gracefully', async () => {
      // Make all APIs fail
      mockDexScreener.getTokenData.mockResolvedValue({
        success: false,
        error: new Error('API down')
      });
      
      mockBaseScan.getContractVerification.mockResolvedValue({
        success: false,
        error: new Error('API down')
      });
      
      const webhookEvent: WebhookEvent = {
        webhookId: 'test-webhook-2',
        eventType: 'smart_contract_event',
        network: 'base',
        from: '0x123',
        to: '0x456'
      };
      
      const swapData: SwapData = {
        dexName: 'Unknown DEX',
        from: '0x123',
        to: '0x456',
        tokenIn: '0xabc',
        tokenOut: '0xdef'
      };
      
      const result = await enricher.enrichSwapEvent(webhookEvent, swapData);
      
      // Should still succeed with partial data
      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.enrichmentMetrics?.fallbacksUsed.length).toBeGreaterThan(0);
      }
    });
  });

  describe('WebhookProcessor', () => {
    it('should process swap event end-to-end', async () => {
      const webhookEvent: WebhookEvent = {
        webhookId: 'test-webhook-3',
        eventType: 'smart_contract_event',
        network: 'base',
        transactionHash: '0xdef456',
        from: '0xaaa',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481',
        contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
        methodName: 'swapExactTokensForTokens'
      };
      
      const result = await processor.processEvent(webhookEvent);
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data.isSwap).toBe(true);
      expect(result.data.processingTime).toBeGreaterThan(0);
    });

    it('should handle non-swap events', async () => {
      const webhookEvent: WebhookEvent = {
        webhookId: 'test-webhook-4',
        eventType: 'erc20_transfer',
        network: 'base',
        from: '0x111',
        to: '0x222',
        value: '1000000'
      };
      
      const result = await processor.processEvent(webhookEvent);
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data.isSwap).toBe(false);
      expect(result.data.enriched).toBeUndefined();
    });

    it('should respect enrichment timeout', async () => {
      // Make enrichment slow
      mockDexScreener.getTokenData.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: { price: '1.00' }
        }), 2000))
      );
      
      const fastProcessor = createWebhookProcessor(enricher, mockLogger, {
        enableEnrichment: true,
        enrichmentTimeout: 100 // Very short timeout
      });
      
      const webhookEvent: WebhookEvent = {
        webhookId: 'test-webhook-5',
        eventType: 'smart_contract_event',
        network: 'base',
        to: '0x2626664c2603336E57B271c5C0b26F421741e481',
        methodName: 'swap'
      };
      
      const result = await fastProcessor.processEvent(webhookEvent);
      
      // Should timeout but still return success with raw data
      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.errors).toBeDefined();
      }
    });
  });

  describe('Calculation Functions', () => {
    it('should calculate USD values correctly', () => {
      const result = calculateUsdValue('1000000000', '1.00', 6); // 1000 USDC
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data).toBe('1000.00');
    });

    it('should format token amounts correctly', () => {
      expect(formatTokenAmount('1000000', 6)).toBe('1.000000'); // 1 USDC
      expect(formatTokenAmount('1000000000000000000', 18)).toBe('1.000000'); // 1 ETH
      expect(formatTokenAmount('5000000000', 6)).toBe('5.00K'); // 5000 USDC
      expect(formatTokenAmount('1000000000000', 6)).toBe('1.00M'); // 1M USDC
    });

    it('should calculate swap metrics', () => {
      const result = calculateSwapMetrics(
        '1000000000', // 1000 USDC in
        '500000000000000000', // 0.5 ETH out
        '1.00', // USDC price
        '2000.00', // ETH price
        6, // USDC decimals
        18 // ETH decimals
      );
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data.amountInUsd).toBe('1000.00');
      expect(result.data.amountOutUsd).toBe('1000.00');
      expect(result.data.slippage).toBe(0);
    });

    it('should format USD values with notation', () => {
      expect(formatUsdValue('1234.56')).toBe('$1.23K');
      expect(formatUsdValue('1234567')).toBe('$1.23M');
      expect(formatUsdValue('1234567890')).toBe('$1.23B');
      expect(formatUsdValue('0.001')).toBe('$0.0010');
      expect(formatUsdValue('-500', true)).toBe('$500.00');
      expect(formatUsdValue('500', true)).toBe('+$500.00');
    });
  });

  describe('Strategy Functions', () => {
    it('should determine correct enrichment strategy', () => {
      // Real-time with cache
      let strategy = determineStrategy(true, true, 50, { api1: true });
      expect(strategy).toBe(EnrichmentStrategy.FAST);
      
      // Plenty of time and healthy APIs
      strategy = determineStrategy(false, false, 500, { api1: true, api2: true });
      expect(strategy).toBe(EnrichmentStrategy.FULL);
      
      // Limited time
      strategy = determineStrategy(false, false, 200, { api1: true });
      expect(strategy).toBe(EnrichmentStrategy.ESSENTIAL);
      
      // Very limited time or unhealthy APIs
      strategy = determineStrategy(false, false, 50, { api1: false });
      expect(strategy).toBe(EnrichmentStrategy.MINIMAL);
    });

    it('should calculate data quality correctly', () => {
      const data = {
        info: { name: 'Test', symbol: 'TEST', decimals: 18, totalSupply: '1000000' },
        market: { 
          price: '1.00', 
          marketCap: '1000000',
          volume24h: '100000',
          liquidity: '500000',
          priceChange24h: 5,
          lastUpdated: new Date()
        },
        verification: { isVerified: true }
      };
      
      const quality = calculateDataQuality(
        data,
        EnrichmentStrategy.ESSENTIAL,
        ['dexscreener', 'cache'],
        30 // 30 seconds old
      );
      
      expect(quality.isComplete).toBe(true);
      expect(quality.isFresh).toBe(true);
      expect(quality.isVerified).toBe(true);
      expect(quality.confidence).toBeGreaterThan(50);
    });

    it('should merge enrichment data correctly', () => {
      const sources = [
        {
          source: 'cache',
          data: { info: { name: 'Cached', symbol: 'OLD' } },
          timestamp: new Date(Date.now() - 1000),
          priority: 2
        },
        {
          source: 'api',
          data: { 
            info: { symbol: 'NEW', decimals: 18 },
            market: { price: '1.00' }
          },
          timestamp: new Date(),
          priority: 1
        }
      ];
      
      const merged = mergeEnrichmentData(sources);
      
      expect(merged.info?.name).toBe('Cached'); // From cache
      expect(merged.info?.symbol).toBe('NEW'); // Overridden by higher priority
      expect(merged.info?.decimals).toBe(18); // From API
      expect(merged.market?.price).toBe('1.00'); // From API
      expect(merged.dataQuality.sources).toContain('cache');
      expect(merged.dataQuality.sources).toContain('api');
    });
  });

  describe('Health Check', () => {
    it('should perform comprehensive health check', async () => {
      const healthCheck = createHealthCheck(
        {
          cache: mockCache,
          rateLimiter: mockRateLimiter,
          services: {
            dexScreener: mockDexScreener,
            baseScan: mockBaseScan
          },
          startTime: Date.now() - 60000, // 1 minute ago
          enrichmentMetrics: () => ({
            totalEnrichments: 100,
            apiCallCount: 50,
            errorCount: 2
          })
        },
        { includeMetrics: true }
      );
      
      const result = await healthCheck();
      
      expect(result.success).toBe(true);
      if (!result.data) {
        throw new Error('Result data is undefined');
      }
      expect(result.data.status).toBeDefined();
      expect(result.data.services.length).toBeGreaterThan(0);
      expect(result.data.metrics).toBeDefined();
      expect(result.data.metrics?.uptime).toBeGreaterThan(0);
      expect(result.data.checks.redis).toBeDefined();
      expect(result.data.checks.apis).toBeDefined();
    });
  });

  describe('Bootstrap Integration', () => {
    it('should bootstrap test environment successfully', async () => {
      // Mock Redis connection
      const mockRedisClient = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        isReady: true
      };
      
      jest.mock('redis', () => ({
        createClient: jest.fn(() => mockRedisClient)
      }));
      
      const result = await createTestBootstrap({
        apis: {
          enableMoralis: false
        }
      });
      
      if (result.success && result.data) {
        expect(result.data.infrastructure).toBeDefined();
        expect(result.data.services).toBeDefined();
        expect(result.data.healthCheck).toBeDefined();
        expect(result.data.shutdown).toBeDefined();
        
        // Clean up
        await result.data.shutdown();
      }
    });
  });
});

describe('Real Event Tests', () => {
  it('should handle real Uniswap swap event', async () => {
    const realSwapEvent: WebhookEvent = {
      webhookId: 'wh_01234567890',
      eventType: 'smart_contract_event',
      network: 'base',
      blockNumber: '12345678',
      blockTime: '2024-01-01T12:00:00Z',
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      transactionIndex: '5',
      logIndex: '10',
      contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
      from: '0xA85dc25e248B7C27c5Db9cb86950f06e543a7Fce',
      to: '0x2626664c2603336E57B271c5C0b26F421741e481',
      methodName: 'swapExactTokensForTokens',
      data: {
        tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        tokenOut: '0x4200000000000000000000000000000000000006', // WETH
        amountIn: '5000000000', // 5000 USDC
        amountOut: '2500000000000000000' // 2.5 ETH
      }
    };
    
    const processor = createWebhookProcessor(enricher, mockLogger);
    const result = await processor.processEvent(realSwapEvent);
    
    expect(result.success).toBe(true);
    if (!result.data) {
      throw new Error('Result data is undefined');
    }
    expect(result.data.isSwap).toBe(true);
    expect(result.data.enriched).toBeDefined();
    
    if (result.data.enriched) {
      expect(result.data.enriched.dexName).toBe('Uniswap V3');
      expect(result.data.enriched.tokenInData?.symbol).toBe('USDC');
    }
  });

  it('should handle real Aerodrome swap event', async () => {
    const aerodromeSwap: WebhookEvent = {
      webhookId: 'wh_aerodrome_001',
      eventType: 'smart_contract_event',
      network: 'base',
      contractAddress: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      from: '0x9876543210987654321098765432109876543210',
      methodName: 'swap',
      data: {
        path: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '0x940181a94a35a4569e4529a3cdfb74e38fd98631'],
        amounts: ['1000000000', '50000000000000000000'] // 1000 USDC -> 50 AERO
      }
    };
    
    const processor = createWebhookProcessor(enricher, mockLogger);
    const result = await processor.processEvent(aerodromeSwap);
    
    expect(result.success).toBe(true);
    if (!result.data) {
      throw new Error('Result data is undefined');
    }
    expect(result.data.isSwap).toBe(true);
  });
});