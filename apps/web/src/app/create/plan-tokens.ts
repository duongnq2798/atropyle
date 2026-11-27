import type { PlanCheck } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { TokenMeta } from '@/flows/impl/balances';
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
 * token as an ERC-20. Each ERC-20's symbol and decimals come from `meta`, read from the chain again (tokenMeta); an
 * NFT, or a token whose read failed, stays unnamed, and its amounts read in base units.
 */
export function formTokens(
  assets: readonly AssetRow[],
  feeToken: Address | null,
  meta: readonly TokenMeta[] = [],
): MirrorToken[] {
  const named = new Map(meta.map((m) => [m.token.toLowerCase(), m]));
  const out = new Map<string, MirrorToken>();
  const add = (address: Address, kind: MirrorToken['kind']) => {
    const key = address.toLowerCase();
    if (out.has(key)) return;
    const m = kind === 'erc20' ? named.get(key) : undefined;
    out.set(key, { address, kind, symbol: m?.symbol ?? null, decimals: m?.decimals ?? null });
  };
  for (const a of assets) {
    const token = a.token.trim();
    if (isAddressText(token)) add(token as Address, a.kind);
  }
  if (feeToken) add(feeToken, 'erc20');
  return [...out.values()];
}

/** The ERC-20s of a token list: the ones whose name and decimals the mirror reads from the chain. */
export function erc20Addresses(tokens: readonly MirrorToken[]): Address[] {
  return tokens.filter((x) => x.kind === 'erc20').map((x) => x.address);
}
