import type { PlanCheck } from '@atropyle/sdk';
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
