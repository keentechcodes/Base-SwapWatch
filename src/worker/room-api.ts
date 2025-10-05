/**
 * Room API handlers that manage wallet index and CDP webhook filters
 */

import type { Env } from './types';
import { onWalletAdded, onWalletRemoved, getWebhookConfig } from './cdp-webhook-manager';

/**
 * Handle wallet addition to room
 * Updates both KV index and CDP webhook filters
 */
export async function handleAddWallet(
  env: Env,
  roomCode: string,
  walletAddress: string
): Promise<Response> {
  try {
    // Get Durable Object stub
    const roomId = env.ROOMS.idFromName(roomCode);
    const roomStub = env.ROOMS.get(roomId);

    // Forward request to Durable Object
    const request = new Request('https://internal/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress }),
    });

    const response = await roomStub.fetch(request as never);

    // If successful, update indices
    if (response.ok) {
      const webhookConfig = getWebhookConfig(env);
      await onWalletAdded(env.ROOM_INDEX, walletAddress, roomCode, webhookConfig);
    }

    return response;
  } catch (error) {
    console.error('Failed to add wallet:', error);
    return new Response(JSON.stringify({ error: 'Failed to add wallet' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle wallet removal from room
 * Updates both KV index and CDP webhook filters
 */
export async function handleRemoveWallet(
  env: Env,
  roomCode: string,
  walletAddress: string
): Promise<Response> {
  try {
    // Get Durable Object stub
    const roomId = env.ROOMS.idFromName(roomCode);
    const roomStub = env.ROOMS.get(roomId);

    // Forward request to Durable Object
    const request = new Request(`https://internal/wallets/${walletAddress}`, {
      method: 'DELETE',
    });

    const response = await roomStub.fetch(request as never);

    // If successful, update indices
    if (response.ok) {
      const webhookConfig = getWebhookConfig(env);
      await onWalletRemoved(env.ROOM_INDEX, walletAddress, roomCode, webhookConfig);
    }

    return response;
  } catch (error) {
    console.error('Failed to remove wallet:', error);
    return new Response(JSON.stringify({ error: 'Failed to remove wallet' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle room creation
 * Initializes room in Durable Object
 */
export async function handleCreateRoom(
  env: Env,
  roomCode: string,
  config: any
): Promise<Response> {
  try {
    // Get Durable Object stub
    const roomId = env.ROOMS.idFromName(roomCode);
    const roomStub = env.ROOMS.get(roomId);

    // Forward request to Durable Object
    const request = new Request('https://internal/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    return await roomStub.fetch(request as never);
  } catch (error) {
    console.error('Failed to create room:', error);
    return new Response(JSON.stringify({ error: 'Failed to create room' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Clean up room when it expires
 * Removes all wallet indices and updates CDP webhook
 */
export async function handleRoomCleanup(
  env: Env,
  roomCode: string
): Promise<void> {
  try {
    const { cleanupRoomIndex } = await import('./wallet-index');
    await cleanupRoomIndex(env.ROOM_INDEX, roomCode);

    // Update CDP webhook filters after cleanup
    const webhookConfig = getWebhookConfig(env);
    if (webhookConfig) {
      const { updateWebhookFilters } = await import('./cdp-webhook-manager');
      await updateWebhookFilters(env.ROOM_INDEX, webhookConfig);
    }
  } catch (error) {
    console.error('Failed to cleanup room:', error);
  }
}