import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { WebhookRequest, captureRawBody, verifyWebhookSignature, validateWebhookPayload } from './middleware/webhookAuth';
// import { debugWebhookSignature } from './middleware/webhookAuthDebug'; // Fixed - CDP uses direct secret
import { EventLogger } from './utils/eventLogger';
import { WebhookEvent, WebhookResponse } from './types/webhook';
import { bootstrap } from './services/enrichment/bootstrap';
import { createWebhookProcessor } from './services/enrichment/webhookProcessor';
import { identifySwapEvent } from './utils/swapDetector';

// Global webhook processor instance
let webhookProcessor: any = null;

// Load environment variables
dotenv.config();

// Create Express app
export const app = express();

// Track server start time for uptime calculation
const startTime = Date.now();

// Middleware for non-webhook routes
app.use('/webhook', express.raw({ 
  type: 'application/json',
  limit: '10mb',
  verify: captureRawBody
}));

// Middleware for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const method = chalk.cyan(req.method);
  const url = chalk.yellow(req.url);
  
  console.log(`[${timestamp}] ${method} ${url}`);
  
  // Log response after it's sent
  const originalSend = res.send;
  res.send = function(data) {
    const statusColor = res.statusCode >= 400 ? chalk.red : chalk.green;
    console.log(`[${timestamp}] ${method} ${url} - ${statusColor(res.statusCode)}`);
    return originalSend.call(this, data);
  };
  
  next();
});

// Routes
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'SwapWatch Webhook Demo',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running'
  });
});

app.get('/health', (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  res.json({
    status: 'healthy',
    uptime,
    timestamp: new Date().toISOString(),
    webhook_configured: !!process.env.WEBHOOK_SECRET
  });
});

// Webhook endpoint
app.post('/webhook', 
  (req: WebhookRequest, res: Response, next: NextFunction) => {
    try {
      // Parse the raw body as JSON for processing
      if (req.body && Buffer.isBuffer(req.body)) {
        req.body = JSON.parse(req.body.toString());
      }
      next();
    } catch (error) {
      EventLogger.logError('Failed to parse webhook body', error);
      res.status(400).json({
        error: 'Invalid JSON payload',
        message: 'Unable to parse webhook body'
      });
    }
  },
  verifyWebhookSignature, // Fixed to handle CDP's direct secret format
  validateWebhookPayload,
  async (req: Request, res: Response) => {
    try {
      const event = req.body as WebhookEvent;
      
      // Log the basic event first
      EventLogger.logEvent(event);

      // Check if it's a swap event and process with enrichment
      if (identifySwapEvent(event) && webhookProcessor) {
        try {
          console.log(chalk.yellow('🔄 Processing swap for enrichment...'));
          const result = await webhookProcessor.processEvent(event);
          
          if (result.success && result.data?.enrichedData) {
            // Log the enriched swap event with all the market data
            EventLogger.logEnrichedSwapEvent(result.data.enrichedData);
          } else if (!result.success) {
            console.log(chalk.gray('ℹ️  Enrichment failed:', result.error));
          } else {
            console.log(chalk.gray('ℹ️  Enrichment returned no data (might not be a swap)'));
          }
        } catch (enrichmentError) {
          console.error(chalk.red('⚠️  Enrichment failed:'), enrichmentError);
          // Continue processing even if enrichment fails
        }
      } else if (identifySwapEvent(event) && !webhookProcessor) {
        console.log(chalk.yellow('⚠️  Swap detected but enrichment not initialized'));
      }

      // Prepare response
      const response: WebhookResponse = {
        status: 'received',
        eventType: event.eventType,
        timestamp: new Date().toISOString()
      };

      // Send success response
      res.status(200).json(response);
    } catch (error) {
      EventLogger.logError('Error processing webhook', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to process webhook'
      });
    }
  }
);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(chalk.red('Error:'), err.message);
  console.error(err.stack);
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Start server only if not in test environment
const PORT = process.env.PORT || 3000;
let server: any;

if (process.env.NODE_ENV !== 'test') {
  // Initialize enrichment services on startup
  bootstrap({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    },
    apis: {
      baseScanApiKey: process.env.ETHERSCAN_API_KEY,
      moralisApiKey: process.env.MORALIS_API_KEY,
      enableMoralis: !!process.env.MORALIS_API_KEY
    }
  })
    .then((bootstrapResult) => {
      if (bootstrapResult.success && bootstrapResult.data) {
        // Create the webhook processor with the bootstrapped services
        webhookProcessor = createWebhookProcessor(
          bootstrapResult.data.services.enricher,
          bootstrapResult.data.infrastructure.logger,
          {
            enableEnrichment: true,
            enrichmentTimeout: 3000,
            logEnrichedEvents: true
          }
        );
        console.log(chalk.green('✅ Enrichment services initialized'));
      } else {
        const errorMessage = !bootstrapResult.success && 'error' in bootstrapResult 
          ? bootstrapResult.error 
          : 'Unknown error';
        console.error(chalk.red('⚠️  Failed to initialize enrichment services:'), errorMessage);
        console.log(chalk.yellow('   The server will continue but enrichment may not work'));
      }
    })
    .catch((error: any) => {
      console.error(chalk.red('⚠️  Failed to initialize enrichment services:'), error);
      console.log(chalk.yellow('   The server will continue but enrichment may not work'));
    });

  server = app.listen(PORT, () => {
    console.log(chalk.green.bold(`🚀 SwapWatch Webhook Demo Server`));
    console.log(chalk.blue(`📡 Listening on port ${PORT}`));
    console.log(chalk.yellow(`🔗 http://localhost:${PORT}`));
    console.log(chalk.cyan(`🏥 Health check: http://localhost:${PORT}/health`));
    
    if (!process.env.WEBHOOK_SECRET) {
      console.log(chalk.yellow.bold('\n⚠️  Warning: WEBHOOK_SECRET not configured'));
      console.log(chalk.yellow('   Please set WEBHOOK_SECRET in your .env file'));
    }

    // Log API configuration status
    console.log(chalk.cyan('\n📊 API Configuration:'));
    console.log(`  ${process.env.ETHERSCAN_API_KEY ? chalk.green('✅') : chalk.red('❌')} Etherscan API`);
    console.log(`  ${process.env.MORALIS_API_KEY ? chalk.green('✅') : chalk.yellow('⚠️')} Moralis API (optional)`);
    console.log(`  ${process.env.REDIS_HOST ? chalk.green('✅') : chalk.yellow('⚠️')} Redis Cache`);
    console.log(`  ${chalk.green('✅')} DexScreener (no key required)`);
  });
}

export { server };