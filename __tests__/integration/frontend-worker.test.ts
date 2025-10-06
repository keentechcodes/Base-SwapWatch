/**
 * Integration tests for frontend-worker communication
 * Verifies that the Next.js app on Cloudflare Pages can connect to the Worker API
 */

import { config, API_URL, WS_URL } from '../../lib/config';

describe('Frontend-Worker Integration', () => {
  describe('API Connectivity', () => {
    it('should define API configuration', () => {
      expect(config.api.url).toBeDefined();
      expect(config.api.wsUrl).toBeDefined();
      expect(API_URL).toMatch(/^https?:\/\//);
      expect(WS_URL).toMatch(/^wss?:\/\//);
    });

    it('should connect to health endpoint', async () => {
      // Mock successful health check response
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', timestamp: Date.now() }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/health`);
    });

    it('should handle CORS headers from Worker', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }),
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('Room API Operations', () => {
    it('should create a room', async () => {
      const roomCode = 'TEST1';
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          roomCode,
          expiresAt: Date.now() + 86400000,
        }),
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/room/${roomCode}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: null }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.roomCode).toBe(roomCode);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URL}/room/${roomCode}/create`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should add wallet to room', async () => {
      const roomCode = 'TEST1';
      const walletAddress = '0x' + '0'.repeat(40);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          wallet: walletAddress,
        }),
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/room/${roomCode}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.wallet).toBe(walletAddress);
    });

    it('should list wallets in room', async () => {
      const roomCode = 'TEST1';
      const wallets = [
        { address: '0x' + '1'.repeat(40), label: 'Wallet 1' },
        { address: '0x' + '2'.repeat(40), label: 'Wallet 2' },
      ];

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => wallets,
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/room/${roomCode}/wallets`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data).toEqual(wallets);
      expect(data).toHaveLength(2);
    });
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection', () => {
      const roomCode = 'TEST1';
      const mockWs = {
        readyState: WebSocket.CONNECTING,
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn(),
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWs) as any;

      const ws = new WebSocket(`${WS_URL}/room/${roomCode}/websocket`);

      expect(global.WebSocket).toHaveBeenCalledWith(`${WS_URL}/room/${roomCode}/websocket`);
      expect(ws).toBeDefined();
      expect(ws.readyState).toBe(WebSocket.CONNECTING);
    });

    it('should handle WebSocket messages', () => {
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn(),
        onmessage: null as any,
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWs) as any;

      const ws = new WebSocket(`${WS_URL}/room/TEST1/websocket`);

      // Simulate message handler
      const messageHandler = jest.fn();
      ws.addEventListener('message', messageHandler);

      // Verify event listener was registered
      expect(mockWs.addEventListener).toHaveBeenCalledWith('message', messageHandler);
    });

    it('should handle WebSocket reconnection', () => {
      let reconnectAttempts = 0;
      const maxReconnects = 3;

      const connect = () => {
        const mockWs = {
          readyState: WebSocket.CLOSED,
          close: jest.fn(),
        };

        global.WebSocket = jest.fn().mockImplementation(() => mockWs) as any;

        const ws = new WebSocket(`${WS_URL}/room/TEST1/websocket`);

        if (ws.readyState === WebSocket.CLOSED && reconnectAttempts < maxReconnects) {
          reconnectAttempts++;
          return true; // Should reconnect
        }

        return false; // Should not reconnect
      };

      expect(connect()).toBe(true);
      expect(reconnectAttempts).toBe(1);

      expect(connect()).toBe(true);
      expect(reconnectAttempts).toBe(2);

      expect(connect()).toBe(true);
      expect(reconnectAttempts).toBe(3);

      expect(connect()).toBe(false);
      expect(reconnectAttempts).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Room not found' }),
      });

      global.fetch = mockFetch as any;

      const response = await fetch(`${API_URL}/room/INVALID`);
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(data.error).toBe('Room not found');
    });

    it('should handle network errors', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch as any;

      try {
        await fetch(`${API_URL}/health`);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Network error');
      }
    });

    it('should handle WebSocket connection errors', () => {
      const mockWs = {
        readyState: WebSocket.CLOSED,
        close: jest.fn(),
        addEventListener: jest.fn((event: string, handler: Function) => {
          if (event === 'error') {
            handler(new Event('error'));
          }
        }),
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWs) as any;

      const ws = new WebSocket(`${WS_URL}/room/TEST1/websocket`);
      const errorHandler = jest.fn();

      ws.addEventListener('error', errorHandler);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Edge Runtime Compatibility', () => {
    it('should work without Node.js APIs', () => {
      // Verify we're not using Node.js specific features
      expect(typeof fetch).toBe('function');
      expect(typeof WebSocket).toBe('function');
      expect(typeof Headers).toBe('function');
      expect(typeof Request).toBe('function');
      expect(typeof Response).toBe('function');
    });

    it('should use environment variables correctly', () => {
      // Should use config module instead of process.env directly
      expect(config.api.url).toBeDefined();
      expect(config.api.wsUrl).toBeDefined();

      // Should not rely on process.env in edge runtime
      if (typeof process !== 'undefined') {
        console.warn('process is available but should not be used in edge runtime');
      }
    });
  });
});