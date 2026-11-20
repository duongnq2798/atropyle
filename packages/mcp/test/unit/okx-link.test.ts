import type { AtropyleClient, TxPlan } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { okxAppLink, okxCommands } from '../../src/ops/index';

const PREFIX = 'https://web3.okx.com/download?deeplink=';

describe('okxAppLink', () => {
  it('wraps an https signing link in the OKX App universal link, encoded twice', () => {
    const link = 'https://duongnq2798.github.io/atropyle/#/sign?p=AbC_-09';
    const out = okxAppLink(link) as string;
    expect(out.startsWith(PREFIX)).toBe(true);
    const deeplink = decodeURIComponent(out.slice(PREFIX.length));
    expect(deeplink).toBe(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(link)}`);
    expect(new URL(deeplink).searchParams.get('dappUrl')).toBe(link);
  });

  it('returns null for links that are not https', () => {
    expect(okxAppLink('http://localhost:5173/#/sign?p=x')).toBeNull();
  });
});

describe('okxCommands', () => {
  const atro = {
    handoff: {
      okx: (tx: { to: string; data: string }) => `onchainos wallet contract-call --to ${tx.to} --input-data ${tx.data}`,
    },
  } as unknown as Pick<AtropyleClient, 'handoff'>;
  const step = (value: bigint) => ({
    chainId: 196,
    from: '0x0000000000000000000000000000000000000001',
    to: '0x0000000000000000000000000000000000000002',
    data: '0x183ff085',
    value,
  });
  const plan = (...values: bigint[]) => ({ steps: values.map(step) }) as unknown as Pick<TxPlan, 'steps'>;

  it('gives one command per step, in order', () => {
    expect(okxCommands(atro, plan(0n, 0n))).toEqual([
      'onchainos wallet contract-call --to 0x0000000000000000000000000000000000000002 --input-data 0x183ff085',
      'onchainos wallet contract-call --to 0x0000000000000000000000000000000000000002 --input-data 0x183ff085',
    ]);
  });

  it('gives none when a step sends native value', () => {
    expect(okxCommands(atro, plan(0n, 1n))).toBeNull();
  });
});
