/**
 * WebSocket manager factory for Cloudflare Durable Objects
 * Uses Durable Object's state.getWebSockets() instead of manual tracking
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import { Result, success, failure } from '../../services/types';
import type { WebSocketMessage } from '../types';

/**
 * WebSocket manager factory for Durable Objects
 * Takes DurableObjectState to access managed WebSockets
 */
export const createWebSocketManager = (state: DurableObjectState) => {
  return {
    /**
     * Track a new WebSocket connection
     * In Durable Objects, this is handled by state.acceptWebSocket()
     */
    track: (ws: WebSocket): Result<void> => {
      // WebSocket is already accepted in handleWebSocketUpgrade
      // This is now a no-op but kept for API compatibility
      return success(undefined);
    },

    /**
     * Untrack a WebSocket connection
     * In Durable Objects, connections are auto-removed on close
     */
    untrack: (ws: WebSocket): Result<void> => {
      // Auto-handled by Durable Objects runtime
      // This is now a no-op but kept for API compatibility
      return success(undefined);
    },

    /**
     * Broadcast message to all connected sessions
     * Uses state.getWebSockets() to get Durable Object managed connections
     */
    broadcast: async (message: WebSocketMessage): Promise<Result<number>> => {
      try {
        const payload = JSON.stringify(message);
        const connections = state.getWebSockets();
        let delivered = 0;

        for (const ws of connections) {
          try {
            ws.send(payload);
            delivered++;
          } catch (error) {
            // Connection will be auto-removed by Durable Objects runtime
            console.error('Failed to send to WebSocket:', error);
          }
        }

        return success(delivered);
      } catch (error) {
        return failure(new Error('Failed to broadcast message'));
      }
    },

    /**
     * Send message to specific WebSocket
     */
    send: (ws: WebSocket, message: WebSocketMessage): Result<void> => {
      try {
        const payload = JSON.stringify(message);
        ws.send(payload);
        return success(undefined);
      } catch (error) {
        return failure(new Error('Failed to send message'));
      }
    },

    /**
     * Get current connection count
     * Uses state.getWebSockets() to get accurate count
     */
    getCount: (): number => {
      return state.getWebSockets().length;
    },

    /**
     * Close all connections
     */
    closeAll: (code?: number, reason?: string): Result<number> => {
      try {
        const connections = state.getWebSockets();
        let closed = 0;

        for (const ws of connections) {
          try {
            ws.close(code || 1000, reason || 'Room closing');
            closed++;
          } catch {
            // Ignore errors when closing
          }
        }

        return success(closed);
      } catch (error) {
        return failure(new Error('Failed to close connections'));
      }
    },

    /**
     * Check if a WebSocket is tracked
     */
    isTracked: (ws: WebSocket): boolean => {
      const connections = state.getWebSockets();
      return connections.includes(ws);
    }
  };
};

/**
 * Type helper for WebSocket manager
 */
export type WebSocketManager = ReturnType<typeof createWebSocketManager>;

/**
 * Broadcast presence update to all connections
 */
export const broadcastPresence = async (
  manager: WebSocketManager
): Promise<Result<void>> => {
  const count = manager.getCount();
  const result = await manager.broadcast({
    type: 'presence',
    data: { count }
  });

  if (!result.success) {
    return failure(result.error);
  }

  return success(undefined);
};
