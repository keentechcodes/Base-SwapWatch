/**
 * WebSocket manager factory with encapsulated session state
 * Following functional closure pattern for state management
 */

import { Result, success, failure } from '../../services/types';
import type { WebSocketMessage } from '../types';

/**
 * WebSocket manager factory
 * Manages WebSocket sessions with private state in closure
 */
export const createWebSocketManager = () => {
  // Private state - encapsulated in closure
  const sessions = new Set<WebSocket>();

  return {
    /**
     * Track a new WebSocket connection
     */
    track: (ws: WebSocket): Result<void> => {
      try {
        sessions.add(ws);
        return success(undefined);
      } catch (error) {
        return failure(new Error('Failed to track WebSocket'));
      }
    },

    /**
     * Untrack a WebSocket connection
     */
    untrack: (ws: WebSocket): Result<void> => {
      try {
        sessions.delete(ws);
        return success(undefined);
      } catch (error) {
        return failure(new Error('Failed to untrack WebSocket'));
      }
    },

    /**
     * Broadcast message to all connected sessions
     */
    broadcast: async (message: WebSocketMessage): Promise<Result<number>> => {
      try {
        const payload = JSON.stringify(message);
        let delivered = 0;
        const failed: WebSocket[] = [];

        for (const ws of sessions) {
          try {
            ws.send(payload);
            delivered++;
          } catch (error) {
            // Mark for removal if send fails
            failed.push(ws);
          }
        }

        // Clean up failed connections
        for (const ws of failed) {
          sessions.delete(ws);
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
        // Remove failed connection
        sessions.delete(ws);
        return failure(new Error('Failed to send message'));
      }
    },

    /**
     * Get current connection count
     */
    getCount: (): number => {
      return sessions.size;
    },

    /**
     * Close all connections
     */
    closeAll: (code?: number, reason?: string): Result<number> => {
      try {
        let closed = 0;

        for (const ws of sessions) {
          try {
            ws.close(code || 1000, reason || 'Room closing');
            closed++;
          } catch {
            // Ignore errors when closing
          }
        }

        sessions.clear();
        return success(closed);
      } catch (error) {
        return failure(new Error('Failed to close connections'));
      }
    },

    /**
     * Check if a WebSocket is tracked
     */
    isTracked: (ws: WebSocket): boolean => {
      return sessions.has(ws);
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
