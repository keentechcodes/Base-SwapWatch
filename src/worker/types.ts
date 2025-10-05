import type { DurableObjectNamespace, KVNamespace } from '@cloudflare/workers-types';

// Cloudflare Workers environment bindings
export interface Env {
  ROOMS: DurableObjectNamespace;
  ROOM_INDEX: KVNamespace;
  COINBASE_WEBHOOK_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  DEXSCREENER_API_KEY?: string;
  BASESCAN_API_KEY?: string;
  ENVIRONMENT?: 'production' | 'staging' | 'development';
  // CDP Webhook Management (optional for dynamic filter updates)
  CDP_WEBHOOK_ID?: string;
  CDP_API_KEY_NAME?: string;
  CDP_API_KEY_PRIVATE_KEY?: string;
}

// Room storage schema
export interface RoomConfig {
  telegramWebhook?: string;
  threshold?: number;
  createdAt: number;
  expiresAt: number;
  createdBy?: string;
}

export interface RoomStorage {
  wallets: string[];
  labels: Record<string, string>;
  config: RoomConfig;
}

// Swap event types
export interface SwapEvent {
  txHash: string;
  walletAddress: string;
  tokenIn?: string;
  tokenOut?: string;
  amountInUsd: number;
  amountOutUsd?: number;
  timestamp?: number;
  enrichment?: any;
}

// WebSocket message types
export type WebSocketMessage =
  | { type: 'swap'; data: SwapEvent }
  | { type: 'presence'; data: { count: number } }
  | { type: 'wallet_added'; data: { address: string; label?: string } }
  | { type: 'wallet_removed'; data: { address: string } }
  | { type: 'config_updated'; data: Partial<RoomConfig> }
  | { type: 'ping'; data: { timestamp: number } }
  | { type: 'pong'; data: { timestamp: number } };

// RPC request/response types
export interface HasWalletRequest {
  address: string;
}

export interface HasWalletResponse {
  tracked: boolean;
}

export interface NotifySwapRequest extends SwapEvent {}

export interface NotifySwapResponse {
  delivered: boolean;
  telegramSent?: boolean;
}

// HTTP request/response types
export interface AddWalletRequest {
  address: string;
  label?: string;
}

export interface UpdateWalletRequest {
  label: string;
}

export interface UpdateConfigRequest {
  telegramWebhook?: string;
  threshold?: number;
}

export interface CreateRoomRequest {
  createdBy?: string;
  threshold?: number;
  telegramWebhook?: string;
}

export interface ExtendRoomRequest {
  hours?: number;
}

// Validation constants
export const VALIDATION = {
  MAX_WALLETS_PER_ROOM: 50,
  MAX_LABEL_LENGTH: 100,
  WALLET_ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
  DEFAULT_ROOM_LIFETIME_HOURS: 24,
  MAX_ROOM_EXTENSION_HOURS: 48,
  MIN_THRESHOLD_USD: 0,
  MAX_THRESHOLD_USD: 1000000,
} as const;

// Time constants
export const TIME = {
  MILLISECONDS_PER_SECOND: 1000,
  MILLISECONDS_PER_MINUTE: 60 * 1000,
  MILLISECONDS_PER_HOUR: 60 * 60 * 1000,
  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;

// Display constants
export const WALLET_DISPLAY = {
  PREFIX_LENGTH: 6,
  SUFFIX_LENGTH: 4,
} as const;

// Error types
export class RoomError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

export class ValidationError extends RoomError {
  constructor(message: string, details?: any) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends RoomError {
  constructor(message: string, details?: any) {
    super(message, 409, details);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends RoomError {
  constructor(message: string, details?: any) {
    super(message, 404, details);
    this.name = 'NotFoundError';
  }
}
