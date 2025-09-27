/**
 * Pure transformation functions for BaseScan data
 * Following hybrid architecture: pure functions for business logic
 */

import { 
  BaseScanContract, 
  BaseScanTransaction, 
  BaseScanTokenInfo,
  BaseScanTokenTransfer 
} from './types';
import { ExtendedTokenInfo as TokenInfo, TransactionInfo, ExtendedVerificationData as VerificationData } from '../types/extended';
import BigNumber from 'bignumber.js';

/**
 * Transform BaseScan contract to verification data
 * Pure function - no side effects
 */
export const transformContractToVerification = (
  contract: BaseScanContract
): VerificationData => {
  const isVerified = contract.SourceCode !== '' && contract.SourceCode !== '0';
  const isProxy = contract.Proxy === '1' && contract.Implementation !== '';
  
  return {
    verified: isVerified,
    isVerified,
    contractName: contract.ContractName || 'Unknown',
    compiler: contract.CompilerVersion || 'Unknown',
    optimized: contract.OptimizationUsed === '1',
    runs: parseInt(contract.Runs, 10) || 0,
    licenseType: contract.LicenseType || 'None',
    proxyContract: isProxy ? contract.Implementation : undefined,
    sourceAvailable: isVerified && contract.SourceCode.length > 100,
    verifiedAt: undefined // BaseScan doesn't provide verification timestamp
  };
};

/**
 * Parse contract ABI if available
 * Pure function for ABI parsing
 */
export const parseContractABI = (abiString: string): any[] | null => {
  if (!abiString || abiString === 'Contract source code not verified') {
    return null;
  }
  
  try {
    const abi = JSON.parse(abiString);
    return Array.isArray(abi) ? abi : null;
  } catch {
    return null;
  }
};

/**
 * Transform BaseScan token info to our token info format
 * Pure function - no side effects
 */
export const transformBaseScanTokenInfo = (
  tokenInfo: BaseScanTokenInfo
): TokenInfo => {
  return {
    address: tokenInfo.contractAddress,
    name: tokenInfo.tokenName,
    symbol: tokenInfo.symbol,
    decimals: parseInt(tokenInfo.divisor, 10) || 18,
    totalSupply: tokenInfo.totalSupply,
    circulatingSupply: undefined, // Not provided by BaseScan
    logo: undefined, // BaseScan doesn't provide logo URLs
    description: tokenInfo.description || undefined,
    website: tokenInfo.website || undefined,
    social: {
      twitter: tokenInfo.twitter || undefined,
      telegram: tokenInfo.telegram || undefined,
      discord: tokenInfo.discord || undefined,
      github: tokenInfo.github || undefined,
      reddit: tokenInfo.reddit || undefined
    }
  };
};

/**
 * Transform BaseScan transaction to our format
 * Pure function - no side effects
 */
export const transformTransaction = (
  tx: BaseScanTransaction
): TransactionInfo => {
  return {
    hash: tx.hash,
    from: tx.from.toLowerCase(),
    to: tx.to.toLowerCase(),
    value: tx.value,
    blockNumber: parseInt(tx.blockNumber, 10),
    timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000),
    gasUsed: tx.gasUsed,
    gasPrice: tx.gasPrice,
    status: tx.txreceipt_status === '1' ? 'success' : 'failed',
    methodId: tx.methodId || undefined,
    functionName: tx.functionName || undefined
  };
};

/**
 * Calculate transaction cost in ETH
 * Pure function for calculations
 */
export const calculateTransactionCost = (
  gasUsed: string,
  gasPrice: string
): string => {
  return new BigNumber(gasUsed)
    .multipliedBy(gasPrice)
    .dividedBy(1e18)
    .toFixed(6);
};

/**
 * Transform token transfer event
 * Pure function - no side effects
 */
export const transformTokenTransfer = (
  transfer: BaseScanTokenTransfer
): {
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  timestamp: Date;
  transactionHash: string;
} => {
  return {
    from: transfer.from.toLowerCase(),
    to: transfer.to.toLowerCase(),
    value: transfer.value,
    tokenAddress: transfer.contractAddress.toLowerCase(),
    tokenSymbol: transfer.tokenSymbol,
    tokenDecimals: parseInt(transfer.tokenDecimal, 10) || 18,
    timestamp: new Date(parseInt(transfer.timeStamp, 10) * 1000),
    transactionHash: transfer.hash
  };
};

/**
 * Check if address is a contract based on transactions
 * Pure function for analysis
 */
export const isContractAddress = (
  transactions: BaseScanTransaction[]
): boolean => {
  // If address has contract creation transaction, it's a contract
  return transactions.some(tx => tx.contractAddress !== '');
};

/**
 * Calculate address activity metrics
 * Pure function for metrics calculation
 */
export const calculateAddressMetrics = (
  transactions: BaseScanTransaction[]
): {
  totalTransactions: number;
  uniqueInteractions: number;
  totalValueTransferred: string;
  firstActivity: Date | null;
  lastActivity: Date | null;
} => {
  if (transactions.length === 0) {
    return {
      totalTransactions: 0,
      uniqueInteractions: 0,
      totalValueTransferred: '0',
      firstActivity: null,
      lastActivity: null
    };
  }

  const uniqueAddresses = new Set<string>();
  let totalValue = new BigNumber(0);
  let earliestTimestamp = Infinity;
  let latestTimestamp = 0;

  transactions.forEach(tx => {
    uniqueAddresses.add(tx.from.toLowerCase());
    uniqueAddresses.add(tx.to.toLowerCase());
    totalValue = totalValue.plus(tx.value);
    
    const timestamp = parseInt(tx.timeStamp, 10);
    earliestTimestamp = Math.min(earliestTimestamp, timestamp);
    latestTimestamp = Math.max(latestTimestamp, timestamp);
  });

  return {
    totalTransactions: transactions.length,
    uniqueInteractions: uniqueAddresses.size,
    totalValueTransferred: totalValue.dividedBy(1e18).toFixed(6),
    firstActivity: new Date(earliestTimestamp * 1000),
    lastActivity: new Date(latestTimestamp * 1000)
  };
};

/**
 * Validate BaseScan API response
 * Pure function for validation
 */
export const isValidBaseScanResponse = <T>(
  response: unknown
): response is { status: '0' | '1'; message: string; result: T } => {
  if (!response || typeof response !== 'object') return false;
  
  const res = response as any;
  return (
    (res.status === '0' || res.status === '1') &&
    typeof res.message === 'string' &&
    res.result !== undefined
  );
};

/**
 * Check if BaseScan response indicates success
 * Pure function for status checking
 */
export const isSuccessfulResponse = <T>(
  response: { status: '0' | '1'; message: string; result: T }
): boolean => {
  return response.status === '1' || response.message === 'OK';
};

/**
 * Format wei to ETH
 * Pure function for formatting
 */
export const formatWeiToEth = (wei: string): string => {
  return new BigNumber(wei).dividedBy(1e18).toFixed(6);
};

/**
 * Format address for display
 * Pure function for formatting
 */
export const formatAddress = (address: string): string => {
  if (!address || address.length < 42) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};