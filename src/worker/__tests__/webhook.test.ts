/**
 * Tests for Coinbase webhook signature verification and processing
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import worker from '../index';
import type { Env } from '../types';

// Helper to create HMAC signature for testing
async function createWebhookSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Mock environment
const mockEnv: Env = {
  ROOMS: {
    idFromName: jest.fn(),
    get: jest.fn(),
  } as any,
  ROOM_INDEX: {} as any,
  COINBASE_WEBHOOK_SECRET: 'test-webhook-secret',
  TELEGRAM_BOT_TOKEN: 'test-token',
};

describe('Coinbase Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Signature Verification', () => {
    it('should accept valid webhook signature', async () => {
      const webhookData = {
        type: 'wallet_activity',
        from: '0x1234567890abcdef',
        to: '0xfedcba0987654321',
        amountInUsd: 1000,
        txHash: '0xabc123',
      };
      const body = JSON.stringify(webhookData);
      const signature = await createWebhookSignature(body, mockEnv.COINBASE_WEBHOOK_SECRET);

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'received');
      expect(data).toHaveProperty('walletAddress', '0x1234567890abcdef');
    });

    it('should reject missing signature', async () => {
      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Missing signature');
    });

    it('should reject invalid signature', async () => {
      const body = JSON.stringify({ type: 'test', from: '0x123' });

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'invalid-signature',
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Invalid signature');
    });

    it('should reject tampered webhook body', async () => {
      const originalBody = JSON.stringify({ type: 'test', from: '0x123' });
      const signature = await createWebhookSignature(originalBody, mockEnv.COINBASE_WEBHOOK_SECRET);
      const tamperedBody = JSON.stringify({ type: 'test', from: '0x456' }); // Different content

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body: tamperedBody,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Invalid signature');
    });
  });

  describe('Webhook Processing', () => {
    it('should extract wallet address from "from" field', async () => {
      const webhookData = {
        from: '0xabc123def456',
        amountInUsd: 500,
      };
      const body = JSON.stringify(webhookData);
      const signature = await createWebhookSignature(body, mockEnv.COINBASE_WEBHOOK_SECRET);

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      expect(data).toHaveProperty('walletAddress', '0xabc123def456');
    });

    it('should extract wallet address from "to" field if "from" missing', async () => {
      const webhookData = {
        to: '0xdef456abc789',
        amountInUsd: 500,
      };
      const body = JSON.stringify(webhookData);
      const signature = await createWebhookSignature(body, mockEnv.COINBASE_WEBHOOK_SECRET);

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      expect(data).toHaveProperty('walletAddress', '0xdef456abc789');
    });

    it('should ignore webhooks without wallet address', async () => {
      const webhookData = {
        type: 'other_event',
        data: 'some data',
      };
      const body = JSON.stringify(webhookData);
      const signature = await createWebhookSignature(body, mockEnv.COINBASE_WEBHOOK_SECRET);

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ignored');
      expect(data).toHaveProperty('message', 'No wallet address found');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      const body = 'invalid-json';
      const signature = await createWebhookSignature(body, mockEnv.COINBASE_WEBHOOK_SECRET);

      const request = new Request('https://api.swapwatch.app/webhook/coinbase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Webhook processing failed');
    });
  });
});