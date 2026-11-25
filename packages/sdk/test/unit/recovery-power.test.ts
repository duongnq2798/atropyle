import type { PublicClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import type { VaultAction } from '../../src/actions';
import { getDeployment } from '../../src/deployments/index';
import { modelEngine } from '../../src/policy/engine';
import { prepareAction } from '../../src/prepare/actions';
import type { PrepareContext } from '../../src/prepare/types';
import { G1, G2, makeSnapshot, OWNER, VAULT } from './fixtures';

// A guarded vault with recovery on, k = 2 of 3 guardians and a 3-day window, unless a test turns recovery off.
const snapshot = vi.hoisted(() => ({ recoveryEnabled: true }));
vi.mock('../../src/read/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/read/snapshot')>()),
  readSnapshot: vi.fn(async () => makeSnapshot({ recoveryEnabled: snapshot.recoveryEnabled })),
}));

function context(): PrepareContext {
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'isVault') return true;
      throw new Error(`unexpected read ${functionName}`);
    },
    estimateGas: async () => 50_000n,
  };
  return {
    deployment: getDeployment('local'),
    client: client as unknown as PublicClient,
    token: async () => {
      throw new Error('unexpected token read');
    },
    log: () => {},
    suffix: null,
    engineFor: async () => modelEngine(),
  };
}

const recovery = async (action: VaultAction, recoveryEnabled = true) => {
  snapshot.recoveryEnabled = recoveryEnabled;
  const plan = await prepareAction(context(), VAULT, action, { as: OWNER });
  return { step: plan.steps[0].warnings, plan: plan.warnings.filter((w) => w.code === 'RECOVERY_POWER') };
};

describe('prepare warns RECOVERY_POWER when an owner action leaves recovery on', () => {
  it('setGuardians with recovery on names k, the guardians and the window of the vault', async () => {
    const r = await recovery({ type: 'setGuardians', guardians: [G1, G2], k: 1, recoveryEnabled: true });
    expect(r.step).toEqual([
      {
        code: 'RECOVERY_POWER',
        message:
          'Wallet recovery is on: 1 of 2 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the 3d alarm window ends.',
        params: { k: 1, guardians: 2, window: 3 * 86400 },
      },
    ]);
    expect(r.plan).toEqual(r.step);
  });

  it('setGuardians with recovery off has no such warning', async () => {
    const r = await recovery({ type: 'setGuardians', guardians: [G1, G2], k: 1, recoveryEnabled: false });
    expect(r.step).toEqual([]);
    expect(r.plan).toEqual([]);
  });

  it('setTiming on a vault with recovery on gives the new window', async () => {
    const r = await recovery({ type: 'setTiming', timing: { period: '30d', threshold: 6, window: '7d' } });
    expect(r.step.map((w) => w.params)).toEqual([{ k: 2, guardians: 3, window: 7 * 86400 }]);
    expect((await recovery({ type: 'setTiming', timing: 'sixMonths' }, false)).step).toEqual([]);
  });

  it('a check-in carries none: the vault status shows it', async () => {
    expect((await recovery({ type: 'checkIn' })).plan).toEqual([]);
  });
});
