import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import chalk from 'chalk';

export interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

export const captureRawBody = (req: WebhookRequest, _res: Response, buf: Buffer, _encoding: BufferEncoding) => {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
};

export const verifyWebhookSignature = (req: WebhookRequest, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-webhook-signature'] as string;
  
  if (!signature) {
    console.error(chalk.red('⚠️  Missing webhook signature'));
    res.status(401).json({ 
      error: 'Missing webhook signature',
      message: 'x-webhook-signature header is required'
    });
    return;
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error(chalk.red('⚠️  WEBHOOK_SECRET not configured'));
    res.status(500).json({ 
      error: 'Server configuration error',
      message: 'Webhook secret not configured'
    });
    return;
  }

  try {
    // Use raw body for signature verification
    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      console.error(chalk.red('⚠️  Invalid webhook signature (length mismatch)'));
      res.status(401).json({ 
        error: 'Invalid webhook signature',
        message: 'Signature verification failed'
      });
      return;
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      console.error(chalk.red('⚠️  Invalid webhook signature'));
      res.status(401).json({ 
        error: 'Invalid webhook signature',
        message: 'Signature verification failed'
      });
      return;
    }

    console.log(chalk.green('✓ Webhook signature verified'));
    next();
  } catch (error) {
    console.error(chalk.red('⚠️  Signature verification error:'), error);
    res.status(401).json({ 
      error: 'Signature verification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
};

export const validateWebhookPayload = (req: Request, res: Response, next: NextFunction): void => {
  const { webhookId, eventType } = req.body;

  if (!webhookId) {
    res.status(400).json({
      error: 'Missing required field: webhookId',
      message: 'Webhook payload must include webhookId'
    });
    return;
  }

  if (!eventType) {
    res.status(400).json({
      error: 'Missing required field: eventType',
      message: 'Webhook payload must include eventType'
    });
    return;
  }

  // Validate timestamp if present (5-minute window)
  if (req.body.blockTime) {
    const eventTime = new Date(req.body.blockTime).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (Math.abs(now - eventTime) > fiveMinutes && process.env.NODE_ENV === 'production') {
      console.warn(chalk.yellow('⚠️  Webhook event outside 5-minute window'));
    }
  }

  next();
};