/**
 * Pure validation functions for room operations
 * Following functional programming paradigm - no side effects
 */

import { Result, success, failure } from '../../services/types';
import { VALIDATION, ValidationError } from '../types';

/**
 * Validate wallet address format
 */
export const validateWalletAddress = (address: string): Result<string> => {
  if (!VALIDATION.WALLET_ADDRESS_REGEX.test(address)) {
    return failure(new ValidationError('Invalid wallet address format'));
  }
  return success(address);
};

/**
 * Validate wallet label length
 */
export const validateLabel = (label: string): Result<string> => {
  if (label.length > VALIDATION.MAX_LABEL_LENGTH) {
    return failure(
      new ValidationError(`Label must be ${VALIDATION.MAX_LABEL_LENGTH} characters or less`)
    );
  }
  return success(label);
};

/**
 * Validate threshold value
 */
export const validateThreshold = (threshold: number): Result<number> => {
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
 * Validate room extension hours
 */
export const validateExtensionHours = (hours: number): Result<number> => {
  const maxHours = VALIDATION.MAX_ROOM_EXTENSION_HOURS;
  if (hours <= 0 || hours > maxHours) {
    return failure(new ValidationError(`Extension must be between 1 and ${maxHours} hours`));
  }
  return success(hours);
};

/**
 * Check if wallet limit reached
 */
export const isWalletLimitReached = (currentCount: number): boolean => {
  return currentCount >= VALIDATION.MAX_WALLETS_PER_ROOM;
};

/**
 * Check if wallet already exists in list
 */
export const walletExists = (wallets: string[], address: string): boolean => {
  return wallets.includes(address);
};
