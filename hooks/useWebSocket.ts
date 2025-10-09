/**
 * WebSocket hook for real-time communication with Cloudflare Workers
 * Handles connection, reconnection, message queuing, and heartbeat
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export type WebSocketStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface UseWebSocketOptions {
  /** Protocols to use for WebSocket connection */
  protocols?: string | string[];

  /** Whether to automatically reconnect on error */
  retryOnError?: boolean;

  /** Maximum number of reconnection attempts (default: 5) */
  maxRetries?: number;

  /** Initial delay between retries in ms (default: 1000) */
  retryDelay?: number;

  /** Interval for sending heartbeat pings in ms (default: 30000) */
  heartbeatInterval?: number;

  /** Timeout for heartbeat response in ms (default: 5000) */
  heartbeatTimeout?: number;

  /** Callback when message received */
  onMessage?: (message: WebSocketMessage) => void;

  /** Callback when connection opens */
  onOpen?: () => void;

  /** Callback when connection closes */
  onClose?: (event: CloseEvent) => void;

  /** Callback when error occurs */
  onError?: (error: Event | Error) => void;

  /** Callback when reconnection attempt starts */
  onReconnect?: (attempt: number) => void;
}

export interface UseWebSocketReturn {
  /** Current connection status */
  status: WebSocketStatus;

  /** Whether currently connecting */
  isConnecting: boolean;

  /** Whether connected */
  isConnected: boolean;

  /** Send a message through the WebSocket */
  send: (message: WebSocketMessage) => void;

  /** Manually close the connection */
  close: () => void;

  /** Manually reconnect */
  reconnect: () => void;

  /** Timestamp of last received message */
  lastMessageTime: number | null;

  /** Current retry attempt number */
  retryCount: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseWebSocketOptions, 'onMessage' | 'onOpen' | 'onClose' | 'onError' | 'onReconnect' | 'protocols'>> = {
  retryOnError: true,
  maxRetries: 5,
  retryDelay: 1000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 5000,
};

export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const shouldReconnectRef = useRef(true);

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Send heartbeat ping
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));

        // Set timeout for pong response
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
        }

        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('[WebSocket] Heartbeat timeout - no pong received');
          // Reconnect on heartbeat timeout
          if (wsRef.current) {
            wsRef.current.close();
          }
        }, opts.heartbeatTimeout);
      } catch (error) {
        console.error('[WebSocket] Error sending heartbeat:', error);
      }
    }
  }, [opts.heartbeatTimeout]);

  // Start heartbeat interval
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, opts.heartbeatInterval);

    // Send initial heartbeat
    sendHeartbeat();
  }, [opts.heartbeatInterval, sendHeartbeat]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!url) {
      setStatus('disconnected');
      return;
    }

    try {
      setStatus('connecting');

      const ws = new WebSocket(url, opts.protocols);

      ws.onopen = () => {
        console.log('[WebSocket] Connected:', url);
        setStatus('connected');
        setRetryCount(0);
        shouldReconnectRef.current = true;

        // Start heartbeat
        startHeartbeat();

        // Send queued messages
        if (messageQueueRef.current.length > 0) {
          console.log(`[WebSocket] Sending ${messageQueueRef.current.length} queued messages`);
          messageQueueRef.current.forEach(msg => {
            try {
              ws.send(JSON.stringify(msg));
            } catch (error) {
              console.error('[WebSocket] Error sending queued message:', error);
            }
          });
          messageQueueRef.current = [];
        }

        options.onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessageTime(Date.now());

          // Handle pong response
          if (message.type === 'pong') {
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            return;
          }

          options.onMessage?.(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
          options.onError?.(error as Error);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setStatus('error');
        options.onError?.(event);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        clearTimers();

        options.onClose?.(event);

        // Don't reconnect on normal closure (code 1000) or if explicitly disabled
        if (event.code === 1000 || !shouldReconnectRef.current) {
          setStatus('disconnected');
          return;
        }

        // Attempt reconnection if enabled
        if (opts.retryOnError && retryCount < opts.maxRetries) {
          const nextRetryCount = retryCount + 1;
          setRetryCount(nextRetryCount);
          setStatus('reconnecting');

          // Exponential backoff: delay * 2^retryCount
          const delay = opts.retryDelay * Math.pow(2, retryCount);

          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${nextRetryCount}/${opts.maxRetries})`);

          options.onReconnect?.(nextRetryCount);

          retryTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setStatus('disconnected');
          if (retryCount >= opts.maxRetries) {
            console.error('[WebSocket] Max retries reached');
            options.onError?.(new Error('Max reconnection attempts reached'));
          }
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setStatus('error');
      options.onError?.(error as Error);
    }
  }, [url, opts, retryCount, options, clearTimers, startHeartbeat]);

  // Send message
  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error);
        options.onError?.(error as Error);
      }
    } else {
      // Queue message if not connected
      console.log('[WebSocket] Queueing message (not connected)');
      messageQueueRef.current.push(message);
    }
  }, [options]);

  // Close connection
  const close = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Normal closure');
      wsRef.current = null;
    }

    setStatus('disconnected');
  }, [clearTimers]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    close();
    setRetryCount(0);
    shouldReconnectRef.current = true;
    connect();
  }, [close, connect]);

  // Connect on mount or URL change
  useEffect(() => {
    if (url) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [url]); // Only reconnect when URL changes

  return {
    status,
    isConnecting: status === 'connecting' || status === 'reconnecting',
    isConnected: status === 'connected',
    send,
    close,
    reconnect,
    lastMessageTime,
    retryCount,
  };
}
