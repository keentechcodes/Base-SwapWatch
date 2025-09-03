import request from 'supertest';
import crypto from 'crypto';
import { app, server } from '../server';

describe('Webhook Endpoint', () => {
  afterAll((done) => {
    server.close(done);
  });

  const mockWebhookPayload = {
    webhookId: '66bd79d0b9c200eae1a43165',
    eventType: 'erc20_transfer',
    network: 'base-mainnet',
    blockHash: '0x60036a0f0454582f60cab6f98990cdcca519b87dd63d5ec01724ce2337129abc',
    blockNumber: '18452087',
    blockTime: '2024-08-15T03:45:21.000Z',
    transactionHash: '0x7f7bc473ee2b94792f033f4d12d0d4d057dab0b5b4f32cd058ad95ee652af948',
    transactionIndex: '16',
    logIndex: '46',
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    from: '0xbb8b2da5db110ad625270061e81987ce342677c3',
    to: '0xfb2139331532e3ee59777fbbcb14af674f3fd671',
    value: '46737096'
  };

  const generateSignature = (payload: any, secret: string): string => {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  };

  describe('POST /webhook', () => {
    it('should accept valid webhook payload', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(mockWebhookPayload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(mockWebhookPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'received');
      expect(response.body).toHaveProperty('eventType', mockWebhookPayload.eventType);
    });

    it('should reject webhook without signature', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .send(mockWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('signature');
    });

    it('should reject webhook with invalid signature', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', 'invalid-signature')
        .set('Content-Type', 'application/json')
        .send(mockWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid');
    });

    it('should handle wallet_activity events', async () => {
      const walletPayload = {
        webhookId: '66bd79d0b9c200eae1a43165',
        eventType: 'wallet_activity',
        network: 'base-mainnet',
        addresses: ['0x1234567890abcdef'],
        walletId: 'test-wallet-id'
      };

      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(walletPayload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(walletPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('eventType', 'wallet_activity');
    });

    it('should handle smart_contract_event', async () => {
      const contractPayload = {
        webhookId: '66bd79d0b9c200eae1a43165',
        eventType: 'smart_contract_event',
        network: 'base-mainnet',
        contractAddress: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
        func: 'Transfer',
        from: '0x042c37762d1d126bc61eac2f5ceb7a96318f5db9',
        to: '0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d',
        value: 13409101014
      };

      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(contractPayload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(contractPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('eventType', 'smart_contract_event');
    });

    it('should reject malformed JSON', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const malformedJson = '{"invalid": json}';
      const signature = generateSignature(malformedJson, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(malformedJson);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing required fields', async () => {
      const incompletePayload = {
        webhookId: '66bd79d0b9c200eae1a43165'
        // Missing eventType and other required fields
      };

      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(incompletePayload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(incompletePayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Missing required field');
    });

    it('should log webhook events to console', async () => {
      const originalLog = console.log;
      let logOutput: string[] = [];

      console.log = jest.fn((...args) => {
        logOutput.push(args.join(' '));
      });

      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(mockWebhookPayload, webhookSecret);

      await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(mockWebhookPayload);

      console.log = originalLog;

      const hasWebhookLog = logOutput.some(log => 
        log.includes('Webhook Event') || 
        log.includes('erc20_transfer')
      );

      expect(hasWebhookLog).toBe(true);
    });
  });

  describe('Raw Body Capture', () => {
    it('should capture raw body for signature verification', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const payload = { 
        webhookId: 'test-webhook-id',
        eventType: 'test_event',
        test: 'data', 
        nested: { value: 123 } 
      };
      const payloadString = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', webhookSecret)
        .update(payloadString)
        .digest('hex');

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('Event Type Detection', () => {
    const testEventType = async (eventType: string) => {
      const payload = {
        webhookId: 'test-id',
        eventType,
        network: 'base-mainnet',
        transactionHash: '0x123'
      };

      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
      const signature = generateSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.eventType).toBe(eventType);
    };

    it('should detect erc20_transfer events', async () => {
      await testEventType('erc20_transfer');
    });

    it('should detect erc721_transfer events', async () => {
      await testEventType('erc721_transfer');
    });

    it('should detect transaction events', async () => {
      await testEventType('transaction');
    });

    it('should handle unknown event types', async () => {
      await testEventType('unknown_event_type');
    });
  });
});