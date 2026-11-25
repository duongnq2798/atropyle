import { AtropyleError, type PreparedTx, recoveryPowerWarning, type TxPlan, type Warning } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { applyStep, failStep, recoveryPowerParams, txView } from '../../src/tx/tx-view';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const H = `0x${'12'.repeat(32)}` as const;

function step(over: Partial<PreparedTx> = {}): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary: 'Check in.',
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
    ...over,
  };
}

function plan(steps: PreparedTx[], warnings: Warning[] = []): TxPlan {
  return { chainId: 196, from: A, vault: V, steps, summary: 'Plan', warnings };
}

describe('txView', () => {
  it('a plan whose simulations pass can be sent', () => {
    const v = txView(plan([step(), step({ simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' } })]));
    expect(v.canSend).toBe(true);
    expect(v.rows.map((r) => r.phase)).toEqual(['ready', 'skipped']);
    expect(v.rows.map((r) => r.gas)).toEqual([50_000n, null]);
    expect(v.blockedAt).toBeNull();
  });

  it('a failed simulation blocks the plan', () => {
    const error = new AtropyleError('NOT_OWNER').toJSON();
    const v = txView(plan([step(), step({ simulation: { ok: false, error } })]));
    expect(v.canSend).toBe(false);
    expect(v.blockedAt).toBe(1);
    expect(v.blockedError).toEqual(error);
    expect(v.rows[1]).toMatchObject({ phase: 'blocked', simulation: 'failed', error });
  });

  it('lists each warning once', () => {
    const w: Warning = { code: 'UNLIMITED_APPROVAL', message: 'Unlimited approval.' };
    const g: Warning = { code: 'GUARDIAN_VERIFY_OUT_OF_BAND', message: 'Verify out of band.' };
    const v = txView(plan([step({ warnings: [w] }), step({ warnings: [w, g] })], [w]));
    expect(v.warnings.map((x) => x.code)).toEqual(['UNLIMITED_APPROVAL', 'GUARDIAN_VERIFY_OUT_OF_BAND']);
  });

  it('keeps two warnings of one code that name different tokens', () => {
    const a: Warning = { code: 'UNLIMITED_APPROVAL', message: 'Unlimited approval of token A.' };
    const b: Warning = { code: 'UNLIMITED_APPROVAL', message: 'Unlimited approval of token B.' };
    const v = txView(plan([step({ warnings: [a] }), step({ warnings: [b, a] })]));
    expect(v.warnings.map((x) => x.message)).toEqual([a.message, b.message]);
  });

  it('follows the send step by step', () => {
    let v = txView(plan([step(), step()]));
    v = applyStep(v, { index: 0, phase: 'signing' });
    expect(v.rows[0].phase).toBe('signing');
    v = applyStep(v, { index: 0, phase: 'pending', hash: H });
    v = applyStep(v, { index: 0, phase: 'confirmed', hash: H });
    expect(v.rows[0]).toMatchObject({ phase: 'confirmed', hash: H });
    const err = new AtropyleError('USER_REJECTED').toJSON();
    v = failStep(v, 1, err);
    expect(v.rows[1]).toMatchObject({ phase: 'failed', error: err });
    expect(v.rows[0].phase).toBe('confirmed');
  });
});

describe('RECOVERY_POWER', () => {
  const DAYS_14 = 14 * 86_400;

  it('shows once when the plan and its createVault step both carry it (PR #18)', () => {
    const w = recoveryPowerWarning(2, 3, DAYS_14);
    const v = txView(plan([step({ action: 'createVault', warnings: [w] })], [w]));
    expect(v.warnings).toEqual([w]);
  });

  it('gives k, n and the window from the typed numbers, never from the message', () => {
    const w = recoveryPowerWarning(2, 3, DAYS_14);
    expect(recoveryPowerParams(w)).toEqual({ k: 2, n: 3, window: DAYS_14 });
    expect(recoveryPowerParams({ ...w, message: 'something else' })).toEqual({ k: 2, n: 3, window: DAYS_14 });
  });

  it('gives null for another code, or for numbers that are missing or not safe integers', () => {
    const other: Warning = { code: 'NO_GUARDIANS', message: 'x', params: { k: 2, guardians: 3, window: 60 } };
    expect(recoveryPowerParams(other)).toBeNull();
    const w = recoveryPowerWarning(2, 3, 60);
    const bad: (Record<string, number> | undefined)[] = [
      undefined,
      {},
      { k: 2, guardians: 3 },
      { k: 1.5, guardians: 3, window: 60 },
      { k: 2, guardians: Number.NaN, window: 60 },
      { k: 2, guardians: 3, window: 2 ** 53 },
    ];
    for (const params of bad) expect(recoveryPowerParams({ ...w, params }), JSON.stringify(params)).toBeNull();
  });
});
