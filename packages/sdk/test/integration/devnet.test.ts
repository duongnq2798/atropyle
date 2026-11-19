import { erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { cpuAbi, factoryAbi } from '../../src/abi/index';
import { devnet } from './helpers';

describe('devnet', () => {
  it('deploys the factory bound to the mock CPU with three 6-decimal fee tokens', async () => {
    const { deployment: d, publicClient: c } = devnet();
    expect(await c.readContract({ address: d.factory, abi: factoryAbi, functionName: 'cpu' })).toBe(d.cpu);
    expect(await c.readContract({ address: d.factory, abi: factoryAbi, functionName: 'vaultImpl' })).toBe(d.vaultImpl);
    expect(await c.readContract({ address: d.factory, abi: factoryAbi, functionName: 'policyId' })).toBe(1n);
    for (const t of d.feeTokens) {
      expect(await c.readContract({ address: d.factory, abi: factoryAbi, functionName: 'currentFee', args: [t] })).toBe(
        1_990_000n,
      );
    }
    expect(await c.readContract({ address: d.cpu, abi: cpuAbi, functionName: 'netlist', args: [1n] })).toBe('0x');
  });

  it('funds the first six anvil accounts', async () => {
    const { deployment: d, publicClient: c } = devnet();
    for (const a of ANVIL_ACCOUNTS.slice(0, 6)) {
      expect(
        await c.readContract({ address: d.feeTokens[0], abi: erc20Abi, functionName: 'balanceOf', args: [a] }),
      ).toBe(10_000_000_000n);
    }
    expect(d.mocks?.nft).toMatch(/^0x/);
  });
});
