/**
 * Request handler factory for room operations
 * Following factory pattern with dependency injection
 */

import { Result, success, failure } from '../../services/types';
import type { StorageOps } from './storage-ops';
import type { WebSocketManager } from './websocket-manager';
import { broadcastPresence } from './websocket-manager';
import {
  validateWalletAddress,
  validateWalletLabel,
  validateThreshold,
  validateTelegramWebhook,
  validateExtensionHours,
  validateWalletLimit,
  validateWalletExists,
  validateWalletNotExists
} from './validators';
import { formatSwapMessage, createTelegramPayload, meetsThreshold } from './telegram-formatter';
import type {
  AddWalletRequest,
  UpdateWalletRequest,
  UpdateConfigRequest,
  CreateRoomRequest,
  ExtendRoomRequest,
  HasWalletRequest,
  HasWalletResponse,
  NotifySwapRequest,
  NotifySwapResponse,
  RoomConfig
} from '../types';
import { VALIDATION, TIME } from '../types';

/**
 * Dependencies for request handlers
 */
export interface HandlerDependencies {
  storage: StorageOps;
  websocket: WebSocketManager;
}

/**
 * Create request handlers with injected dependencies
 */
export const createRequestHandlers = (deps: HandlerDependencies) => {
  const { storage, websocket } = deps;

  return {
    /**
     * Create a new room
     */
    createRoom: async (request: CreateRoomRequest): Promise<Result<RoomConfig>> => {
      // Validate threshold if provided
      if (request.threshold !== undefined) {
        const thresholdResult = validateThreshold(request.threshold);
        if (!thresholdResult.success) return thresholdResult;
      }

      // Validate telegram webhook if provided
      if (request.telegramWebhook) {
        const webhookResult = validateTelegramWebhook(request.telegramWebhook);
        if (!webhookResult.success) return webhookResult;
      }

      const now = Date.now();
      const expiresAt = now + VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS * TIME.MILLISECONDS_PER_HOUR;

      const config: RoomConfig = {
        createdAt: now,
        expiresAt,
        createdBy: request.createdBy,
        threshold: request.threshold,
        telegramWebhook: request.telegramWebhook
      };

      // Initialize storage
      const walletsResult = await storage.setConfig(config);
      if (!walletsResult.success) return walletsResult;

      await storage.addWallet(''); // Initialize empty wallet list
      await storage.removeWallet(''); // Remove placeholder

      // Set expiration alarm
      await storage.setAlarm(expiresAt);

      return success(config);
    },

    /**
     * Extend room lifetime
     */
    extendRoom: async (request: ExtendRoomRequest): Promise<Result<{ expiresAt: number }>> => {
      const hoursResult = validateExtensionHours(request.hours);
      if (!hoursResult.success) return hoursResult;

      const hours = hoursResult.data;
      const newExpiresAt = Date.now() + hours * TIME.MILLISECONDS_PER_HOUR;

      const updateResult = await storage.updateConfig({ expiresAt: newExpiresAt });
      if (!updateResult.success) return updateResult;

      await storage.setAlarm(newExpiresAt);

      return success({ expiresAt: newExpiresAt });
    },

    /**
     * Add wallet to room
     */
    addWallet: async (request: AddWalletRequest): Promise<Result<void>> => {
      // Validate address
      const addressResult = validateWalletAddress(request.address);
      if (!addressResult.success) return addressResult;

      const address = addressResult.data;

      // Validate label
      const labelResult = validateWalletLabel(request.label);
      if (!labelResult.success) return labelResult;

      const label = labelResult.data;

      // Get current wallets
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const wallets = walletsResult.data;

      // Check duplicate
      const duplicateCheck = validateWalletNotExists(wallets, address);
      if (!duplicateCheck.success) return duplicateCheck;

      // Check limit
      const limitCheck = validateWalletLimit(wallets.length);
      if (!limitCheck.success) return limitCheck;

      // Add wallet
      const addResult = await storage.addWallet(address);
      if (!addResult.success) return addResult;

      // Set label if provided
      if (label) {
        await storage.setLabel(address, label);
      }

      // Broadcast to WebSocket clients
      await websocket.broadcast({
        type: 'wallet_added',
        data: { address, label }
      });

      return success(undefined);
    },

    /**
     * Remove wallet from room
     */
    removeWallet: async (address: string): Promise<Result<void>> => {
      // Validate address
      const addressResult = validateWalletAddress(address);
      if (!addressResult.success) return addressResult;

      const validAddress = addressResult.data;

      // Get current wallets
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const wallets = walletsResult.data;

      // Check exists
      const existsCheck = validateWalletExists(wallets, validAddress);
      if (!existsCheck.success) return existsCheck;

      // Remove wallet
      const removeResult = await storage.removeWallet(validAddress);
      if (!removeResult.success) return removeResult;

      // Remove label
      await storage.setLabel(validAddress, undefined);

      // Broadcast to WebSocket clients
      await websocket.broadcast({
        type: 'wallet_removed',
        data: { address: validAddress }
      });

      return success(undefined);
    },

    /**
     * Update wallet label
     */
    updateWallet: async (address: string, request: UpdateWalletRequest): Promise<Result<void>> => {
      // Validate address
      const addressResult = validateWalletAddress(address);
      if (!addressResult.success) return addressResult;

      const validAddress = addressResult.data;

      // Validate label
      const labelResult = validateWalletLabel(request.label);
      if (!labelResult.success) return labelResult;

      const label = labelResult.data;

      // Get current wallets
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const wallets = walletsResult.data;

      // Check exists
      const existsCheck = validateWalletExists(wallets, validAddress);
      if (!existsCheck.success) return existsCheck;

      // Update label
      const setResult = await storage.setLabel(validAddress, label);
      if (!setResult.success) return setResult;

      return success(undefined);
    },

    /**
     * Get all wallets with labels
     */
    getWallets: async (): Promise<Result<Array<{ address: string; label?: string }>>> => {
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const labelsResult = await storage.getLabels();
      if (!labelsResult.success) return labelsResult;

      const wallets = walletsResult.data;
      const labels = labelsResult.data;

      const result = wallets.map(address => ({
        address,
        label: labels[address]
      }));

      return success(result);
    },

    /**
     * Get room configuration
     */
    getConfig: async (): Promise<Result<RoomConfig>> => {
      const configResult = await storage.getConfig();
      if (!configResult.success) return configResult;

      const config = configResult.data;

      if (!config) {
        return failure(new Error('Room not initialized'));
      }

      return success(config);
    },

    /**
     * Update room configuration
     */
    updateConfig: async (request: UpdateConfigRequest): Promise<Result<RoomConfig>> => {
      // Validate threshold if provided
      if (request.threshold !== undefined) {
        const thresholdResult = validateThreshold(request.threshold);
        if (!thresholdResult.success) return thresholdResult;
      }

      // Validate webhook if provided
      if (request.telegramWebhook !== undefined) {
        const webhookResult = validateTelegramWebhook(request.telegramWebhook);
        if (!webhookResult.success) return webhookResult;
      }

      const updateResult = await storage.updateConfig(request);
      if (!updateResult.success) return updateResult;

      // Broadcast config update (hide sensitive data)
      await websocket.broadcast({
        type: 'config_updated',
        data: {
          threshold: request.threshold,
          telegramWebhook: request.telegramWebhook ? '***' : undefined
        }
      });

      return success(updateResult.data);
    },

    /**
     * Get presence count
     */
    getPresence: (): Result<{ count: number }> => {
      const count = websocket.getCount();
      return success({ count });
    },

    /**
     * RPC: Check if wallet is tracked
     */
    hasWallet: async (request: HasWalletRequest): Promise<Result<HasWalletResponse>> => {
      const walletsResult = await storage.getWallets();
      if (!walletsResult.success) return walletsResult;

      const wallets = walletsResult.data;
      const tracked = wallets.includes(request.address.toLowerCase());

      return success({ tracked });
    },

    /**
     * RPC: Notify swap event
     */
    notifySwap: async (request: NotifySwapRequest): Promise<Result<NotifySwapResponse>> => {
      // Broadcast to WebSocket clients
      const broadcastResult = await websocket.broadcast({
        type: 'swap',
        data: request
      });

      let telegramSent = false;

      // Send Telegram notification if configured and above threshold
      const configResult = await storage.getConfig();

      if (configResult.success && configResult.data) {
        const { telegramWebhook, threshold } = configResult.data;

        if (telegramWebhook && meetsThreshold(request.amountInUsd, threshold)) {
          const message = formatSwapMessage(request);
          const payload = createTelegramPayload(message);

          try {
            const response = await fetch(telegramWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            telegramSent = response.ok;
          } catch {
            telegramSent = false;
          }
        }
      }

      return success({
        delivered: broadcastResult.success && broadcastResult.data > 0,
        telegramSent
      });
    },

    /**
     * Handle room cleanup (alarm fired)
     */
    cleanup: async (): Promise<Result<void>> => {
      // Close all WebSocket connections
      websocket.closeAll(1000, 'Room expired');

      // Delete all storage
      const deleteResult = await storage.deleteAll();
      if (!deleteResult.success) return deleteResult;

      // Delete alarm
      await storage.deleteAlarm();

      return success(undefined);
    },

    /**
     * Handle WebSocket connection
     */
    handleWebSocketConnect: async (ws: WebSocket): Promise<Result<void>> => {
      const trackResult = websocket.track(ws);
      if (!trackResult.success) return trackResult;

      // Broadcast updated presence
      await broadcastPresence(websocket);

      return success(undefined);
    },

    /**
     * Handle WebSocket disconnect
     */
    handleWebSocketDisconnect: async (ws: WebSocket): Promise<Result<void>> => {
      const untrackResult = websocket.untrack(ws);
      if (!untrackResult.success) return untrackResult;

      // Broadcast updated presence
      await broadcastPresence(websocket);

      return success(undefined);
    }
  };
};

/**
 * Type helper for request handlers
 */
export type RequestHandlers = ReturnType<typeof createRequestHandlers>;
