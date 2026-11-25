import type { WalletOption } from './impl/wallet';

/** The EIP-6963 rdns of OKX Wallet (the extension and the OKX App). */
export const OKX_RDNS = 'com.okex.wallet';

/**
 * OKX Wallet, known by its EIP-6963 rdns or the OKX App's injected global. Never by name: any wallet can pick a name.
 * The Recommended badge, the order of the wallet list and its de-duplication all use this one rule.
 */
export function isRecommended(w: Pick<WalletOption, 'rdns' | 'source'>): boolean {
  return w.rdns === OKX_RDNS || w.source === 'okxwallet';
}
