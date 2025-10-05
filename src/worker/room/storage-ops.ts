/**
 * Storage operations factory for Durable Object state
 * Following factory pattern with DI at creation
 */

import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Result, success, failure } from '../../services/types';
import type { RoomConfig } from '../types';
import { VALIDATION, TIME } from '../types';

/**
 * Storage operations factory
 * Creates a set of storage operation functions with injected DurableObjectStorage
 */
export const createStorageOps = (storage: DurableObjectStorage) => ({
  /**
   * Get all tracked wallets
   */
  getWallets: async (): Promise<Result<string[]>> => {
    try {
      const wallets = await storage.get<string[]>('wallets');
      return success(wallets || []);
    } catch (error) {
      return failure(new Error('Failed to retrieve wallets'));
    }
  },

  /**
   * Add wallet to tracked list
   */
  addWallet: async (address: string): Promise<Result<void>> => {
    try {
      const wallets = await storage.get<string[]>('wallets') || [];
      wallets.push(address);
      await storage.put('wallets', wallets);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to add wallet'));
    }
  },

  /**
   * Remove wallet from tracked list
   */
  removeWallet: async (address: string): Promise<Result<void>> => {
    try {
      const wallets = await storage.get<string[]>('wallets') || [];
      const filtered = wallets.filter(w => w !== address);
      await storage.put('wallets', filtered);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to remove wallet'));
    }
  },

  /**
   * Get wallet labels
   */
  getLabels: async (): Promise<Result<Record<string, string>>> => {
    try {
      const labels = await storage.get<Record<string, string>>('labels');
      return success(labels || {});
    } catch (error) {
      return failure(new Error('Failed to retrieve labels'));
    }
  },

  /**
   * Set label for wallet
   */
  setLabel: async (address: string, label: string | undefined): Promise<Result<void>> => {
    try {
      const labels = await storage.get<Record<string, string>>('labels') || {};

      if (label === undefined) {
        delete labels[address];
      } else {
        labels[address] = label;
      }

      await storage.put('labels', labels);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to set label'));
    }
  },

  /**
   * Get room configuration
   */
  getConfig: async (): Promise<Result<RoomConfig | null>> => {
    try {
      const config = await storage.get<RoomConfig>('config');
      return success(config || null);
    } catch (error) {
      return failure(new Error('Failed to retrieve config'));
    }
  },

  /**
   * Set room configuration
   */
  setConfig: async (config: RoomConfig): Promise<Result<void>> => {
    try {
      await storage.put('config', config);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to set config'));
    }
  },

  /**
   * Update partial config
   */
  updateConfig: async (updates: Partial<RoomConfig>): Promise<Result<RoomConfig>> => {
    try {
      const current = await storage.get<RoomConfig>('config') || {
        createdAt: Date.now(),
        expiresAt: Date.now() + VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS * TIME.MILLISECONDS_PER_HOUR
      };

      const updated = { ...current, ...updates };
      await storage.put('config', updated);
      return success(updated);
    } catch (error) {
      return failure(new Error('Failed to update config'));
    }
  },

  /**
   * Delete all data (cleanup)
   */
  deleteAll: async (): Promise<Result<void>> => {
    try {
      await storage.deleteAll();
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to delete all data'));
    }
  },

  /**
   * Get alarm time
   */
  getAlarm: async (): Promise<Result<number | null>> => {
    try {
      const alarmTime = await storage.getAlarm();
      return success(alarmTime);
    } catch (error) {
      return failure(new Error('Failed to get alarm'));
    }
  },

  /**
   * Set alarm for expiration
   */
  setAlarm: async (timestamp: number): Promise<Result<void>> => {
    try {
      await storage.setAlarm(timestamp);
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to set alarm'));
    }
  },

  /**
   * Delete alarm
   */
  deleteAlarm: async (): Promise<Result<void>> => {
    try {
      await storage.deleteAlarm();
      return success(undefined);
    } catch (error) {
      return failure(new Error('Failed to delete alarm'));
    }
  }
});

/**
 * Type helper for storage operations
 */
export type StorageOps = ReturnType<typeof createStorageOps>;
