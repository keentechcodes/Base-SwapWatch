/**
 * Pure validation functions for room operations
 * Following function-first paradigm with Result<T> pattern
 */

import { Result, success, failure } from '../../services/types';
import { VALIDATION, ValidationError } from '../types';

/**
 * Validate wallet address format (Ethereum/Base)
 */
export const validateWalletAddress = (address: string): Result<string> => {
  if (!address) {
    return failure(new ValidationError('Wallet address is required'));
  }

  if (!VALIDATION.WALLET_ADDRESS_REGEX.test(address)) {
    return failure(new ValidationError('Invalid wallet address format. Expected: 0x followed by 40 hex characters'));
  }

  return success(address.toLowerCase());
};

/**
 * Validate wallet label length and content
 */
export const validateWalletLabel = (label: string | undefined): Result<string | undefined> => {
  if (!label) {
    return success(undefined);
  }

  if (label.length > VALIDATION.MAX_LABEL_LENGTH) {
    return failure(new ValidationError(`Label must be ${VALIDATION.MAX_LABEL_LENGTH} characters or less`));
  }

  // Trim whitespace
  const trimmed = label.trim();

  if (trimmed.length === 0) {
    return success(undefined);
  }

  return success(trimmed);
};

/**
 * Validate threshold value for notifications
 */
export const validateThreshold = (threshold: number | undefined): Result<number | undefined> => {
  if (threshold === undefined) {
    return success(undefined);
  }

  if (threshold < VALIDATION.MIN_THRESHOLD_USD || threshold > VALIDATION.MAX_THRESHOLD_USD) {
    return failure(
      new ValidationError(
        `Threshold must be between $${VALIDATION.MIN_THRESHOLD_USD} and $${VALIDATION.MAX_THRESHOLD_USD}`
      )
    );
  }

  return success(threshold);
};

/**
 * Validate Telegram webhook URL format
 */
export const validateTelegramWebhook = (url: string | undefined): Result<string | undefined> => {
  if (!url) {
    return success(undefined);
  }

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return failure(new ValidationError('Telegram webhook must use HTTP or HTTPS protocol'));
    }

    // Basic check that it looks like a Telegram bot webhook
    if (!url.includes('api.telegram.org')) {
      return failure(new ValidationError('Invalid Telegram webhook URL'));
    }

    return success(url);
  } catch {
    return failure(new ValidationError('Invalid webhook URL format'));
  }
};

/**
 * Validate room extension hours
 */
export const validateExtensionHours = (hours: number | undefined): Result<number> => {
  const defaultHours = VALIDATION.DEFAULT_ROOM_LIFETIME_HOURS;
  const requestedHours = hours || defaultHours;

  if (requestedHours <= 0) {
    return failure(new ValidationError('Extension hours must be positive'));
  }

  if (requestedHours > VALIDATION.MAX_ROOM_EXTENSION_HOURS) {
    return failure(
      new ValidationError(`Maximum extension is ${VALIDATION.MAX_ROOM_EXTENSION_HOURS} hours`)
    );
  }

  return success(requestedHours);
};

/**
 * Validate wallet list doesn't exceed maximum
 */
export const validateWalletLimit = (currentCount: number): Result<void> => {
  if (currentCount >= VALIDATION.MAX_WALLETS_PER_ROOM) {
    return failure(
      new ValidationError(`Maximum ${VALIDATION.MAX_WALLETS_PER_ROOM} wallets per room`)
    );
  }

  return success(undefined);
};

/**
 * Validate wallet exists in list
 */
export const validateWalletExists = (wallets: string[], address: string): Result<void> => {
  if (!wallets.includes(address)) {
    return failure(new ValidationError('Wallet not found in room'));
  }

  return success(undefined);
};

/**
 * Validate wallet doesn't already exist
 */
export const validateWalletNotExists = (wallets: string[], address: string): Result<void> => {
  if (wallets.includes(address)) {
    return failure(new ValidationError('Wallet already exists in room'));
  }

  return success(undefined);
};
