import type { AtropyleClient } from '@atropyle/sdk';
import { type Address, erc20Abi } from 'viem';
import { type Untrusted, untrusted } from '@/lib/untrusted';

export interface TokenBalance {
  token: Address;
  /** null: the token did not answer (not deployed here, or an RPC error). */
  balance: bigint | null;
  decimals: number | null;
}

/** What the owner holds of each listed token today (spec §5.2 step 5). One failure never hides the others. */
export async function tokenBalances(
  atro: AtropyleClient,
  owner: Address,
  tokens: readonly Address[],
): Promise<TokenBalance[]> {
  const c = atro.publicClient;
  const read = (token: Address) =>
    Promise.all([
      c.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
      c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    ]);
  const settled = await Promise.allSettled(tokens.map(read));
  return settled.map((r, i) => {
    const token = tokens[i] as Address;
    return r.status === 'fulfilled'
      ? { token, balance: r.value[0], decimals: Number(r.value[1]) }
      : { token, balance: null, decimals: null };
  });
}

export interface TokenMeta {
  token: Address;
  /** Untrusted text from the token's contract; null when it did not answer or answered nothing. */
  symbol: Untrusted | null;
  /** null when it did not answer, or out of the range a token can have (0 to 36, as the SDK's readTokenInfo). */
  decimals: number | null;
}

/**
 * The symbol and decimals of each ERC-20, so the wallet mirror can name it after a reload, when the chain check of
 * the plan is not run again. The reads go out together (the SDK's transport batches them into one request; Multicall3
 * is not used, since only verify trusts it, and only after checking its code). It never throws: a token that does not
 * answer, for any reason, is only left unnamed.
 */
export async function tokenMeta(
  atro: Pick<AtropyleClient, 'publicClient'>,
  tokens: readonly Address[],
): Promise<TokenMeta[]> {
  const c = atro.publicClient;
  const symbolOf = async (token: Address) => c.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' });
  const decimalsOf = async (token: Address) =>
    c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' });
  const [symbols, decimals] = await Promise.all([
    Promise.allSettled(tokens.map(symbolOf)),
    Promise.allSettled(tokens.map(decimalsOf)),
  ]);
  return tokens.map((token, i) => {
    const s = symbols[i];
    const d = decimals[i];
    const symbol = s?.status === 'fulfilled' ? untrusted(s.value) : null;
    const dec = d?.status === 'fulfilled' ? Number(d.value) : null;
    return {
      token,
      symbol: symbol && symbol.value !== '' ? symbol : null,
      decimals: dec !== null && Number.isInteger(dec) && dec >= 0 && dec <= 36 ? dec : null,
    };
  });
}
