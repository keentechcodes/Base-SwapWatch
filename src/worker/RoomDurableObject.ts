/**
 * Thin Durable Object wrapper - Platform requirement
 * ALL business logic extracted to pure functions
 * This class is just a routing layer
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env } from './types';
import { createStorageOps } from './room/storage-ops';
import { createWebSocketManager } from './room/websocket-manager';
import { createRequestHandlers } from './room/request-handlers';
import type {
  AddWalletRequest,
  UpdateWalletRequest,
  UpdateConfigRequest,
  CreateRoomRequest,
  ExtendRoomRequest,
  HasWalletRequest,
  NotifySwapRequest
} from './types';

/**
 * RoomDurableObject - Minimal class wrapper
 * Delegates all logic to functional modules
 */
export class RoomDurableObject {
  private state: DurableObjectState;
  private handlers: ReturnType<typeof createRequestHandlers>;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;

    // Initialize functional modules with DI
    const storage = createStorageOps(state.storage);
    const websocket = createWebSocketManager();
    this.handlers = createRequestHandlers({ storage, websocket });
  }

  /**
   * Main request handler - Just routing, no business logic
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // WebSocket upgrade handling
      if (request.headers.get('Upgrade') === 'websocket') {
        return await this.handleWebSocketUpgrade(request);
      }

      // Route to appropriate handler
      if (path === '/room/create' && method === 'POST') {
        const body = await request.json() as CreateRoomRequest;
        const result = await this.handlers.createRoom(body);
        return this.toResponse(result, 201);
      }

      if (path === '/room/extend' && method === 'POST') {
        const body = await request.json() as ExtendRoomRequest;
        const result = await this.handlers.extendRoom(body);
        return this.toResponse(result);
      }

      if (path === '/wallets' && method === 'GET') {
        const result = await this.handlers.getWallets();
        return this.toResponse(result);
      }

      if (path === '/labels' && method === 'GET') {
        const result = await this.handlers.getLabels();
        return this.toResponse(result);
      }

      if (path === '/wallets' && method === 'POST') {
        const body = await request.json() as AddWalletRequest;
        const result = await this.handlers.addWallet(body);
        return this.toResponse(result, 201);
      }

      if (path.startsWith('/wallets/') && method === 'DELETE') {
        const address = path.split('/wallets/')[1];
        const result = await this.handlers.removeWallet(address);
        return this.toResponse(result);
      }

      if (path.startsWith('/wallets/') && method === 'PATCH') {
        const address = path.split('/wallets/')[1];
        const body = await request.json() as UpdateWalletRequest;
        const result = await this.handlers.updateWallet(address, body);
        return this.toResponse(result);
      }

      if (path === '/config' && method === 'GET') {
        const result = await this.handlers.getConfig();
        return this.toResponse(result);
      }

      if (path === '/config' && method === 'PUT') {
        const body = await request.json() as UpdateConfigRequest;
        const result = await this.handlers.updateConfig(body);
        return this.toResponse(result);
      }

      if (path === '/presence' && method === 'GET') {
        const result = this.handlers.getPresence();
        return this.toResponse(result);
      }

      // RPC endpoints
      if (path === '/rpc/has-wallet' && method === 'POST') {
        const body = await request.json() as HasWalletRequest;
        const result = await this.handlers.hasWallet(body);
        return this.toResponse(result);
      }

      if (path === '/rpc/notify-swap' && method === 'POST') {
        const body = await request.json() as NotifySwapRequest;
        const result = await this.handlers.notifySwap(body);
        return this.toResponse(result);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  /**
   * Alarm handler for room expiration
   */
  async alarm(): Promise<void> {
    await this.handlers.cleanup();
  }

  /**
   * WebSocket message handler
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      if (typeof message === 'string') {
        const data = JSON.parse(message);

        // Handle ping - respond with pong
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Handle get_room_data request
        if (data.type === 'get_room_data') {
          const walletsResult = await this.handlers.getWallets();
          const labelsResult = await this.handlers.getLabels();
          const presenceResult = this.handlers.getPresence();

          ws.send(JSON.stringify({
            type: 'room_data',
            data: {
              wallets: walletsResult.success ? walletsResult.data.map(w => w.address) : [],
              labels: labelsResult.success ? labelsResult.data : {},
              presence: presenceResult.success ? presenceResult.data : { count: 0 }
            }
          }));
          return;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  /**
   * WebSocket close handler
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    await this.handlers.handleWebSocketDisconnect(ws);
  }

  /**
   * WebSocket error handler
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    await this.handlers.handleWebSocketDisconnect(ws);
  }

  // Private helper methods

  /**
   * Handle WebSocket upgrade using Cloudflare Durable Object WebSocket API
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // Create a WebSocket pair (client and server)
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the server WebSocket and register it with the Durable Object
    // This enables the webSocketMessage, webSocketClose, and webSocketError handlers
    this.state.acceptWebSocket(server);

    // Store the WebSocket connection
    await this.handlers.handleWebSocketConnect(server);

    // Return the client WebSocket to the browser
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  /**
   * Convert Result<T> to HTTP Response
   */
  private toResponse<T>(result: { success: boolean; data?: T; error?: Error }, status: number = 200): Response {
    if (result.success) {
      return new Response(JSON.stringify(result.data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const errorStatus = this.getErrorStatus(result.error);
    return new Response(JSON.stringify({
      error: result.error?.message || 'Unknown error'
    }), {
      status: errorStatus,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Convert error to HTTP Response
   */
  private toErrorResponse(error: unknown): Response {
    const message = error instanceof Error ? error.message : 'Internal server error';

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get HTTP status code from error
   */
  private getErrorStatus(error?: Error): number {
    if (!error) return 500;

    // Check error name for custom error classes
    if (error.name === 'ValidationError') return 400;
    if (error.name === 'ConflictError') return 409;
    if (error.name === 'NotFoundError') return 404;

    return 500;
  }
}
