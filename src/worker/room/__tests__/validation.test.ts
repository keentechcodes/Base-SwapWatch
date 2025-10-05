/**
 * Tests for validation pure functions
 */

import {
  validateWalletAddress,
  validateLabel,
  validateThreshold,
  validateExtensionHours,
  isWalletLimitReached,
  walletExists,
} from '../validation';

describe('Validation Functions', () => {
  describe('validateWalletAddress', () => {
    it('should accept valid wallet address', () => {
      const result = validateWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      expect(result.success).toBe(true);
    });

    it('should reject invalid address format', () => {
      const result = validateWalletAddress('invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid wallet address');
      }
    });

    it('should reject address without 0x prefix', () => {
      const result = validateWalletAddress('742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      expect(result.success).toBe(false);
    });
  });

  describe('validateLabel', () => {
    it('should accept valid label', () => {
      const result = validateLabel('My Wallet');
      expect(result.success).toBe(true);
    });

    it('should reject label exceeding max length', () => {
      const longLabel = 'a'.repeat(101);
      const result = validateLabel(longLabel);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('100 characters');
      }
    });
  });

  describe('validateThreshold', () => {
    it('should accept valid threshold', () => {
      const result = validateThreshold(1000);
      expect(result.success).toBe(true);
    });

    it('should reject negative threshold', () => {
      const result = validateThreshold(-100);
      expect(result.success).toBe(false);
    });

    it('should reject threshold above maximum', () => {
      const result = validateThreshold(2000000);
      expect(result.success).toBe(false);
    });
  });

  describe('validateExtensionHours', () => {
    it('should accept valid extension hours', () => {
      const result = validateExtensionHours(24);
      expect(result.success).toBe(true);
    });

    it('should reject zero hours', () => {
      const result = validateExtensionHours(0);
      expect(result.success).toBe(false);
    });

    it('should reject hours above maximum', () => {
      const result = validateExtensionHours(100);
      expect(result.success).toBe(false);
    });
  });

  describe('isWalletLimitReached', () => {
    it('should return false when below limit', () => {
      expect(isWalletLimitReached(10)).toBe(false);
    });

    it('should return true when at limit', () => {
      expect(isWalletLimitReached(50)).toBe(true);
    });

    it('should return true when above limit', () => {
      expect(isWalletLimitReached(51)).toBe(true);
    });
  });

  describe('walletExists', () => {
    const wallets = ['0x123', '0x456', '0x789'];

    it('should return true for existing wallet', () => {
      expect(walletExists(wallets, '0x456')).toBe(true);
    });

    it('should return false for non-existing wallet', () => {
      expect(walletExists(wallets, '0xabc')).toBe(false);
    });
  });
});
