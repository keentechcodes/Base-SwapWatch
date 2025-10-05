/**
 * Tests for WebSocket manager and message factories
 */

import {
  createWebSocketManager,
  createPresenceMessage,
  createSwapMessage,
  createWalletAddedMessage,
  createWalletRemovedMessage,
  createConfigUpdatedMessage,
} from '../websocket';

// Mock WebSocket
class MockWebSocket {
  sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

describe('WebSocket Functions', () => {
  describe('createWebSocketManager', () => {
    it('should track session count', () => {
      const manager = createWebSocketManager();
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;

      expect(manager.getSessionCount()).toBe(0);

      manager.addSession(ws1);
      expect(manager.getSessionCount()).toBe(1);

      manager.addSession(ws2);
      expect(manager.getSessionCount()).toBe(2);

      manager.removeSession(ws1);
      expect(manager.getSessionCount()).toBe(1);
    });

    it('should broadcast to all sessions', () => {
      const manager = createWebSocketManager();
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;

      manager.addSession(ws1);
      manager.addSession(ws2);

      const message = { type: 'presence' as const, data: { count: 2 } };
      manager.broadcast(message);

      expect((ws1 as any).sent).toHaveLength(1);
      expect((ws2 as any).sent).toHaveLength(1);
      expect(JSON.parse((ws1 as any).sent[0])).toEqual(message);
    });

    it('should close all sessions', () => {
      const manager = createWebSocketManager();
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;

      manager.addSession(ws1);
      manager.addSession(ws2);

      manager.closeAll();

      expect((ws1 as any).closed).toBe(true);
      expect((ws2 as any).closed).toBe(true);
      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('Message Factories', () => {
    it('should create presence message', () => {
      const message = createPresenceMessage(5);
      expect(message).toEqual({
        type: 'presence',
        data: { count: 5 },
      });
    });

    it('should create swap message', () => {
      const swapData = { txHash: '0x123', amount: 1000 };
      const message = createSwapMessage(swapData);
      expect(message).toEqual({
        type: 'swap',
        data: swapData,
      });
    });

    it('should create wallet added message', () => {
      const message = createWalletAddedMessage('0x123', 'My Wallet');
      expect(message).toEqual({
        type: 'wallet_added',
        data: { address: '0x123', label: 'My Wallet' },
      });
    });

    it('should create wallet removed message', () => {
      const message = createWalletRemovedMessage('0x123');
      expect(message).toEqual({
        type: 'wallet_removed',
        data: { address: '0x123' },
      });
    });

    it('should create config updated message', () => {
      const updates = { threshold: 1000 };
      const message = createConfigUpdatedMessage(updates);
      expect(message).toEqual({
        type: 'config_updated',
        data: updates,
      });
    });
  });
});
