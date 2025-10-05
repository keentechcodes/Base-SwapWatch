/**
 * RPC handlers as pure functions
 * Inter-service communication logic
 */

import { Result, success } from '../../services/types';
import type {
  HasWalletRequest,
  HasWalletResponse,
  NotifySwapRequest,
  NotifySwapResponse,
} from '../types';
import type { StorageOperations } from './storage';
import type { WebSocketManager } from './websocket';
import { createSwapMessage } from './websocket';
import { shouldNotify, formatTelegramMessage, sendTelegramNotification } from './telegram';

/**
 * RPC handler dependencies
 */
export interface RpcHandlerDeps {
  storage: StorageOperations;
  websocket: WebSocketManager;
}

/**
 * RPC handlers interface
 */
export interface RpcHandlers {
  hasWallet(request: HasWalletRequest): Promise<Result<HasWalletResponse>>;
  notifySwap(request: NotifySwapRequest): Promise<Result<NotifySwapResponse>>;
}

/**
 * Create RPC handlers
 */
export const createRpcHandlers = (deps: RpcHandlerDeps): RpcHandlers => {
  const { storage, websocket } = deps;

  /**
   * Check if room tracks a wallet
   */
  const hasWallet = async (request: HasWalletRequest): Promise<Result<HasWalletResponse>> => {
    const wallets = await storage.getWallets();
    const tracked = wallets.includes(request.address);

    return success({ tracked });
  };

  /**
   * Notify room of swap event
   */
  const notifySwap = async (request: NotifySwapRequest): Promise<Result<NotifySwapResponse>> => {
    // Broadcast to WebSocket clients
    websocket.broadcast(createSwapMessage(request));

    // Check if Telegram notification should be sent
    let telegramSent = false;
    const config = await storage.getConfig();

    if (config?.telegramWebhook && shouldNotify(request.amountInUsd, config.threshold)) {
      const message = formatTelegramMessage(request);
      telegramSent = await sendTelegramNotification(config.telegramWebhook, message);
    }

    return success({
      delivered: true,
      telegramSent,
    });
  };

  return {
    hasWallet,
    notifySwap,
  };
};
