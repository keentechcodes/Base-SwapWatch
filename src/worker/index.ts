import { RoomDurableObject } from './RoomDurableObject';
import type { Env } from './types';

/**
 * Main Worker entry point
 * Handles routing and creates Durable Object stubs
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS headers for frontend communication
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      // Health check endpoint
      if (path === '/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Handle /rooms (plural) endpoints - frontend uses these
      if (path.startsWith('/rooms')) {
        const method = request.method;

        // POST /rooms - Create new room
        if (path === '/rooms' && method === 'POST') {
          const body = await request.json() as any;
          const roomCode = body.code;

          if (!roomCode) {
            return new Response(JSON.stringify({ error: 'Missing room code' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }

          const roomId = env.ROOMS.idFromName(roomCode);
          const roomStub = env.ROOMS.get(roomId);

          // Create room in Durable Object using correct endpoint
          const createRequest = new Request('https://internal/room/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: roomCode,
              createdBy: body.createdBy || 'anonymous',
              config: body.config || {}
            }),
          });

          const response = await roomStub.fetch(createRequest as never);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        // GET /rooms/{code} - Get room data
        const roomsMatch = path.match(/^\/rooms\/([a-zA-Z0-9-]+)$/);
        if (roomsMatch && method === 'GET') {
          const roomCode = roomsMatch[1];
          const roomId = env.ROOMS.idFromName(roomCode);
          const roomStub = env.ROOMS.get(roomId);

          // Get all room data components including labels
          const [walletsResp, configResp, presenceResp, labelsResp] = await Promise.all([
            roomStub.fetch(new Request('https://internal/wallets', { method: 'GET' }) as never),
            roomStub.fetch(new Request('https://internal/config', { method: 'GET' }) as never),
            roomStub.fetch(new Request('https://internal/presence', { method: 'GET' }) as never),
            roomStub.fetch(new Request('https://internal/labels', { method: 'GET' }) as never),
          ]);

          const walletsData = await walletsResp.json();
          const config = await configResp.json();
          const presence = await presenceResp.json();
          const labels = await labelsResp.json();

          // Extract just wallet addresses from walletsData (array of {address, label?})
          const walletAddresses = Array.isArray(walletsData)
            ? walletsData.map(w => typeof w === 'string' ? w : w.address)
            : [];

          // Combine into room response format
          const roomData = {
            code: roomCode,
            wallets: walletAddresses,
            labels: labels || {},
            createdAt: config?.createdAt || new Date().toISOString(),
            presence: presence || { count: 0 }
          };

          return new Response(JSON.stringify(roomData), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // POST /rooms/{code}/wallets - Add wallet
        const walletsPostMatch = path.match(/^\/rooms\/([a-zA-Z0-9-]+)\/wallets$/);
        if (walletsPostMatch && method === 'POST') {
          const roomCode = walletsPostMatch[1];
          const body = await request.json() as any;

          const roomId = env.ROOMS.idFromName(roomCode);
          const roomStub = env.ROOMS.get(roomId);

          const addRequest = new Request('https://internal/wallets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: body.wallet || body.address,
              label: body.label
            }),
          });

          const response = await roomStub.fetch(addRequest as never);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        // DELETE /rooms/{code}/wallets/{wallet} - Remove wallet
        const deleteMatch = path.match(/^\/rooms\/([a-zA-Z0-9-]+)\/wallets\/([^/]+)$/);
        if (deleteMatch && method === 'DELETE') {
          const [, roomCode, walletAddress] = deleteMatch;
          const roomId = env.ROOMS.idFromName(roomCode);
          const roomStub = env.ROOMS.get(roomId);

          const deleteRequest = new Request(`https://internal/wallets/${walletAddress}`, {
            method: 'DELETE',
          });

          const response = await roomStub.fetch(deleteRequest as never);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        // If no /rooms route matched, fall through to /room handler
      }

      // Room management endpoints (legacy /room/ singular routes)
      if (path.startsWith('/room/')) {
        const roomCode = extractRoomCode(path);
        const method = request.method;

        if (!roomCode) {
          return new Response(JSON.stringify({ error: 'Invalid room code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Import room API handlers
        const { handleAddWallet, handleRemoveWallet, handleCreateRoom } = await import('./room-api');

        // Special handling for wallet operations to maintain index
        if (path.includes('/wallets') && method === 'POST') {
          const body = await request.json() as any;
          const response = await handleAddWallet(env, roomCode, body.address);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        if (path.match(/\/wallets\/[^/]+$/) && method === 'DELETE') {
          const walletAddress = path.split('/wallets/')[1];
          const response = await handleRemoveWallet(env, roomCode, walletAddress);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        if (path.endsWith('/create') && method === 'POST') {
          const body = await request.json() as any;
          const response = await handleCreateRoom(env, roomCode, body);
          return addCorsHeaders(response as unknown as Response, corsHeaders);
        }

        // For other room operations, forward directly to Durable Object
        const roomId = env.ROOMS.idFromName(roomCode);
        const roomStub = env.ROOMS.get(roomId);
        const response = await roomStub.fetch(request as never);

        // Don't modify WebSocket upgrade responses - return as-is
        if (response.status === 101) {
          return response;
        }

        return addCorsHeaders(response as unknown as Response, corsHeaders);
      }

      // Webhook endpoint (Coinbase CDP)
      if (path === '/webhook/coinbase' && request.method === 'POST') {
        return await handleCoinbaseWebhook(request, env);
      }

      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders,
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * Extract room code from URL path
 * Examples:
 *   /room/ABC123/ws -> ABC123
 *   /room/ABC123/wallets -> ABC123
 *   /room/ABC123 -> ABC123
 */
function extractRoomCode(path: string): string | null {
  const match = path.match(/^\/room\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Add CORS headers to a response
 */
function addCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
  const responseHeaders = new Headers();
  response.headers.forEach((value: string, key: string) => {
    responseHeaders.set(key, value);
  });

  Object.entries(corsHeaders).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

/**
 * Handle Coinbase webhook and broadcast to relevant rooms
 */
async function handleCoinbaseWebhook(request: Request, env: Env): Promise<Response> {
  try {
    // Verify webhook signature
    const signature = request.headers.get('x-webhook-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.text();
    const isValid = await verifyWebhookSignature(body, signature, env.COINBASE_WEBHOOK_SECRET);

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(body);

    // Extract wallet address from event
    const walletAddress = extractWalletAddress(event);
    if (!walletAddress) {
      return new Response(JSON.stringify({ status: 'ignored', message: 'No wallet address found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Import wallet index functions
    const { getRoomsForWallet } = await import('./wallet-index');

    // Find all rooms tracking this wallet
    const roomCodes = await getRoomsForWallet(env.ROOM_INDEX, walletAddress);

    if (roomCodes.length === 0) {
      return new Response(JSON.stringify({
        status: 'ignored',
        walletAddress,
        message: 'No rooms tracking this wallet',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Notify each room about the swap event
    const notifications = await Promise.all(
      roomCodes.map(async (roomCode) => {
        try {
          const roomId = env.ROOMS.idFromName(roomCode);
          const roomStub = env.ROOMS.get(roomId);

          // Send swap event to room via RPC
          const notifyRequest = new Request('https://internal/rpc/notify-swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, walletAddress }),
          });

          await roomStub.fetch(notifyRequest as never);
          return { roomCode, status: 'notified' };
        } catch (error) {
          console.error(`Failed to notify room ${roomCode}:`, error);
          return { roomCode, status: 'failed', error };
        }
      })
    );

    return new Response(JSON.stringify({
      status: 'processed',
      walletAddress,
      roomsNotified: notifications.filter(n => n.status === 'notified').length,
      totalRooms: roomCodes.length,
      details: notifications,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Verify Coinbase webhook signature using HMAC-SHA256
 */
async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computedSignature === signature.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Extract wallet address from Coinbase webhook event
 */
function extractWalletAddress(event: any): string | null {
  // Extract from various event types
  if (event.from) return event.from;
  if (event.to) return event.to;
  if (event.walletAddress) return event.walletAddress;
  if (event.addresses && event.addresses.length > 0) return event.addresses[0];

  return null;
}

// Export Durable Object class
export { RoomDurableObject };
