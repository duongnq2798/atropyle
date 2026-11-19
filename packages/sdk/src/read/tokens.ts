import { type Address, erc20Abi, type PublicClient } from 'viem';
import { decodeError, isContractAnswer } from '../errors';
import { untrusted } from '../untrusted';
import type { TokenInfo } from './types';

const value = <T>(r: PromiseSettledResult<T>): T | undefined => (r.status === 'fulfilled' ? r.value : undefined);

/**
 * name/symbol are untrusted text; decimals is null when absent or out of range. A token that answers a read with a
 * revert or nothing reads as empty metadata. Any other failure (a throttled or lagging RPC, a malformed response) is
 * rethrown: it must not be mistaken for a token without decimals.
 */
export async function readTokenInfo(c: PublicClient, address: Address, blockNumber?: bigint): Promise<TokenInfo> {
  const at = { address, abi: erc20Abi, blockNumber } as const;
  const [symbol, name, decimals] = await Promise.allSettled([
    c.readContract({ ...at, functionName: 'symbol' }),
    c.readContract({ ...at, functionName: 'name' }),
    c.readContract({ ...at, functionName: 'decimals' }),
  ]);
  for (const r of [symbol, name, decimals]) {
    if (r.status === 'rejected' && !isContractAnswer(r.reason)) throw decodeError(r.reason);
  }
  const d = value(decimals);
  return {
    address,
    symbol: untrusted(value(symbol)),
    name: untrusted(value(name)),
    decimals: typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 36 ? d : null,
  };
}
