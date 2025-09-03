import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Create Express app
export const app = express();

// Track server start time for uptime calculation
const startTime = Date.now();

// Middleware
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

// Start server
const PORT = process.env.PORT || 3000;
export const server = app.listen(PORT, () => {
  console.log(chalk.green.bold(`🚀 SwapWatch Webhook Demo Server`));
  console.log(chalk.blue(`📡 Listening on port ${PORT}`));
  console.log(chalk.yellow(`🔗 http://localhost:${PORT}`));
  console.log(chalk.cyan(`🏥 Health check: http://localhost:${PORT}/health`));
  
  if (!process.env.WEBHOOK_SECRET) {
    console.log(chalk.yellow.bold('\n⚠️  Warning: WEBHOOK_SECRET not configured'));
    console.log(chalk.yellow('   Please set WEBHOOK_SECRET in your .env file'));
  }
});