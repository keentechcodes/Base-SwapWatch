/**
 * Swap storage operations for Durable Objects
 * Provides persistent swap history with TTL support
 */

import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Result, success, failure } from '../../services/types';

export interface StoredSwap {
  id: string;
  ts: number;
  from: string;
  to: string;
  amountIn: number;
  amountOut: number;
  wallet: string;
  tx: string;
  usdValue?: number;
  storedAt: number; // Timestamp when stored
}

const SWAP_PREFIX = 'swap:';
const SWAP_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

/**
 * Create swap storage operations factory
 */
export const createSwapStorage = (storage: DurableObjectStorage) => {
  return {
    /**
     * Store a swap event with timestamp-based key
     * Key format: swap:{timestamp}:{txHash}
     */
    storeSwap: async (swap: Omit<StoredSwap, 'storedAt'>): Promise<Result<void>> => {
      try {
        const storedSwap: StoredSwap = {
          ...swap,
          storedAt: Date.now()
        };

        const key = `${SWAP_PREFIX}${swap.ts}:${swap.tx}`;
        await storage.put(key, storedSwap);

        return success(undefined);
      } catch (error) {
        console.error('Failed to store swap:', error);
        return failure(new Error('Failed to store swap'));
      }
    },

    /**
     * Get all swaps, optionally filtered by time range
     */
    getSwaps: async (options?: {
      since?: number; // Unix timestamp
      limit?: number; // Max number of swaps to return
    }): Promise<Result<StoredSwap[]>> => {
      try {
        const allSwaps = await storage.list<StoredSwap>({
          prefix: SWAP_PREFIX
        });

        let swaps: StoredSwap[] = Array.from(allSwaps.values());

        // Filter by time if specified
        if (options?.since) {
          swaps = swaps.filter(swap => swap.ts >= options.since);
        }

        // Sort by timestamp descending (newest first)
        swaps.sort((a, b) => b.ts - a.ts);

        // Limit results if specified
        if (options?.limit) {
          swaps = swaps.slice(0, options.limit);
        }

        return success(swaps);
      } catch (error) {
        console.error('Failed to retrieve swaps:', error);
        return failure(new Error('Failed to retrieve swaps'));
      }
    },

    /**
     * Get swaps for a specific wallet
     */
    getSwapsByWallet: async (walletAddress: string, limit?: number): Promise<Result<StoredSwap[]>> => {
      try {
        const allSwapsResult = await createSwapStorage(storage).getSwaps({ limit: limit || 100 });

        if (!allSwapsResult.success) {
          return allSwapsResult;
        }

        const filtered = allSwapsResult.data.filter(
          swap => swap.wallet.toLowerCase() === walletAddress.toLowerCase()
        );

        return success(filtered);
      } catch (error) {
        return failure(new Error('Failed to retrieve swaps by wallet'));
      }
    },

    /**
     * Clean up expired swaps (older than TTL)
     */
    cleanupExpiredSwaps: async (): Promise<Result<number>> => {
      try {
        const cutoffTime = Date.now() - SWAP_TTL_MS;
        const allSwaps = await storage.list<StoredSwap>({
          prefix: SWAP_PREFIX
        });

        let deletedCount = 0;
        const keysToDelete: string[] = [];

        for (const [key, swap] of allSwaps) {
          if (swap.storedAt < cutoffTime) {
            keysToDelete.push(key);
          }
        }

        // Batch delete for efficiency
        if (keysToDelete.length > 0) {
          await storage.delete(keysToDelete);
          deletedCount = keysToDelete.length;
        }

        return success(deletedCount);
      } catch (error) {
        console.error('Failed to cleanup expired swaps:', error);
        return failure(new Error('Failed to cleanup expired swaps'));
      }
    },

    /**
     * Get storage statistics
     */
    getStats: async (): Promise<Result<{
      totalSwaps: number;
      oldestSwap: number | null;
      newestSwap: number | null;
    }>> => {
      try {
        const allSwaps = await storage.list<StoredSwap>({
          prefix: SWAP_PREFIX
        });

        const swaps = Array.from(allSwaps.values());

        if (swaps.length === 0) {
          return success({
            totalSwaps: 0,
            oldestSwap: null,
            newestSwap: null
          });
        }

        const timestamps = swaps.map(s => s.ts).sort((a, b) => a - b);

        return success({
          totalSwaps: swaps.length,
          oldestSwap: timestamps[0],
          newestSwap: timestamps[timestamps.length - 1]
        });
      } catch (error) {
        return failure(new Error('Failed to get storage stats'));
      }
    }
  };
};

/**
 * Type helper for swap storage
 */
export type SwapStorage = ReturnType<typeof createSwapStorage>;
