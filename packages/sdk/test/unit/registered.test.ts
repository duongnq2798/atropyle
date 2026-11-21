import {
  type Address,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { factoryAbi } from '../../src/abi/index';
import type { VaultAction } from '../../src/actions';
import { createAtropyle } from '../../src/client';
import { getDeployment } from '../../src/deployments/index';
import { modelEngine } from '../../src/policy/engine';
import { prepareAction } from '../../src/prepare/actions';
import type { PrepareContext } from '../../src/prepare/types';
import { makeSnapshot, NFT, OWNER, TOKEN, VAULT } from './fixtures';

// The snapshot reads are tested elsewhere; here every prepare sees the same guarded vault at block 100.
vi.mock('../../src/read/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/read/snapshot')>()),
  readSnapshot: vi.fn(async () => makeSnapshot()),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const deployment = getDeployment('local');

interface Read {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
}

/** A prepare context whose only answers are `isVault` and a gas estimate; any other read fails the test. */
function context(isVault: boolean) {
  const reads: Read[] = [];
  const client = {
    readContract: vi.fn(async (r: Read) => {
      reads.push({ address: r.address, functionName: r.functionName, args: r.args, blockNumber: r.blockNumber });
      if (r.functionName === 'isVault') return isVault;
      throw new Error(`unexpected read ${r.functionName}`);
    }),
    estimateGas: vi.fn(async () => 50_000n),
  };
  const engineFor = vi.fn(async () => modelEngine());
  const token = vi.fn(async () => {
    throw new Error('unexpected token read');
  });
  const x = {
    deployment,
    client: client as unknown as PublicClient,
    token,
    log: () => {},
    suffix: null,
    engineFor,
  } satisfies PrepareContext;
  return { x, reads, engineFor, token, client };
}

const setAssets: VaultAction = {
  type: 'setAssets',
  assets: [
    { kind: 'erc20', token: TOKEN },
    { kind: 'erc721', token: NFT, id: 1, heir: 1 },
  ],
};

describe('prepare refuses a vault the deployment factory did not create', () => {
  it('throws NOT_VAULT before it builds an approval, reading isVault on the deployment factory at the snapshot block', async () => {
    const { x, reads, engineFor, token, client } = context(false);
    const err = await prepareAction(x, VAULT, setAssets, { as: OWNER }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'NOT_VAULT', details: { vault: VAULT } });
    expect((err as Error).message).toContain(deployment.factory);
    // The snapshot names VAULT as its own factory: only the deployment's factory is asked.
    expect(reads).toEqual([{ address: deployment.factory, functionName: 'isVault', args: [VAULT], blockNumber: 100n }]);
    expect(token).not.toHaveBeenCalled();
    expect(engineFor).not.toHaveBeenCalled();
    expect(client.estimateGas).not.toHaveBeenCalled();
  });

  it('refuses every action, a check-in included', async () => {
    const actions: VaultAction[] = [{ type: 'checkIn' }, { type: 'revokeAll' }, { type: 'distribute' }];
    for (const action of actions) {
      const { x } = context(false);
      await expect(prepareAction(x, VAULT, action, { as: OWNER })).rejects.toMatchObject({ code: 'NOT_VAULT' });
    }
  });

  it('prepares as before when the factory created the vault', async () => {
    const { x, reads } = context(true);
    const plan = await prepareAction(x, VAULT, { type: 'checkIn' }, { as: OWNER });
    expect(plan.steps.map((s) => s.action)).toEqual(['checkIn']);
    expect(plan.steps[0].simulation).toEqual({ ok: true, gas: 50_000n });
    expect(reads).toEqual([{ address: deployment.factory, functionName: 'isVault', args: [VAULT], blockNumber: 100n }]);
  });
});

describe('VaultHandle.registered', () => {
  /** A transport that answers `factory.isVault(VAULT)` and records the call and its block tag. */
  function answering(isVault: boolean) {
    const seen: { to: Address; vault: unknown; block: unknown }[] = [];
    const transport: Transport = custom(
      {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
          const [call, block] = params as [{ to: Address; data?: Hex; input?: Hex }, unknown];
          const decoded = decodeFunctionData({ abi: factoryAbi, data: (call.data ?? call.input) as Hex });
          expect(decoded.functionName).toBe('isVault');
          seen.push({ to: call.to, vault: decoded.args?.[0], block });
          return encodeFunctionResult({ abi: factoryAbi, functionName: 'isVault', result: isVault });
        },
      },
      { retryCount: 0 },
    );
    return { atro: createAtropyle({ chain: 'local', transport }), seen };
  }

  it('reads isVault on the deployment factory, at the block asked for', async () => {
    const { atro, seen } = answering(true);
    expect(await atro.vault(VAULT).registered({ blockNumber: 7n })).toBe(true);
    expect(seen).toEqual([{ to: deployment.factory, vault: VAULT, block: '0x7' }]);
  });

  it('is false for a contract the factory did not create, and reads the latest block by default', async () => {
    const { atro, seen } = answering(false);
    expect(await atro.vault(VAULT).registered()).toBe(false);
    expect(seen[0].block).toBe('latest');
  });
});
