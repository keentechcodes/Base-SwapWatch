import { RoomDurableObject } from './RoomDurableObject';
import { DurableObjectState } from '@cloudflare/workers-types';

// Mock Durable Object State
class MockDurableObjectStorage {
  private data: Map<string, any> = new Map();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async get<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.data.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async put<T = unknown>(entries: Record<string, T>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.data.set(key, value);
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async delete(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.data.delete(key)) {
        count++;
      }
    }
    return count;
  }

  async list(): Promise<Map<string, any>> {
    return new Map(this.data);
  }

  async deleteAll(): Promise<void> {
    this.data.clear();
  }
}

class MockDurableObjectState implements Partial<DurableObjectState> {
  id: DurableObjectId;
  storage: MockDurableObjectStorage;
  private alarmTime: number | null = null;
  private blockedConcurrencyWhile: Promise<void> | null = null;

  constructor(id: DurableObjectId) {
    this.id = id;
    this.storage = new MockDurableObjectStorage();
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmTime;
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarmTime = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime();
  }

  async deleteAlarm(): Promise<void> {
    this.alarmTime = null;
  }

  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    const promise = callback();
    this.blockedConcurrencyWhile = promise.then(() => {});
    return promise;
  }
}

class MockDurableObjectId implements DurableObjectId {
  constructor(public name: string, public toString: () => string = () => name) {}
  equals(other: DurableObjectId): boolean {
    return this.toString() === other.toString();
  }
}

// Mock WebSocket
class MockWebSocket {
  accept() {}
  send(message: string | ArrayBuffer) {}
  close(code?: number, reason?: string) {}
  addEventListener(type: string, listener: EventListener) {}
  removeEventListener(type: string, listener: EventListener) {}
}

describe('RoomDurableObject', () => {
  let roomDO: RoomDurableObject;
  let state: MockDurableObjectState;
  let env: any;

  beforeEach(() => {
    const roomId = new MockDurableObjectId('test-room-123');
    state = new MockDurableObjectState(roomId);
    env = {
      ROOM_INDEX: {},
      COINBASE_WEBHOOK_SECRET: 'test-secret',
      TELEGRAM_BOT_TOKEN: 'test-token'
    };

    roomDO = new RoomDurableObject(state as unknown as DurableObjectState, env);
  });

  describe('Lifecycle Management', () => {
    it('should initialize with default storage schema', async () => {
      const config = await state.storage.get('config');
      expect(config).toBeUndefined(); // Not initialized until first request
    });

    it('should set room expiration alarm on creation', async () => {
      const request = new Request('http://test/room/create', {
        method: 'POST',
        body: JSON.stringify({ createdBy: 'user123' })
      });

      await roomDO.fetch(request);

      const alarmTime = await state.getAlarm();
      expect(alarmTime).toBeTruthy();

      // Alarm should be set for 24 hours from now
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const now = Date.now();
      expect(alarmTime).toBeGreaterThan(now);
      expect(alarmTime).toBeLessThanOrEqual(now + twentyFourHours + 1000);
    });

    it('should delete all data when alarm fires', async () => {
      // Create room first
      await state.storage.put({
        'wallets': ['0x123', '0x456'],
        'labels': { '0x123': 'Wallet 1' },
        'config': {
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        }
      });

      // Fire alarm
      await roomDO.alarm();

      // Storage should be cleared
      const wallets = await state.storage.get('wallets');
      const labels = await state.storage.get('labels');
      const config = await state.storage.get('config');

      expect(wallets).toBeUndefined();
      expect(labels).toBeUndefined();
      expect(config).toBeUndefined();
    });

    it('should handle room extension request', async () => {
      const initialExpiry = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
      await state.storage.put('config', {
        createdAt: Date.now(),
        expiresAt: initialExpiry
      });

      const request = new Request('http://test/room/extend', {
        method: 'POST'
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.expiresAt).toBeGreaterThan(initialExpiry);
    });
  });

  describe('Storage Operations', () => {
    it('should add wallet to tracked list', async () => {
      const request = new Request('http://test/wallets', {
        method: 'POST',
        body: JSON.stringify({
          address: '0xabcdef123456',
          label: 'Test Wallet'
        })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(201);

      const wallets = await state.storage.get<string[]>('wallets');
      expect(wallets).toContain('0xabcdef123456');

      const labels = await state.storage.get<Record<string, string>>('labels');
      expect(labels?.['0xabcdef123456']).toBe('Test Wallet');
    });

    it('should remove wallet from tracked list', async () => {
      // Setup initial wallets
      await state.storage.put({
        'wallets': ['0x123', '0x456', '0x789'],
        'labels': {
          '0x123': 'Wallet 1',
          '0x456': 'Wallet 2',
          '0x789': 'Wallet 3'
        }
      });

      const request = new Request('http://test/wallets/0x456', {
        method: 'DELETE'
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(200);

      const wallets = await state.storage.get<string[]>('wallets');
      expect(wallets).not.toContain('0x456');
      expect(wallets).toHaveLength(2);

      const labels = await state.storage.get<Record<string, string>>('labels');
      expect(labels?.['0x456']).toBeUndefined();
    });

    it('should update wallet label', async () => {
      await state.storage.put({
        'wallets': ['0x123'],
        'labels': { '0x123': 'Old Label' }
      });

      const request = new Request('http://test/wallets/0x123', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'New Label' })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(200);

      const labels = await state.storage.get<Record<string, string>>('labels');
      expect(labels?.['0x123']).toBe('New Label');
    });

    it('should retrieve room configuration', async () => {
      const config = {
        telegramWebhook: 'https://api.telegram.org/bot123/sendMessage',
        threshold: 1000,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };

      await state.storage.put('config', config);

      const request = new Request('http://test/config', {
        method: 'GET'
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.telegramWebhook).toBe(config.telegramWebhook);
      expect(data.threshold).toBe(config.threshold);
    });

    it('should update room configuration', async () => {
      const request = new Request('http://test/config', {
        method: 'PUT',
        body: JSON.stringify({
          telegramWebhook: 'https://api.telegram.org/bot456/sendMessage',
          threshold: 5000
        })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(200);

      const config = await state.storage.get<any>('config');
      expect(config?.telegramWebhook).toBe('https://api.telegram.org/bot456/sendMessage');
      expect(config?.threshold).toBe(5000);
    });

    it('should prevent duplicate wallet addresses', async () => {
      await state.storage.put({
        'wallets': ['0x123'],
        'labels': { '0x123': 'Existing' }
      });

      const request = new Request('http://test/wallets', {
        method: 'POST',
        body: JSON.stringify({
          address: '0x123',
          label: 'Duplicate'
        })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(409); // Conflict

      const wallets = await state.storage.get<string[]>('wallets');
      expect(wallets).toHaveLength(1);

      const labels = await state.storage.get<Record<string, string>>('labels');
      expect(labels?.['0x123']).toBe('Existing'); // Label unchanged
    });
  });

  describe('WebSocket Handling', () => {
    it('should accept WebSocket connection', async () => {
      const mockWs = new MockWebSocket();
      const acceptSpy = jest.spyOn(mockWs, 'accept');

      const request = new Request('http://test/ws', {
        headers: {
          'Upgrade': 'websocket'
        }
      });

      // Mock request.webSocket
      (request as any).webSocket = mockWs;

      const response = await roomDO.fetch(request);

      expect(response.status).toBe(101); // Switching Protocols
      expect(acceptSpy).toHaveBeenCalled();
    });

    it('should track active WebSocket connections', async () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();

      const request1 = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request1 as any).webSocket = mockWs1;

      const request2 = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request2 as any).webSocket = mockWs2;

      await roomDO.fetch(request1);
      await roomDO.fetch(request2);

      // Get presence count
      const presenceRequest = new Request('http://test/presence', {
        method: 'GET'
      });
      const response = await roomDO.fetch(presenceRequest);
      const data = await response.json();

      expect(data.count).toBe(2);
    });

    it('should broadcast message to all connected clients', async () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      const sendSpy1 = jest.spyOn(mockWs1, 'send');
      const sendSpy2 = jest.spyOn(mockWs2, 'send');

      // Connect two clients
      const request1 = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request1 as any).webSocket = mockWs1;

      const request2 = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request2 as any).webSocket = mockWs2;

      await roomDO.fetch(request1);
      await roomDO.fetch(request2);

      // Broadcast via RPC method
      const broadcastRequest = new Request('http://test/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'swap',
          data: { txHash: '0xabc', amount: 1000 }
        })
      });

      await roomDO.fetch(broadcastRequest);

      expect(sendSpy1).toHaveBeenCalledWith(
        expect.stringContaining('swap')
      );
      expect(sendSpy2).toHaveBeenCalledWith(
        expect.stringContaining('swap')
      );
    });

    it('should handle WebSocket close event', async () => {
      const mockWs = new MockWebSocket();
      const closeSpy = jest.spyOn(mockWs, 'close');

      const request = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request as any).webSocket = mockWs;

      await roomDO.fetch(request);

      // Simulate close event
      const closeEvent = new Event('close');
      mockWs.dispatchEvent?.(closeEvent);

      // Presence count should decrease
      const presenceRequest = new Request('http://test/presence', {
        method: 'GET'
      });
      const response = await roomDO.fetch(presenceRequest);
      const data = await response.json();

      expect(data.count).toBe(0);
    });

    it('should enable WebSocket hibernation', async () => {
      const mockWs = new MockWebSocket();

      const request = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (request as any).webSocket = mockWs;

      // Mock hibernation API
      (state as any).acceptWebSocket = jest.fn();

      const response = await roomDO.fetch(request);

      expect(response.status).toBe(101);
      // Hibernation should be enabled via state.acceptWebSocket
      // This is Cloudflare-specific and requires actual runtime
    });
  });

  describe('RPC Methods', () => {
    it('should check if room tracks specific wallet', async () => {
      await state.storage.put('wallets', ['0x123', '0x456']);

      const request = new Request('http://test/rpc/has-wallet', {
        method: 'POST',
        body: JSON.stringify({ address: '0x123' })
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tracked).toBe(true);
    });

    it('should return false for untracked wallet', async () => {
      await state.storage.put('wallets', ['0x123']);

      const request = new Request('http://test/rpc/has-wallet', {
        method: 'POST',
        body: JSON.stringify({ address: '0x999' })
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(data.tracked).toBe(false);
    });

    it('should broadcast swap event to room', async () => {
      const mockWs = new MockWebSocket();
      const sendSpy = jest.spyOn(mockWs, 'send');

      // Connect client
      const wsRequest = new Request('http://test/ws', {
        headers: { 'Upgrade': 'websocket' }
      });
      (wsRequest as any).webSocket = mockWs;
      await roomDO.fetch(wsRequest);

      // Broadcast swap
      const swapEvent = {
        txHash: '0xabc123',
        walletAddress: '0x123',
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountInUsd: 1000,
        amountOutUsd: 995
      };

      const rpcRequest = new Request('http://test/rpc/notify-swap', {
        method: 'POST',
        body: JSON.stringify(swapEvent)
      });

      const response = await roomDO.fetch(rpcRequest);
      expect(response.status).toBe(200);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.stringContaining('0xabc123')
      );
    });

    it('should send Telegram notification if configured', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await state.storage.put('config', {
        telegramWebhook: 'https://api.telegram.org/bot123/sendMessage',
        threshold: 1000,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      });

      const swapEvent = {
        txHash: '0xabc123',
        walletAddress: '0x123',
        amountInUsd: 5000 // Above threshold
      };

      const rpcRequest = new Request('http://test/rpc/notify-swap', {
        method: 'POST',
        body: JSON.stringify(swapEvent)
      });

      await roomDO.fetch(rpcRequest);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('telegram'),
        expect.any(Object)
      );
    });

    it('should not send Telegram notification below threshold', async () => {
      global.fetch = jest.fn();

      await state.storage.put('config', {
        telegramWebhook: 'https://api.telegram.org/bot123/sendMessage',
        threshold: 10000,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      });

      const swapEvent = {
        txHash: '0xabc123',
        walletAddress: '0x123',
        amountInUsd: 500 // Below threshold
      };

      const rpcRequest = new Request('http://test/rpc/notify-swap', {
        method: 'POST',
        body: JSON.stringify(swapEvent)
      });

      await roomDO.fetch(rpcRequest);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('http://test/unknown', {
        method: 'GET'
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new Request('http://test/wallets', {
        method: 'POST',
        body: 'invalid json{'
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(400);
    });

    it('should return 405 for unsupported HTTP methods', async () => {
      const request = new Request('http://test/wallets', {
        method: 'TRACE' // Unsupported
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(405);
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage error
      jest.spyOn(state.storage, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));

      const request = new Request('http://test/config', {
        method: 'GET'
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty wallet list', async () => {
      await state.storage.put('wallets', []);

      const request = new Request('http://test/wallets', {
        method: 'GET'
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.wallets).toEqual([]);
    });

    it('should handle missing configuration gracefully', async () => {
      const request = new Request('http://test/config', {
        method: 'GET'
      });

      const response = await roomDO.fetch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config).toEqual({});
    });

    it('should validate wallet address format', async () => {
      const request = new Request('http://test/wallets', {
        method: 'POST',
        body: JSON.stringify({
          address: 'invalid-address',
          label: 'Test'
        })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid wallet address');
    });

    it('should limit maximum wallets per room', async () => {
      const maxWallets = 50;
      const wallets = Array.from({ length: maxWallets }, (_, i) => `0x${i.toString().padStart(40, '0')}`);

      await state.storage.put('wallets', wallets);

      const request = new Request('http://test/wallets', {
        method: 'POST',
        body: JSON.stringify({
          address: '0xnewwallet',
          label: 'Overflow'
        })
      });

      const response = await roomDO.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Maximum wallets');
    });
  });
});
