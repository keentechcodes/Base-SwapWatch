/**
 * WebSocket handling logic as pure functions
 */

import type { WebSocketMessage } from '../types';

/**
 * WebSocket session manager
 */
export interface WebSocketManager {
  addSession(ws: WebSocket): void;
  removeSession(ws: WebSocket): void;
  getSessionCount(): number;
  broadcast(message: WebSocketMessage): void;
  closeAll(code?: number, reason?: string): void;
}

/**
 * Create WebSocket manager
 */
export const createWebSocketManager = (): WebSocketManager => {
  const sessions = new Set<WebSocket>();

  /**
   * Add WebSocket session
   */
  const addSession = (ws: WebSocket): void => {
    sessions.add(ws);
  };

  /**
   * Remove WebSocket session
   */
  const removeSession = (ws: WebSocket): void => {
    sessions.delete(ws);
  };

  /**
   * Get active session count
   */
  const getSessionCount = (): number => {
    return sessions.size;
  };

  /**
   * Broadcast message to all sessions
   */
  const broadcast = (message: WebSocketMessage): void => {
    const payload = JSON.stringify(message);

    for (const ws of sessions) {
      try {
        ws.send(payload);
      } catch (error) {
        console.error('Error broadcasting to WebSocket:', error);
        sessions.delete(ws);
      }
    }
  };

  /**
   * Close all sessions
   */
  const closeAll = (code = 1000, reason = 'Room closed'): void => {
    for (const ws of sessions) {
      try {
        ws.close(code, reason);
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
    }
    sessions.clear();
  };

  return {
    addSession,
    removeSession,
    getSessionCount,
    broadcast,
    closeAll,
  };
};

/**
 * Create presence message
 */
export const createPresenceMessage = (count: number): WebSocketMessage => ({
  type: 'presence',
  data: { count },
});

/**
 * Create swap event message
 */
export const createSwapMessage = (swapData: any): WebSocketMessage => ({
  type: 'swap',
  data: swapData,
});

/**
 * Create wallet added message
 */
export const createWalletAddedMessage = (
  address: string,
  label?: string
): WebSocketMessage => ({
  type: 'wallet_added',
  data: { address, label },
});

/**
 * Create wallet removed message
 */
export const createWalletRemovedMessage = (address: string): WebSocketMessage => ({
  type: 'wallet_removed',
  data: { address },
});

/**
 * Create config updated message
 */
export const createConfigUpdatedMessage = (updates: any): WebSocketMessage => ({
  type: 'config_updated',
  data: updates,
});
