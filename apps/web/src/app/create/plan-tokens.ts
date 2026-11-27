import type { PlanCheck } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { AssetRow } from '@/flows/impl/create-form';
import { isAddressText } from '@/lib/address';
import type { MirrorToken } from '@/tx/mirror';

/** The plan's tokens and the fee tokens as the mirror names them; symbols stay untrusted. */
export function planTokens(check: PlanCheck): MirrorToken[] {
  const out = new Map<string, MirrorToken>();
  for (const x of check.tokens) {
    out.set(x.token.toLowerCase(), {
      address: x.token,
      kind: x.kind,
      symbol: x.info?.symbol ?? null,
      decimals: x.info?.decimals ?? null,
    });
  }
  for (const f of check.fees.tokens) {
    if (!out.has(f.token.toLowerCase())) {
      out.set(f.token.toLowerCase(), { address: f.token, kind: 'erc20', symbol: f.symbol, decimals: f.decimals });
    }
  }
  return [...out.values()];
}

/**
 * After a reload the chain check is not run again (the saved plan, not a new check, is what gets signed): the mirror
 * takes each asset's kind from the form the plan was prepared from (matched by `to`, the rule of inspect) and the fee
 * token as an ERC-20. Names and decimals are unknown, so amounts read in base units.
 */
export function formTokens(assets: readonly AssetRow[], feeToken: Address | null): MirrorToken[] {
  const out = new Map<string, MirrorToken>();
  for (const a of assets) {
    const token = a.token.trim();
    if (isAddressText(token) && !out.has(token.toLowerCase())) {
      out.set(token.toLowerCase(), { address: token as Address, kind: a.kind, symbol: null, decimals: null });
    }
  }
  if (feeToken && !out.has(feeToken.toLowerCase())) {
    out.set(feeToken.toLowerCase(), { address: feeToken, kind: 'erc20', symbol: null, decimals: null });
  }
  return [...out.values()];
}
