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
  methodName?: string;
  tokenId?: string;
  id?: number;
  ids?: number[];
  values?: number[];
  operator?: string;
  data?: any;
  logs?: any[];
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

