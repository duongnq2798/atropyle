import type * as Impl from './impl';

export type WalletImpl = typeof Impl;

let pending: Promise<WalletImpl> | null = null;

/**
 * The wallet code (viem and the SDK's error type) loads on first use: a click on Connect, or a wallet remembered from
 * an earlier visit. A failed load (offline) is forgotten so the next call tries again.
 */
export function loadWalletImpl(): Promise<WalletImpl> {
  pending ??= import('./impl').catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}
