import { custom, type Hex, http } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS, rpc } from '../../../../scripts/lib/anvil';
import { createAtropyle, PRESETS } from '../../src/index';
import { createVaultRaw, devnet, revertChain, snapshotChain } from './helpers';

const [, OWNER, HEIR, , , , , , STRANGER] = ANVIL_ACCOUNTS;

describe('verify on the devnet', () => {
  const env = devnet();
  const two = () => [http(env.rpcUrl), http(env.rpcUrl)];
  const atro = createAtropyle({ chain: env.deployment, verifyTransports: two() });
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('integrity passes on the devnet and fails on a wrong code hash', async () => {
    const r = await atro.integrity();
    expect(r.ok).toBe(true);
    expect(r.rpcs).toBe(2);
    expect(r.warnings).toEqual([]);
    expect(r.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'factory.cpu',
        'factory.policyId',
        'factory.vaultImpl',
        'factory.treasury',
        'vaultImpl.codehash',
      ]),
    );
    expect(r.checks.some((c) => c.name.startsWith('cpu.') || c.name.startsWith('netlist.'))).toBe(false);
    const bad = createAtropyle({
      chain: { ...env.deployment, vaultImplCodehash: `0x${'00'.repeat(32)}` },
      verifyTransports: two(),
    });
    const b = await bad.integrity();
    expect(b.ok).toBe(false);
    expect(b.checks.find((c) => !c.ok)?.name).toBe('vaultImpl.codehash');
  });

  it('vault.verify checks the proxy and binding; the policy proof is unavailable on the mock CPU', async () => {
    const vault = await createVaultRaw(env, {
      owner: OWNER,
      params: {
        heirs: [{ account: HEIR, bps: 10000 }],
        guardians: [],
        k: 0,
        recoveryEnabled: false,
        timing: PRESETS.drill,
        assets: [],
      },
    });
    const r = await atro.vault(vault).verify({ policy: false });
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.policy).toEqual({ status: 'skipped' });
    expect(r.snapshot.status.blockNumber).toBe(r.blockNumber);
    expect(r.timeline.engine).toBe('model');
    const full = await atro.vault(vault).verify();
    expect(full.ok).toBe(false);
    expect(full.policy).toMatchObject({ status: 'unavailable', error: { code: 'POLICY_UNAVAILABLE' } });
    await expect(atro.verifyPolicy()).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' });
    await expect(atro.vault(STRANGER).verify()).rejects.toMatchObject({ code: 'NOT_VAULT' });
  });

  it('a lying RPC makes verification fail with RPC_DISAGREEMENT', async () => {
    const liar = custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        const result = await rpc(env.rpcUrl, method, params as unknown[]);
        return method === 'eth_call' ? `0x${'00'.repeat(12)}${'ab'.repeat(20)}` : result;
      },
    });
    const lied = createAtropyle({ chain: env.deployment, verifyTransports: [http(env.rpcUrl), liar] });
    await expect(lied.integrity()).rejects.toMatchObject({ code: 'RPC_DISAGREEMENT' });
  });
});
