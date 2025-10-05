/**
 * CDP Webhook Manager
 * Manages dynamic wallet filters for Coinbase Developer Platform webhooks
 */

import type { KVNamespace } from '@cloudflare/workers-types';

export interface WebhookConfig {
  webhookId: string;
  apiKeyName: string;
  apiKeyPrivateKey: string;
}

export interface WebhookUpdateRequest {
  walletAddresses: string[];
}

/**
 * Update CDP webhook filters with current tracked wallets
 * This is called when wallets are added/removed from rooms
 */
export async function updateWebhookFilters(
  kv: KVNamespace,
  config: WebhookConfig
): Promise<void> {
  try {
    // Get all unique wallets being tracked across all rooms
    const allWallets = await getAllTrackedWallets(kv);

    if (allWallets.length === 0) {
      console.log('No wallets to track, webhook filters not updated');
      return;
    }

    // CDP API endpoint for updating webhook
    const apiUrl = `https://api.developer.coinbase.com/webhooks/${config.webhookId}`;

    // Prepare the update payload
    const payload = {
      filters: {
        addresses: allWallets.map(w => w.toLowerCase())
      }
    };

    // Create CDP API headers
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKeyName,
      'X-API-Secret': config.apiKeyPrivateKey,
    };

    // Update webhook via CDP API
    const response = await fetch(apiUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CDP API error: ${response.status} - ${error}`);
    }

    console.log(`Updated webhook filters with ${allWallets.length} wallets`);
  } catch (error) {
    console.error('Failed to update webhook filters:', error);
    // Don't throw - we want the room operation to succeed even if filter update fails
  }
}

/**
 * Get all unique wallet addresses being tracked across all rooms
 */
async function getAllTrackedWallets(kv: KVNamespace): Promise<string[]> {
  // List all wallet entries in KV
  const walletKeys = await kv.list({ prefix: 'wallet:' });

  const uniqueWallets = new Set<string>();

  for (const key of walletKeys.keys) {
    // Extract wallet address from key (wallet:0x123... -> 0x123...)
    const walletAddress = key.key.replace('wallet:', '');
    uniqueWallets.add(walletAddress);
  }

  return Array.from(uniqueWallets);
}

/**
 * Trigger webhook filter update when wallet is added to a room
 */
export async function onWalletAdded(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string,
  config?: WebhookConfig
): Promise<void> {
  // First, update the index
  const { addWalletToRoom } = await import('./wallet-index');
  await addWalletToRoom(kv, walletAddress, roomCode);

  // Then update CDP webhook if config is provided
  if (config) {
    await updateWebhookFilters(kv, config);
  }
}

/**
 * Trigger webhook filter update when wallet is removed from a room
 */
export async function onWalletRemoved(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string,
  config?: WebhookConfig
): Promise<void> {
  // First, update the index
  const { removeWalletFromRoom } = await import('./wallet-index');
  await removeWalletFromRoom(kv, walletAddress, roomCode);

  // Then update CDP webhook if config is provided
  if (config) {
    await updateWebhookFilters(kv, config);
  }
}

/**
 * Get webhook configuration from environment
 * In production, these would be Worker secrets
 */
export function getWebhookConfig(env: any): WebhookConfig | undefined {
  if (!env.CDP_WEBHOOK_ID || !env.CDP_API_KEY_NAME || !env.CDP_API_KEY_PRIVATE_KEY) {
    console.log('CDP webhook configuration not found, filter updates disabled');
    return undefined;
  }

  return {
    webhookId: env.CDP_WEBHOOK_ID,
    apiKeyName: env.CDP_API_KEY_NAME,
    apiKeyPrivateKey: env.CDP_API_KEY_PRIVATE_KEY,
  };
}