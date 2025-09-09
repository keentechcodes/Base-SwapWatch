/**
 * Enrichment strategies as pure functions
 * Following functional programming paradigm for business logic
 */

import { Result, success, failure } from '../types';
import { MarketData, TokenInfo, VerificationData } from '../types';

/**
 * Enrichment strategy types
 */
export enum EnrichmentStrategy {
  FULL = 'full',           // All available data
  FAST = 'fast',           // Only cached data
  ESSENTIAL = 'essential', // Only price and metadata
  MINIMAL = 'minimal'      // Only token symbols
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  strategy: EnrichmentStrategy;
  timeout?: number;
  maxRetries?: number;
  fallbackOnError?: boolean;
}

/**
 * Token enrichment data
 */
export interface TokenEnrichmentData {
  info?: TokenInfo;
  market?: MarketData;
  verification?: VerificationData;
  enrichmentLevel: EnrichmentStrategy;
  dataQuality: DataQuality;
}

/**
 * Data quality indicators
 */
export interface DataQuality {
  isComplete: boolean;
  isFresh: boolean;
  isVerified: boolean;
  confidence: number; // 0-100
  sources: string[];
}

/**
 * Determine enrichment strategy based on context
 */
export const determineStrategy = (
  isRealtime: boolean,
  hasCachedData: boolean,
  latencyBudget: number,
  apiHealth: { [key: string]: boolean }
): EnrichmentStrategy => {
  // Fast path for real-time with cache
  if (isRealtime && hasCachedData && latencyBudget < 100) {
    return EnrichmentStrategy.FAST;
  }
  
  // Full enrichment if we have time and healthy APIs
  const healthyApis = Object.values(apiHealth).filter(h => h).length;
  if (latencyBudget > 300 && healthyApis >= 2) {
    return EnrichmentStrategy.FULL;
  }
  
  // Essential data for medium latency
  if (latencyBudget > 150 && healthyApis >= 1) {
    return EnrichmentStrategy.ESSENTIAL;
  }
  
  // Minimal fallback
  return EnrichmentStrategy.MINIMAL;
};

/**
 * Select data sources based on strategy
 */
export const selectDataSources = (
  strategy: EnrichmentStrategy
): string[] => {
  switch (strategy) {
    case EnrichmentStrategy.FULL:
      return ['dexscreener', 'basescan', 'coingecko', 'moralis', 'ethplorer'];
    
    case EnrichmentStrategy.FAST:
      return ['cache'];
    
    case EnrichmentStrategy.ESSENTIAL:
      return ['dexscreener', 'cache'];
    
    case EnrichmentStrategy.MINIMAL:
      return ['local'];
    
    default:
      return ['cache'];
  }
};

/**
 * Calculate data quality score
 */
export const calculateDataQuality = (
  data: Partial<TokenEnrichmentData>,
  strategy: EnrichmentStrategy,
  sources: string[],
  age?: number
): DataQuality => {
  let completeness = 0;
  let expectedFields = 0;
  
  // Check completeness based on strategy
  switch (strategy) {
    case EnrichmentStrategy.FULL:
      expectedFields = 15; // All fields
      if (data.info?.name) completeness++;
      if (data.info?.symbol) completeness++;
      if (data.info?.decimals) completeness++;
      if (data.info?.totalSupply) completeness++;
      if (data.market?.price) completeness++;
      if (data.market?.priceChange24h) completeness++;
      if (data.market?.marketCap) completeness++;
      if (data.market?.volume24h) completeness++;
      if (data.market?.liquidity) completeness++;
      if (data.market?.fdv) completeness++;
      if (data.market?.holders) completeness++;
      if (data.market?.age) completeness++;
      if (data.verification?.isVerified !== undefined) completeness++;
      if (data.verification?.contractName) completeness++;
      if (data.verification?.abi) completeness++;
      break;
    
    case EnrichmentStrategy.ESSENTIAL:
      expectedFields = 6;
      if (data.info?.name) completeness++;
      if (data.info?.symbol) completeness++;
      if (data.info?.decimals) completeness++;
      if (data.market?.price) completeness++;
      if (data.market?.volume24h) completeness++;
      if (data.market?.liquidity) completeness++;
      break;
    
    case EnrichmentStrategy.FAST:
    case EnrichmentStrategy.MINIMAL:
      expectedFields = 3;
      if (data.info?.name) completeness++;
      if (data.info?.symbol) completeness++;
      if (data.info?.decimals) completeness++;
      break;
  }
  
  const completenessScore = expectedFields > 0 
    ? (completeness / expectedFields) * 100 
    : 0;
  
  // Check freshness (data age in seconds)
  const isFresh = age ? age < 300 : true; // Less than 5 minutes
  
  // Check if verified
  const isVerified = data.verification?.isVerified || false;
  
  // Calculate confidence score
  const sourceWeight = Math.min(sources.length * 20, 40); // Max 40 points for sources
  const freshnessWeight = isFresh ? 30 : 0;
  const verificationWeight = isVerified ? 30 : 15;
  const confidence = Math.min(
    completenessScore * 0.4 + sourceWeight + freshnessWeight + verificationWeight,
    100
  );
  
  return {
    isComplete: completenessScore === 100,
    isFresh,
    isVerified,
    confidence: Math.round(confidence),
    sources
  };
};

/**
 * Merge multiple data sources with conflict resolution
 */
export const mergeEnrichmentData = (
  sources: Array<{
    source: string;
    data: Partial<TokenEnrichmentData>;
    timestamp: Date;
    priority: number;
  }>
): TokenEnrichmentData => {
  // Sort by priority (lower number = higher priority)
  const sorted = sources.sort((a, b) => a.priority - b.priority);
  
  // Start with empty result
  const result: TokenEnrichmentData = {
    enrichmentLevel: EnrichmentStrategy.MINIMAL,
    dataQuality: {
      isComplete: false,
      isFresh: false,
      isVerified: false,
      confidence: 0,
      sources: []
    }
  };
  
  // Merge data, with higher priority sources overwriting lower
  for (const source of sorted) {
    if (source.data.info) {
      result.info = { ...result.info, ...source.data.info };
    }
    
    if (source.data.market) {
      result.market = { ...result.market, ...source.data.market };
    }
    
    if (source.data.verification) {
      result.verification = { ...result.verification, ...source.data.verification };
    }
    
    // Track sources
    if (!result.dataQuality.sources.includes(source.source)) {
      result.dataQuality.sources.push(source.source);
    }
  }
  
  // Determine enrichment level achieved
  if (result.info && result.market && result.verification) {
    result.enrichmentLevel = EnrichmentStrategy.FULL;
  } else if (result.info && result.market) {
    result.enrichmentLevel = EnrichmentStrategy.ESSENTIAL;
  } else if (result.info) {
    result.enrichmentLevel = EnrichmentStrategy.MINIMAL;
  }
  
  // Calculate final data quality
  const newestTimestamp = Math.max(...sources.map(s => s.timestamp.getTime()));
  const age = (Date.now() - newestTimestamp) / 1000;
  
  result.dataQuality = calculateDataQuality(
    result,
    result.enrichmentLevel,
    result.dataQuality.sources,
    age
  );
  
  return result;
};

/**
 * Apply fallback strategy when primary enrichment fails
 */
export const applyFallbackStrategy = (
  tokenAddress: string,
  error: Error,
  cachedData?: Partial<TokenEnrichmentData>
): Result<TokenEnrichmentData> => {
  // error parameter is logged for debugging but not used in logic
  void error;
  // If we have cached data, use it
  if (cachedData && Object.keys(cachedData).length > 0) {
    return success({
      ...cachedData,
      enrichmentLevel: EnrichmentStrategy.FAST,
      dataQuality: {
        isComplete: false,
        isFresh: false,
        isVerified: false,
        confidence: 50, // Cached data gets 50% confidence
        sources: ['cache-fallback']
      }
    } as TokenEnrichmentData);
  }
  
  // Return minimal data with just the address
  return success({
    info: {
      address: tokenAddress,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 18
    },
    enrichmentLevel: EnrichmentStrategy.MINIMAL,
    dataQuality: {
      isComplete: false,
      isFresh: false,
      isVerified: false,
      confidence: 10, // Minimal confidence for fallback
      sources: ['fallback']
    }
  });
};

/**
 * Validate enrichment result meets quality requirements
 */
export const validateEnrichmentQuality = (
  data: TokenEnrichmentData,
  requirements: {
    minConfidence?: number;
    requireVerification?: boolean;
    requireFreshData?: boolean;
    requiredFields?: string[];
  }
): Result<TokenEnrichmentData> => {
  const { minConfidence = 0, requireVerification = false, requireFreshData = false, requiredFields = [] } = requirements;
  
  // Check confidence
  if (data.dataQuality.confidence < minConfidence) {
    return failure(new Error(`Data confidence ${data.dataQuality.confidence}% below minimum ${minConfidence}%`));
  }
  
  // Check verification
  if (requireVerification && !data.dataQuality.isVerified) {
    return failure(new Error('Token verification required but not available'));
  }
  
  // Check freshness
  if (requireFreshData && !data.dataQuality.isFresh) {
    return failure(new Error('Fresh data required but only stale data available'));
  }
  
  // Check required fields
  for (const field of requiredFields) {
    const [category, prop] = field.split('.');
    const categoryData = data[category as keyof TokenEnrichmentData];
    
    if (!categoryData || typeof categoryData !== 'object') {
      return failure(new Error(`Required field ${field} not present`));
    }
    
    if (prop && !(prop in categoryData)) {
      return failure(new Error(`Required field ${field} not present`));
    }
  }
  
  return success(data);
};

/**
 * Calculate enrichment cost (for monitoring/optimization)
 */
export const calculateEnrichmentCost = (
  strategy: EnrichmentStrategy,
  apiCalls: number,
  cacheHits: number,
  latency: number
): {
  apiCost: number;
  cacheCost: number;
  timeCost: number;
  totalCost: number;
} => {
  // Arbitrary cost units for demonstration
  const API_CALL_COST = 10;
  const CACHE_HIT_COST = 1;
  const TIME_COST_PER_MS = 0.01;
  
  const apiCost = apiCalls * API_CALL_COST;
  const cacheCost = cacheHits * CACHE_HIT_COST;
  const timeCost = latency * TIME_COST_PER_MS;
  
  // Apply strategy multiplier
  let strategyMultiplier = 1;
  switch (strategy) {
    case EnrichmentStrategy.FULL:
      strategyMultiplier = 1.5;
      break;
    case EnrichmentStrategy.ESSENTIAL:
      strategyMultiplier = 1.2;
      break;
    case EnrichmentStrategy.FAST:
      strategyMultiplier = 0.8;
      break;
    case EnrichmentStrategy.MINIMAL:
      strategyMultiplier = 0.5;
      break;
  }
  
  const totalCost = (apiCost + cacheCost + timeCost) * strategyMultiplier;
  
  return {
    apiCost,
    cacheCost,
    timeCost,
    totalCost: Math.round(totalCost * 100) / 100
  };
};

/**
 * Get optimal strategy based on historical performance
 */
export const getOptimalStrategy = (
  historicalMetrics: Array<{
    strategy: EnrichmentStrategy;
    successRate: number;
    averageLatency: number;
    averageQuality: number;
  }>,
  requirements: {
    maxLatency: number;
    minQuality: number;
  }
): EnrichmentStrategy => {
  // Filter strategies that meet requirements
  const validStrategies = historicalMetrics.filter(
    m => m.averageLatency <= requirements.maxLatency && 
         m.averageQuality >= requirements.minQuality
  );
  
  if (validStrategies.length === 0) {
    // No strategy meets requirements, use fastest
    return EnrichmentStrategy.FAST;
  }
  
  // Sort by success rate * quality / latency (higher is better)
  const scored = validStrategies.map(m => ({
    strategy: m.strategy,
    score: (m.successRate * m.averageQuality) / m.averageLatency
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored[0].strategy;
};