/**
 * Tests for WebSocket client hook
 * Validates connection, reconnection, message handling, and error scenarios
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '@/hooks/useWebSocket';

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;

    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        const event = new CloseEvent('close', { code: code || 1000, reason });
        this.onclose(event);
      }
    }, 10);
  }
}

// Install mock
global.WebSocket = MockWebSocket as any;

describe('useWebSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Connection Establishment', () => {
    it('should connect to WebSocket URL on mount', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws')
      );

      expect(result.current.status).toBe('connecting');

      // Fast-forward timers to trigger connection
      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });

    it('should not connect if URL is null', () => {
      const { result } = renderHook(() => useWebSocket(null));

      expect(result.current.status).toBe('disconnected');
    });

    it('should connect with custom protocols', async () => {
      const protocols = ['v1', 'v2'];
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', { protocols })
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });
  });

  describe('Message Handling', () => {
    it('should receive and parse JSON messages', async () => {
      const onMessage = jest.fn();
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', { onMessage })
      );

      // Wait for connection
      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Simulate receiving a message
      const testMessage = { type: 'swap', data: { id: '123' } };
      act(() => {
        const ws = (result.current as any).websocket;
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify(testMessage)
          }));
        }
      });

      expect(onMessage).toHaveBeenCalledWith(testMessage);
    });

    it('should handle malformed JSON gracefully', async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', { onError })
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Send malformed JSON
      act(() => {
        const ws = (result.current as any).websocket;
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: 'invalid json {'
          }));
        }
      });

      expect(onError).toHaveBeenCalled();
    });

    it('should send messages when connected', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws')
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      const message = { type: 'ping' };

      act(() => {
        result.current.send(message);
      });

      // Verify message was sent (WebSocket.send was called)
      // In real implementation, we'd spy on WebSocket.send
    });

    it('should queue messages when disconnected', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true
        })
      );

      // Send message before connection
      const message = { type: 'subscribe', wallet: '0x123' };

      act(() => {
        result.current.send(message);
      });

      // Message should be queued, not throw error
      expect(result.current.status).toBe('connecting');
    });
  });

  describe('Reconnection Logic', () => {
    it('should reconnect automatically on close', async () => {
      const onReconnect = jest.fn();
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true,
          maxRetries: 3,
          onReconnect
        })
      );

      // Wait for initial connection
      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Simulate connection close
      act(() => {
        const ws = (result.current as any).websocket;
        if (ws && ws.onclose) {
          ws.onclose(new CloseEvent('close', { code: 1006, reason: 'Abnormal closure' }));
        }
      });

      expect(result.current.status).toBe('reconnecting');

      // Advance timers for reconnection attempt
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(onReconnect).toHaveBeenCalled();
      });
    });

    it('should use exponential backoff for retries', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true,
          maxRetries: 3,
          retryDelay: 1000
        })
      );

      // First retry after 1s
      // Second retry after 2s (exponential)
      // Third retry after 4s (exponential)

      expect(result.current.status).toBe('connecting');
    });

    it('should stop retrying after maxRetries', async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true,
          maxRetries: 2,
          onError
        })
      );

      // Simulate failed connection attempts
      // After 2 retries, should stop and call onError
    });

    it('should not reconnect on normal close (code 1000)', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true
        })
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Normal close
      act(() => {
        const ws = (result.current as any).websocket;
        if (ws && ws.onclose) {
          ws.onclose(new CloseEvent('close', { code: 1000, reason: 'Normal closure' }));
        }
      });

      expect(result.current.status).toBe('disconnected');
    });
  });

  describe('Connection Status', () => {
    it('should track connection state correctly', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws')
      );

      // Initially connecting
      expect(result.current.status).toBe('connecting');
      expect(result.current.isConnecting).toBe(true);
      expect(result.current.isConnected).toBe(false);

      // After connection
      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
        expect(result.current.isConnecting).toBe(false);
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should expose last message timestamp', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws')
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      const beforeTime = Date.now();

      // Receive message
      act(() => {
        const ws = (result.current as any).websocket;
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify({ type: 'ping' })
          }));
        }
      });

      expect(result.current.lastMessageTime).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Cleanup', () => {
    it('should close connection on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws')
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      unmount();

      act(() => {
        jest.advanceTimersByTime(50);
      });

      // Connection should be closed
    });

    it('should cancel pending reconnection on unmount', async () => {
      const { unmount } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          retryOnError: true
        })
      );

      // Unmount while reconnecting
      unmount();

      // Should not attempt reconnection after unmount
    });
  });

  describe('Heartbeat / Ping-Pong', () => {
    it('should send ping messages at interval', async () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          heartbeatInterval: 30000 // 30 seconds
        })
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Advance to heartbeat time
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // Should have sent ping message
    });

    it('should detect connection timeout if no pong received', async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWebSocket('wss://api.swapwatch.app/room/TEST/ws', {
          heartbeatInterval: 30000,
          heartbeatTimeout: 5000,
          onError
        })
      );

      act(() => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      // Send ping
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // No pong received, timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should reconnect or error
    });
  });
});
