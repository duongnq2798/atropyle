import type { Address } from 'viem';
import { factoryAbi } from '../abi/index';
import type { Untrusted } from '../untrusted';
import type { ReadContext } from './context';

export interface FeeOption {
  token: Address;
  symbol: Untrusted;
  decimals: number | null;
  /** Fee charged by the next paid createVault. */
  fee: bigint;
  early: bigint;
  full: bigint;
}

export interface FeeQuote {
  blockNumber: bigint;
  paidCount: bigint;
  earlyCount: bigint;
  earlyRemaining: bigint;
  tokens: FeeOption[];
}

export async function readFees(ctx: ReadContext): Promise<FeeQuote> {
  const { client: c, deployment: d } = ctx;
  const blockNumber = await c.getBlockNumber();
  const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;
  const [paidCount, earlyCount] = await Promise.all([
    c.readContract({ ...f, functionName: 'paidCount' }),
    c.readContract({ ...f, functionName: 'EARLY_COUNT' }),
  ]);
  const early = paidCount < earlyCount;
  const tokens = await Promise.all(
    d.feeTokens.map(async (token) => {
      const [e, full, info] = await Promise.all([
        c.readContract({ ...f, functionName: 'earlyFee', args: [token] }),
        c.readContract({ ...f, functionName: 'fullFee', args: [token] }),
        ctx.token(token, blockNumber),
      ]);
      return { token, symbol: info.symbol, decimals: info.decimals, early: e, full, fee: early ? e : full };
    }),
  );
  return { blockNumber, paidCount, earlyCount, earlyRemaining: early ? earlyCount - paidCount : 0n, tokens };
}
