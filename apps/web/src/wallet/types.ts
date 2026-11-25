import type { Address } from 'viem';
import type { WalletOption } from './impl/wallet';

export type { CallsResult, CallsStatus, SendCallsOptions } from './impl/send-calls';
export type { Eip1193, WalletOption, WalletWindow } from './impl/wallet';

export type WalletStatus = 'idle' | 'restoring' | 'connecting' | 'connected';

export interface ConnectedWallet {
  option: WalletOption;
  account: Address;
  chainId: number;
}

/** What `KEYS.wallet` keeps: enough to find the same wallet on the next visit. Never an account, never a key. */
export interface RememberedWallet {
  rdns: string | null;
  source: WalletOption['source'];
  name: string;
}
