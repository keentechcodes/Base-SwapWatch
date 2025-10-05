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

      // Room management endpoints
      if (path.startsWith('/room/')) {
        const roomCode = extractRoomCode(path);

        if (!roomCode) {
          return new Response(JSON.stringify({ error: 'Invalid room code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Get Durable Object stub for this room
        const roomId = env.ROOMS.idFromName(roomCode);
        const roomStub = env.ROOMS.get(roomId);

        // Forward request to Durable Object
        // Type assertion needed due to Cloudflare Workers vs Node.js type differences
        const response = await roomStub.fetch(request as never);

        // Add CORS headers to response
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

      // Webhook endpoint (Coinbase CDP)
      if (path === '/webhook/coinbase' && request.method === 'POST') {
        return await handleCoinbaseWebhook(request, env);
      }

      // List active rooms (for debugging - remove in production)
      if (path === '/rooms' && request.method === 'GET') {
        return new Response(JSON.stringify({ message: 'Room listing not implemented' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
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

    // Query which rooms track this wallet
    // This is a simplified implementation - in production, you'd maintain an index in KV
    // For now, we'll need the frontend to call the Worker with the room code explicitly
    // or maintain a reverse index: wallet -> [roomCodes] in KV

    // TODO: Implement proper room index lookup
    // For MVP, rooms will be notified via direct RPC calls when wallet is added

    return new Response(JSON.stringify({
      status: 'received',
      walletAddress,
      message: 'Webhook processed',
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
