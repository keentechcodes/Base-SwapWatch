/**
 * RoomDurableObject - Thin wrapper around business logic
 * Follows Hybrid Architecture Standard: Minimal class, delegates to pure functions
 *
 * This class exists only because Cloudflare requires Durable Objects to be classes.
 * All business logic lives in /room/* as pure functions.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env, RoomError } from './types';
import { createStorageOperations } from './room/storage';
import { createWebSocketManager } from './room/websocket';
import { createRoomHandlers } from './room/handlers';
import { createRpcHandlers } from './room/rpc';

/**
 * Minimal Durable Object class - thin orchestration layer
 */
export class RoomDurableObject {
  private state: DurableObjectState;
  private handlers: ReturnType<typeof createRoomHandlers>;
  private rpcHandlers: ReturnType<typeof createRpcHandlers>;
  private websocketManager: ReturnType<typeof createWebSocketManager>;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;

    // Initialize pure function modules
    const storage = createStorageOperations(state.storage);
    this.websocketManager = createWebSocketManager();

    this.handlers = createRoomHandlers({
      storage,
      websocket: this.websocketManager,
      setAlarm: (time: number) => state.storage.setAlarm(time),
    });

    this.rpcHandlers = createRpcHandlers({
      storage,
      websocket: this.websocketManager,
    });
  }

  /**
   * Main request handler - thin routing layer
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // WebSocket upgrade
      if (request.headers.get('Upgrade') === 'websocket') {
        return this.handleWebSocketUpgrade();
      }

      // Room management
      if (path.startsWith('/room/create') && request.method === 'POST') {
        const body = (await request.json()) as any;
        const result = await this.handlers.createRoom(body);
        return this.toResponse(result, 201);
      }

      if (path.startsWith('/room/extend') && request.method === 'POST') {
        const body = (await request.json()) as any;
        const result = await this.handlers.extendRoom(body.hours);
        return this.toResponse(result);
      }

      // Wallet operations
      if (path === '/wallets' && request.method === 'GET') {
        const result = await this.handlers.getWallets();
        return this.toResponse(result);
      }

      if (path === '/wallets' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const result = await this.handlers.addWallet(body);
        return this.toResponse(result, 201);
      }

      if (path.startsWith('/wallets/') && request.method === 'DELETE') {
        const address = path.split('/wallets/')[1];
        const result = await this.handlers.removeWallet(address);
        return this.toResponse(result);
      }

      if (path.startsWith('/wallets/') && request.method === 'PATCH') {
        const address = path.split('/wallets/')[1];
        const body = (await request.json()) as any;
        const result = await this.handlers.updateWallet(address, body);
        return this.toResponse(result);
      }

      // Configuration
      if (path === '/config' && request.method === 'GET') {
        const result = await this.handlers.getConfig();
        return this.toResponse(result);
      }

      if (path === '/config' && request.method === 'PUT') {
        const body = (await request.json()) as any;
        const result = await this.handlers.updateConfig(body);
        return this.toResponse(result);
      }

      // Presence
      if (path === '/presence' && request.method === 'GET') {
        const result = this.handlers.getPresence();
        return this.toResponse(result);
      }

      // RPC methods
      if (path === '/rpc/has-wallet' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const result = await this.rpcHandlers.hasWallet(body);
        return this.toResponse(result);
      }

      if (path === '/rpc/notify-swap' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const result = await this.rpcHandlers.notifySwap(body);
        return this.toResponse(result);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Alarm handler - cleanup expired rooms
   */
  async alarm(): Promise<void> {
    console.log('Room alarm fired - cleaning up expired room');

    // Close all WebSocket connections
    this.websocketManager.closeAll(1000, 'Room expired');

    // Delete all storage
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
  }

  /**
   * WebSocket message handler
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;

      // Handle ping/pong for keepalive
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  /**
   * WebSocket close handler
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    this.websocketManager.removeSession(ws);
    const presenceMessage = { type: 'presence', data: { count: this.websocketManager.getSessionCount() } };
    this.websocketManager.broadcast(presenceMessage as any);
  }

  /**
   * WebSocket error handler
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    this.websocketManager.removeSession(ws);
  }

  // Private helper methods

  /**
   * Handle WebSocket upgrade (placeholder for actual Cloudflare runtime)
   */
  private handleWebSocketUpgrade(): Response {
    // In actual Cloudflare Workers runtime:
    // const pair = new WebSocketPair();
    // const [client, server] = Object.values(pair);
    // this.state.acceptWebSocket(server);
    // this.websocketManager.addSession(server);
    // return new Response(null, { status: 101, webSocket: client });

    return new Response('WebSocket upgrade not available in this environment', {
      status: 101,
    });
  }

  /**
   * Convert Result to HTTP Response
   */
  private toResponse(result: any, successStatus = 200): Response {
    if (result.success) {
      return new Response(JSON.stringify(result.data), {
        status: successStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const error = result.error as RoomError;
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.details,
      }),
      {
        status: error.statusCode || 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Handle unexpected errors
   */
  private handleError(error: unknown): Response {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
