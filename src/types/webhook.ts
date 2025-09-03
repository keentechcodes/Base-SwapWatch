export interface WebhookEvent {
  webhookId: string;
  eventType: string;
  network: string;
  blockHash?: string;
  blockNumber?: string;
  blockTime?: string;
  transactionHash?: string;
  transactionIndex?: string;
  logIndex?: string;
  contractAddress?: string;
  from?: string;
  to?: string;
  value?: string | number;
  addresses?: string[];
  walletId?: string;
  func?: string;
  tokenId?: string;
  id?: number;
  ids?: number[];
  values?: number[];
  operator?: string;
}

export interface WebhookResponse {
  status: string;
  eventType?: string;
  message?: string;
  timestamp?: string;
}

export interface WebhookError {
  error: string;
  message?: string;
  details?: any;
}

export type EventType = 
  | 'erc20_transfer'
  | 'erc721_transfer'
  | 'erc1155_transfer_single'
  | 'erc1155_transfer_batch'
  | 'transaction'
  | 'smart_contract_event'
  | 'wallet_activity';

export const KNOWN_DEX_ROUTERS: Record<string, string> = {
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap V3',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch',
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': 'Kyberswap',
  '0x00000000009726632680fb29d3f7a9734e3010e2': 'Rainbow',
  '0x327df1e6de05895d2ab08513aadd9313fe505d86': 'BaseSwap',
  '0x8c1a3cf8f83074169fe5d7ad50b978e1cd6b37c7': 'Aerodrome'
};