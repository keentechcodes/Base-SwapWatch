import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import chalk from 'chalk';
import { WebhookRequest } from './webhookAuth';

export const debugWebhookSignature = (req: WebhookRequest, _res: Response, next: NextFunction): void => {
  console.log(chalk.yellow('\n=== WEBHOOK DEBUG ==='));
  
  const signature = req.headers['x-webhook-signature'] as string;
  console.log(chalk.cyan('Received signature:'), signature);
  console.log(chalk.cyan('Signature length:'), signature?.length);
  
  const webhookSecret = process.env.WEBHOOK_SECRET;
  console.log(chalk.cyan('Using secret:'), webhookSecret?.substring(0, 5) + '...');
  
  // Try different payload formats
  const payloadString = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  console.log(chalk.cyan('Payload (first 200 chars):'), payloadString.substring(0, 200));
  
  // Try different signature generation methods
  console.log(chalk.yellow('\nTrying different signature methods:'));
  
  // Method 1: HMAC-SHA256 hex
  const sig1 = crypto.createHmac('sha256', webhookSecret!)
    .update(payloadString)
    .digest('hex');
  console.log(chalk.green('Method 1 (hex):'), sig1);
  console.log(chalk.green('Length:'), sig1.length);
  
  // Method 2: HMAC-SHA256 base64
  const sig2 = crypto.createHmac('sha256', webhookSecret!)
    .update(payloadString)
    .digest('base64');
  console.log(chalk.green('Method 2 (base64):'), sig2);
  console.log(chalk.green('Length:'), sig2.length);
  
  // Method 3: Just the secret (in case CDP sends the secret directly)
  console.log(chalk.green('Method 3 (secret):'), webhookSecret === signature);
  
  // Check if signature matches any method
  if (signature === sig1) {
    console.log(chalk.green('✓ Matches Method 1 (hex)'));
  } else if (signature === sig2) {
    console.log(chalk.green('✓ Matches Method 2 (base64)'));
  } else if (signature === webhookSecret) {
    console.log(chalk.green('✓ Matches Method 3 (secret directly)'));
  } else {
    console.log(chalk.red('✗ No match found'));
  }
  
  console.log(chalk.yellow('=== END DEBUG ===\n'));
  
  // For now, bypass verification to see the payload
  console.log(chalk.yellow('⚠️  Temporarily bypassing signature check to see payload'));
  next();
};