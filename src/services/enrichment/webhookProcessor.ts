/**
 * Webhook processor with enrichment integration
 * Connects webhook events to the enrichment pipeline
 */

import { Result, success, failure } from '../types';
import { WebhookEvent } from '../../types/webhook';
import { identifySwapEvent, extractSwapData, SwapData } from '../../utils/swapDetector';
import { SwapEnricher, EnrichedSwapEvent } from './SwapEnricher';
import { EnrichmentStrategy, determineStrategy } from './strategies';
import { ILogger } from '../../infrastructure/logger/ILogger';
import { EventLogger } from '../../utils/eventLogger';

/**
 * Webhook processor configuration
 */
export interface WebhookProcessorConfig {
  enableEnrichment?: boolean;
  enrichmentTimeout?: number;
  logEnrichedEvents?: boolean;
  webhookSecret?: string;
}

/**
 * Webhook processing result
 */
export interface ProcessingResult {
  success: boolean;
  isSwap: boolean;
  enriched?: EnrichedSwapEvent;
  rawSwapData?: SwapData;
  processingTime: number;
  errors?: string[];
}

/**
 * Webhook processor service
 */
export interface WebhookProcessor {
  processEvent(event: WebhookEvent): Promise<Result<ProcessingResult>>;
  getMetrics(): ProcessorMetrics;
}

/**
 * Processor metrics
 */
export interface ProcessorMetrics {
  totalEvents: number;
  swapEvents: number;
  enrichedEvents: number;
  failedEnrichments: number;
  averageProcessingTime: number;
}

/**
 * Create webhook processor with enrichment
 */
export const createWebhookProcessor = (
  enricher: SwapEnricher,
  logger: ILogger,
  config: WebhookProcessorConfig = {}
): WebhookProcessor => {
  // Configuration defaults
  const {
    enableEnrichment = true,
    enrichmentTimeout = 500,
    logEnrichedEvents = true
  } = config;

  // Metrics tracking
  let metrics: ProcessorMetrics = {
    totalEvents: 0,
    swapEvents: 0,
    enrichedEvents: 0,
    failedEnrichments: 0,
    averageProcessingTime: 0
  };

  /**
   * Process a webhook event
   */
  const processEvent = async (event: WebhookEvent): Promise<Result<ProcessingResult>> => {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      metrics.totalEvents++;
      
      // Check if it's a swap event
      const isSwap = identifySwapEvent(event);
      
      if (!isSwap) {
        // Not a swap, process normally without enrichment
        if (logEnrichedEvents) {
          EventLogger.logEvent(event);
        }
        
        const processingTime = Date.now() - startTime;
        updateProcessingTime(processingTime);
        
        return success({
          success: true,
          isSwap: false,
          processingTime
        });
      }
      
      metrics.swapEvents++;
      
      // Extract swap data
      const swapData = extractSwapData(event);
      
      if (!swapData) {
        errors.push('Failed to extract swap data');
        logger.warn('Could not extract swap data from identified swap event', { event });
        
        const processingTime = Date.now() - startTime;
        updateProcessingTime(processingTime);
        
        return success({
          success: false,
          isSwap: true,
          processingTime,
          errors
        });
      }
      
      // Process with or without enrichment
      if (!enableEnrichment) {
        // Log without enrichment
        if (logEnrichedEvents) {
          EventLogger.logEvent(event);
        }
        
        const processingTime = Date.now() - startTime;
        updateProcessingTime(processingTime);
        
        return success({
          success: true,
          isSwap: true,
          rawSwapData: swapData,
          processingTime
        });
      }
      
      // Enrich the swap event
      const enrichmentStart = Date.now();
      
      // Determine strategy based on context
      const strategy = determineStrategy(
        true, // isRealtime
        false, // hasCachedData (could check)
        enrichmentTimeout,
        { dexscreener: true, basescan: true } // API health (could check)
      );
      
      logger.debug('Enriching swap event', {
        transactionHash: event.transactionHash,
        strategy
      });
      
      // Set up timeout promise
      const timeoutPromise = new Promise<Result<EnrichedSwapEvent>>((resolve) => {
        setTimeout(() => {
          resolve(failure(new Error('Enrichment timeout')));
        }, enrichmentTimeout);
      });
      
      // Race enrichment against timeout
      const enrichmentPromise = enricher.enrichSwapEvent(event, swapData);
      const enrichmentResult = await Promise.race([enrichmentPromise, timeoutPromise]);
      
      const enrichmentTime = Date.now() - enrichmentStart;
      
      if (enrichmentResult.success) {
        metrics.enrichedEvents++;
        
        // Log enriched event
        if (logEnrichedEvents) {
          logEnrichedSwapEvent(enrichmentResult.data);
        }
        
        logger.info('Swap event enriched successfully', {
          transactionHash: event.transactionHash,
          enrichmentTime,
          cacheHits: enrichmentResult.data.enrichmentMetrics?.cacheHits,
          apiCalls: enrichmentResult.data.enrichmentMetrics?.apiCalls
        });
        
        const processingTime = Date.now() - startTime;
        updateProcessingTime(processingTime);
        
        return success({
          success: true,
          isSwap: true,
          enriched: enrichmentResult.data,
          processingTime
        });
        
      } else {
        metrics.failedEnrichments++;
        errors.push(enrichmentResult.error?.message || 'Enrichment failed');
        
        logger.warn('Failed to enrich swap event', {
          transactionHash: event.transactionHash,
          error: enrichmentResult.error?.message,
          enrichmentTime
        });
        
        // Log raw event as fallback
        if (logEnrichedEvents) {
          EventLogger.logEvent(event);
        }
        
        const processingTime = Date.now() - startTime;
        updateProcessingTime(processingTime);
        
        return success({
          success: false,
          isSwap: true,
          rawSwapData: swapData,
          processingTime,
          errors
        });
      }
      
    } catch (error) {
      const errorMessage = (error as Error).message;
      errors.push(errorMessage);
      
      logger.error('Failed to process webhook event', error as Error);
      
      const processingTime = Date.now() - startTime;
      updateProcessingTime(processingTime);
      
      return failure(new Error(`Processing failed: ${errorMessage}`));
    }
  };

  /**
   * Update average processing time
   */
  const updateProcessingTime = (newTime: number): void => {
    const totalTime = metrics.averageProcessingTime * (metrics.totalEvents - 1) + newTime;
    metrics.averageProcessingTime = totalTime / metrics.totalEvents;
  };

  /**
   * Log enriched swap event with enhanced formatting
   */
  const logEnrichedSwapEvent = (event: EnrichedSwapEvent): void => {
    const chalk = require('chalk');
    
    console.log('\n' + chalk.green('═'.repeat(80)));
    console.log(chalk.bold.green('💰 ENRICHED SWAP EVENT'));
    console.log(chalk.green('═'.repeat(80)));
    
    // Basic swap info
    console.log(chalk.cyan('📊 Swap Details:'));
    console.log(`  ${chalk.gray('DEX:')} ${event.dexName}`);
    console.log(`  ${chalk.gray('From:')} ${event.from}`);
    console.log(`  ${chalk.gray('TX:')} ${event.transactionHash}`);
    
    // Token In Data
    if (event.tokenInData) {
      console.log(chalk.yellow('\n📥 Token In:'));
      console.log(`  ${chalk.gray('Token:')} ${event.tokenInData.symbol} (${event.tokenInData.name})`);
      console.log(`  ${chalk.gray('Price:')} $${event.tokenInData.price || 'N/A'}`);
      console.log(`  ${chalk.gray('Market Cap:')} $${event.tokenInData.marketCap || 'N/A'}`);
      console.log(`  ${chalk.gray('24h Volume:')} $${event.tokenInData.volume24h || 'N/A'}`);
      console.log(`  ${chalk.gray('24h Change:')} ${event.tokenInData.priceChange24h || 0}%`);
      console.log(`  ${chalk.gray('Verified:')} ${event.tokenInData.isVerified ? '✅' : '❌'}`);
    }
    
    // Token Out Data
    if (event.tokenOutData) {
      console.log(chalk.yellow('\n📤 Token Out:'));
      console.log(`  ${chalk.gray('Token:')} ${event.tokenOutData.symbol} (${event.tokenOutData.name})`);
      console.log(`  ${chalk.gray('Price:')} $${event.tokenOutData.price || 'N/A'}`);
      console.log(`  ${chalk.gray('Market Cap:')} $${event.tokenOutData.marketCap || 'N/A'}`);
      console.log(`  ${chalk.gray('24h Volume:')} $${event.tokenOutData.volume24h || 'N/A'}`);
      console.log(`  ${chalk.gray('24h Change:')} ${event.tokenOutData.priceChange24h || 0}%`);
      console.log(`  ${chalk.gray('Verified:')} ${event.tokenOutData.isVerified ? '✅' : '❌'}`);
    }
    
    // USD Values
    if (event.usdValues) {
      console.log(chalk.magenta('\n💵 USD Values:'));
      console.log(`  ${chalk.gray('Amount In:')} $${event.usdValues.amountInUsd}`);
      console.log(`  ${chalk.gray('Amount Out:')} $${event.usdValues.amountOutUsd}`);
      console.log(`  ${chalk.gray('Slippage:')} ${event.usdValues.slippage}%`);
      console.log(`  ${chalk.gray('Price Impact:')} ${event.usdValues.priceImpact}%`);
    }
    
    // Wallet Data
    if (event.walletData) {
      console.log(chalk.blue('\n👤 Wallet Profile:'));
      console.log(`  ${chalk.gray('Experienced:')} ${event.walletData.isExperiencedTrader ? 'Yes' : 'No'}`);
      console.log(`  ${chalk.gray('Total P&L:')} $${event.walletData.totalProfit?.toFixed(2) || '0'}`);
      console.log(`  ${chalk.gray('Win Rate:')} ${event.walletData.winRate?.toFixed(1) || '0'}%`);
      console.log(`  ${chalk.gray('Total Trades:')} ${event.walletData.totalTrades || 0}`);
    }
    
    // Enrichment Metrics
    if (event.enrichmentMetrics) {
      console.log(chalk.gray('\n⚡ Performance:'));
      console.log(`  ${chalk.gray('Latency:')} ${event.enrichmentMetrics.latency}ms`);
      console.log(`  ${chalk.gray('Cache Hits:')} ${event.enrichmentMetrics.cacheHits}`);
      console.log(`  ${chalk.gray('API Calls:')} ${event.enrichmentMetrics.apiCalls}`);
      if (event.enrichmentMetrics.fallbacksUsed.length > 0) {
        console.log(`  ${chalk.gray('Fallbacks:')} ${event.enrichmentMetrics.fallbacksUsed.join(', ')}`);
      }
    }
    
    console.log(chalk.green('═'.repeat(80)) + '\n');
  };

  /**
   * Get processor metrics
   */
  const getMetrics = (): ProcessorMetrics => {
    return { ...metrics };
  };

  // Return service interface
  return {
    processEvent,
    getMetrics
  };
};

/**
 * Create webhook handler middleware for Express
 */
export const createEnrichedWebhookHandler = (
  processor: WebhookProcessor,
  logger: ILogger
) => {
  return async (req: any, res: any) => {
    try {
      const event = req.body as WebhookEvent;
      
      // Process the event
      const result = await processor.processEvent(event);
      
      if (result.success) {
        // Send appropriate response
        const response = {
          status: 'received',
          eventType: event.eventType,
          isSwap: result.data.isSwap,
          enriched: result.data.enriched !== undefined,
          processingTime: result.data.processingTime,
          timestamp: new Date().toISOString()
        };
        
        res.json(response);
      } else {
        // Processing failed
        logger.error('Webhook processing failed', result.error as Error);
        
        res.status(500).json({
          error: 'Processing failed',
          message: result.error?.message
        });
      }
      
    } catch (error) {
      logger.error('Webhook handler error', error as Error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  };
};