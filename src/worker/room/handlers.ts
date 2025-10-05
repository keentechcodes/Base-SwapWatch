/**
 * HTTP request handlers as pure factory functions
 * Business logic separated from HTTP layer
 */

import { Result, success, failure } from '../../services/types';
import type {
  AddWalletRequest,
  UpdateWalletRequest,
  UpdateConfigRequest,
  CreateRoomRequest,
  RoomConfig,
} from '../types';
import { VALIDATION } from '../types';
import type { StorageOperations } from './storage';
import type { WebSocketManager } from './websocket';
import {
  validateWalletAddress,
  validateLabel,
  validateThreshold,
  validateExtensionHours,
} from './validation';
import {
  createWalletAddedMessage,
  createWalletRemovedMessage,
  createConfigUpdatedMessage,
} from './websocket';

/**
 * Room handlers dependencies
 */
export interface RoomHandlerDeps {
  storage: StorageOperations;
  websocket: WebSocketManager;
  setAlarm: (time: number) => Promise<void>;
}

/**
 * Room handlers interface
 */
export interface RoomHandlers {
  createRoom(request: CreateRoomRequest): Promise<Result<RoomConfig>>;
  extendRoom(hours?: number): Promise<Result<{ expiresAt: number }>>;
  getWallets(): Promise<Result<Array<{ address: string; label?: string }>>>;
  addWallet(request: AddWalletRequest): Promise<Result<{ address: string; label?: string }>>;
  removeWallet(address: string): Promise<Result<void>>;
  updateWallet(address: string, request: UpdateWalletRequest): Promise<Result<void>>;
  getConfig(): Promise<Result<{ config: RoomConfig | Record<string, never> }>>;
  updateConfig(request: UpdateConfigRequest): Promise<Result<{ config: RoomConfig }>>;
  getPresence(): Result<{ count: number }>;
}

/**
 * Create room request handlers
 */
export const createRoomHandlers = (deps: RoomHandlerDeps): RoomHandlers => {
  const { storage, websocket, setAlarm } = deps;

  /**
   * Create new room
   */
  const createRoom = async (request: CreateRoomRequest): Promise<Result<RoomConfig>> => {
    // Validate threshold if provided
    if (request.threshold !== undefined) {
      const thresholdValidation = validateThreshold(request.threshold);
      if (!thresholdValidation.success) {
        return failure(thresholdValidation.error as Error);
      }
    }

    const now = Date.now();
    const expiresAt = now + VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS * 60 * 60 * 1000;

    const config: RoomConfig = {
      createdAt: now,
      expiresAt,
      createdBy: request.createdBy,
      threshold: request.threshold,
      telegramWebhook: request.telegramWebhook,
    };

    await storage.updateConfig(config);
    await setAlarm(expiresAt);

    return success(config);
  };

  /**
   * Extend room lifetime
   */
  const extendRoom = async (hours?: number): Promise<Result<{ expiresAt: number }>> => {
    const extensionHours = hours || VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS;
    const validation = validateExtensionHours(extensionHours);

    if (!validation.success) {
      return failure(validation.error as Error);
    }

    const config = await storage.getConfig();
    if (!config) {
      return failure(new Error('Room not found or expired'));
    }

    const cappedHours = Math.min(extensionHours, VALIDATION.MAX_ROOM_EXTENSION_HOURS);
    const newExpiresAt = Date.now() + cappedHours * 60 * 60 * 1000;

    await storage.setExpiration(newExpiresAt);
    await setAlarm(newExpiresAt);

    return success({ expiresAt: newExpiresAt });
  };

  /**
   * Get all tracked wallets
   */
  const getWallets = async (): Promise<Result<Array<{ address: string; label?: string }>>> => {
    const wallets = await storage.getWallets();
    const labels = await storage.getLabels();

    const walletsWithLabels = wallets.map((address) => ({
      address,
      label: labels[address],
    }));

    return success(walletsWithLabels);
  };

  /**
   * Add wallet to room
   */
  const addWallet = async (
    request: AddWalletRequest
  ): Promise<Result<{ address: string; label?: string }>> => {
    // Validate address
    const addressValidation = validateWalletAddress(request.address);
    if (!addressValidation.success) {
      return failure(addressValidation.error as Error);
    }

    // Validate label if provided
    if (request.label) {
      const labelValidation = validateLabel(request.label);
      if (!labelValidation.success) {
        return failure(labelValidation.error as Error);
      }
    }

    // Add to storage
    const result = await storage.addWallet(request.address, request.label);
    if (!result.success) {
      return failure(result.error as Error);
    }

    // Broadcast to WebSocket clients
    websocket.broadcast(createWalletAddedMessage(request.address, request.label));

    return success({ address: request.address, label: request.label });
  };

  /**
   * Remove wallet from room
   */
  const removeWallet = async (address: string): Promise<Result<void>> => {
    const result = await storage.removeWallet(address);
    if (!result.success) {
      return failure(result.error as Error);
    }

    // Broadcast to WebSocket clients
    websocket.broadcast(createWalletRemovedMessage(address));

    return success(undefined);
  };

  /**
   * Update wallet label
   */
  const updateWallet = async (
    address: string,
    request: UpdateWalletRequest
  ): Promise<Result<void>> => {
    // Validate label
    const labelValidation = validateLabel(request.label);
    if (!labelValidation.success) {
      return failure(labelValidation.error as Error);
    }

    const result = await storage.updateLabel(address, request.label);
    if (!result.success) {
      return failure(result.error as Error);
    }

    return success(undefined);
  };

  /**
   * Get room configuration
   */
  const getConfig = async (): Promise<Result<{ config: RoomConfig | Record<string, never> }>> => {
    const config = (await storage.getConfig()) || {};
    return success({ config });
  };

  /**
   * Update room configuration
   */
  const updateConfig = async (
    request: UpdateConfigRequest
  ): Promise<Result<{ config: RoomConfig }>> => {
    // Validate threshold if provided
    if (request.threshold !== undefined) {
      const thresholdValidation = validateThreshold(request.threshold);
      if (!thresholdValidation.success) {
        return failure(thresholdValidation.error as Error);
      }
    }

    const result = await storage.updateConfig(request);
    if (!result.success) {
      return failure(result.error as Error);
    }

    // Broadcast to WebSocket clients (sanitize webhook URL)
    websocket.broadcast(
      createConfigUpdatedMessage({
        threshold: result.data.threshold,
        telegramWebhook: result.data.telegramWebhook ? '***' : undefined,
      })
    );

    return success({ config: result.data });
  };

  /**
   * Get presence count
   */
  const getPresence = (): Result<{ count: number }> => {
    return success({ count: websocket.getSessionCount() });
  };

  return {
    createRoom,
    extendRoom,
    getWallets,
    addWallet,
    removeWallet,
    updateWallet,
    getConfig,
    updateConfig,
    getPresence,
  };
};
