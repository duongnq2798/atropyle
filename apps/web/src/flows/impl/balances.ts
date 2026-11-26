import type { AtropyleClient } from '@atropyle/sdk';
import { type Address, erc20Abi } from 'viem';

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
