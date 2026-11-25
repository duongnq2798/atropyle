import { AtropyleError } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { ConnectedWallet, RememberedWallet } from '../types';
import {
  call,
  discoverWallets,
  type Eip1193,
  readChainId,
  requestAccount,
  type WalletOption,
  type WalletWindow,
} from './wallet';

const MAX_CHAIN_ID = BigInt(Number.MAX_SAFE_INTEGER);

/** The first account of an `accountsChanged` payload or an `eth_accounts` answer, checksummed; null for anything else. */
export function parseAccountsEvent(arg: unknown): Address | null {
  if (!Array.isArray(arg) || typeof arg[0] !== 'string') return null;
  try {
    return getAddress(arg[0]);
  } catch {
    return null;
  }
}

/** A `chainChanged` payload (hex or decimal) as a chain id; null for anything else, so the last known chain stays. */
export function parseChainEvent(arg: unknown): number | null {
  if (typeof arg !== 'string' && typeof arg !== 'number') return null;
  try {
    const id = BigInt(arg);
    return id > 0n && id <= MAX_CHAIN_ID ? Number(id) : null;
  } catch {
    return null;
  }
}

/**
 * EIP-1193 `disconnect` means the wallet lost every chain. MetaMask also sends it, with code 1013, while it moves
 * between networks and then reconnects by itself; that one is not a disconnection.
 */
export function isTransientDisconnect(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && (arg as { code?: unknown }).code === 1013;
}

export interface WalletEvents {
  account(account: Address): void;
  chain(chainId: number): void;
  /** No usable account any more: the user locked the wallet, removed this site, or sent garbage. */
  gone(): void;
}

/** Listens to one wallet; the returned function stops listening. A wallet without `on` sends no events. */
export function watchWallet(p: Eip1193, h: WalletEvents): () => void {
  if (!p.on) return () => undefined;
  const onAccounts = (...args: unknown[]) => {
    const account = parseAccountsEvent(args[0]);
    if (account) h.account(account);
    else h.gone();
  };
  const onChain = (...args: unknown[]) => {
    const id = parseChainEvent(args[0]);
    if (id !== null) h.chain(id);
  };
  const onDisconnect = (...args: unknown[]) => {
    if (!isTransientDisconnect(args[0])) h.gone();
  };
  p.on('accountsChanged', onAccounts);
  p.on('chainChanged', onChain);
  p.on('disconnect', onDisconnect);
  return () => {
    p.removeListener?.('accountsChanged', onAccounts);
    p.removeListener?.('chainChanged', onChain);
    p.removeListener?.('disconnect', onDisconnect);
  };
}

/**
 * The wallet found now that is the remembered one: by rdns, since EIP-6963 uuids change on every page load; a
 * wallet without rdns (an injected global) by how it was found and its fixed name.
 */
export function findRemembered(list: readonly WalletOption[], r: RememberedWallet): WalletOption | null {
  return list.find((w) => (r.rdns ? w.rdns === r.rdns : w.source === r.source && w.name === r.name)) ?? null;
}

/** The account the wallet already shares with this site, without a prompt; null when it shares none. */
export async function silentAccount(p: Eip1193): Promise<Address | null> {
  try {
    return parseAccountsEvent(await call<unknown>(p, 'eth_accounts'));
  } catch {
    return null;
  }
}

export type RestoreResult = { kind: 'connected'; wallet: ConnectedWallet } | { kind: 'gone' } | { kind: 'locked' };

/** Reconnects a remembered wallet. Never `eth_requestAccounts` here: a page load must not open a wallet prompt. */
export async function restoreWallet(win: WalletWindow, r: RememberedWallet): Promise<RestoreResult> {
  const option = findRemembered(await discoverWallets(win), r);
  if (!option) return { kind: 'gone' };
  const account = await silentAccount(option.provider);
  if (!account) return { kind: 'locked' };
  try {
    return { kind: 'connected', wallet: { option, account, chainId: await readChainId(option.provider) } };
  } catch {
    return { kind: 'locked' };
  }
}

/** Asks the wallet for an account (its prompt) and reads its chain. */
export async function connectWallet(option: WalletOption): Promise<ConnectedWallet> {
  const account = await requestAccount(option.provider);
  return { option, account, chainId: await readChainId(option.provider) };
}

export function notConnected(): AtropyleError {
  return new AtropyleError('WRONG_ACCOUNT', { message: 'Connect a wallet first.' });
}
