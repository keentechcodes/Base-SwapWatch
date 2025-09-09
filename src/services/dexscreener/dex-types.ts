/**
 * Extended DEX info for DexScreener service
 */
export interface DexScreenerDexInfo {
  dexName: string;
  routerAddress: string;
  factoryAddress?: string;
  pairAddress: string;
  poolUrl?: string;
  liquidity?: {
    token0: string;
    token1: string;
    base?: string;
    quote?: string;
    usd: string;
  };
  fees?: {
    swapFee: string;
    protocolFee?: string;
  };
}