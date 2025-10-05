/**
 * Pure storage operation functions
 * Handles data transformations for Durable Object storage
 */

import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Result, success, failure } from '../../services/types';
import { RoomConfig, VALIDATION, ConflictError, NotFoundError } from '../types';

/**
 * Storage operations interface
 */
export interface StorageOperations {
  getWallets(): Promise<string[]>;
  getLabels(): Promise<Record<string, string>>;
  getConfig(): Promise<RoomConfig | null>;
  addWallet(address: string, label?: string): Promise<Result<void>>;
  removeWallet(address: string): Promise<Result<void>>;
  updateLabel(address: string, label: string): Promise<Result<void>>;
  updateConfig(updates: Partial<RoomConfig>): Promise<Result<RoomConfig>>;
  setExpiration(expiresAt: number): Promise<void>;
}

/**
 * Create storage operations for a Durable Object
 */
export const createStorageOperations = (storage: DurableObjectStorage): StorageOperations => {
  /**
   * Get tracked wallets
   */
  const getWallets = async (): Promise<string[]> => {
    return (await storage.get<string[]>('wallets')) || [];
  };

  /**
   * Get wallet labels
   */
  const getLabels = async (): Promise<Record<string, string>> => {
    return (await storage.get<Record<string, string>>('labels')) || {};
  };

  /**
   * Get room configuration
   */
  const getConfig = async (): Promise<RoomConfig | null> => {
    return (await storage.get<RoomConfig>('config')) || null;
  };

  /**
   * Add wallet to room
   */
  const addWallet = async (address: string, label?: string): Promise<Result<void>> => {
    const wallets = await getWallets();
    const labels = await getLabels();

    // Check for duplicate
    if (wallets.includes(address)) {
      return failure(new ConflictError('Wallet already exists in room'));
    }

    // Check limit
    if (wallets.length >= VALIDATION.MAX_WALLETS_PER_ROOM) {
      return failure(
        new ConflictError(`Maximum ${VALIDATION.MAX_WALLETS_PER_ROOM} wallets per room`)
      );
    }

    // Add wallet
    wallets.push(address);
    if (label) {
      labels[address] = label;
    }

    await storage.put({ wallets, labels });
    return success(undefined);
  };

  /**
   * Remove wallet from room
   */
  const removeWallet = async (address: string): Promise<Result<void>> => {
    const wallets = await getWallets();
    const labels = await getLabels();

    const index = wallets.indexOf(address);
    if (index === -1) {
      return failure(new NotFoundError('Wallet not found in room'));
    }

    wallets.splice(index, 1);
    delete labels[address];

    await storage.put({ wallets, labels });
    return success(undefined);
  };

  /**
   * Update wallet label
   */
  const updateLabel = async (address: string, label: string): Promise<Result<void>> => {
    const wallets = await getWallets();
    const labels = await getLabels();

    if (!wallets.includes(address)) {
      return failure(new NotFoundError('Wallet not found in room'));
    }

    labels[address] = label;
    await storage.put('labels', labels);
    return success(undefined);
  };

  /**
   * Update room configuration
   */
  const updateConfig = async (updates: Partial<RoomConfig>): Promise<Result<RoomConfig>> => {
    const config = (await getConfig()) || {
      createdAt: Date.now(),
      expiresAt: Date.now() + VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS * 60 * 60 * 1000,
    };

    const updated = { ...config, ...updates };
    await storage.put('config', updated);
    return success(updated);
  };

  /**
   * Set room expiration time
   */
  const setExpiration = async (expiresAt: number): Promise<void> => {
    const config = await getConfig();
    if (config) {
      config.expiresAt = expiresAt;
      await storage.put('config', config);
    }
  };

  return {
    getWallets,
    getLabels,
    getConfig,
    addWallet,
    removeWallet,
    updateLabel,
    updateConfig,
    setExpiration,
  };
};
