import { describe, expect, it } from 'vitest';
import { applyAction, deriveInputs, evalStateOf, modelEngine, predictAction } from '../../src/index';
import { DAY, G1, G2, G3, HEIR_A, HEIR_B, makeSnapshot, NEW_WALLET, NFT, OWNER, TOKEN, VAULT } from './fixtures';

const engine = modelEngine();
const ZERO = '0x0000000000000000000000000000000000000000';

describe('deriveInputs', () => {
  it('mirrors _evaluate: idle clamp, windowDone boundary, recovery bitmap', () => {
    const s = evalStateOf(
      makeSnapshot({ state: 'grace', alarmAt: 3n * DAY, recVotes: [NEW_WALLET, NEW_WALLET, null] }),
    );
    expect(deriveInputs(s, 100n * DAY).idle).toBe(15);
    expect(deriveInputs(s, 6n * DAY - 1n).windowDone).toBe(false);
    expect(deriveInputs(s, 6n * DAY).windowDone).toBe(true);
    expect(deriveInputs(s, 6n * DAY, { candidate: NEW_WALLET }).recVotes).toBe(0b011);
    expect(deriveInputs(s, 6n * DAY).recVotes).toBe(0);
    expect(deriveInputs({ ...s, recoveryEnabled: false }, 6n * DAY, { candidate: NEW_WALLET }).recVotes).toBe(0);
    const rec = { ...s, state: 3, recoveryTarget: NEW_WALLET };
    expect(deriveInputs(rec, 6n * DAY, { candidate: null }).recVotes).toBe(0b011);
  });

  it('owner actions reset lastAlive and every vote first', () => {
    const s = evalStateOf(makeSnapshot({ inhVotes: 0b101, recVotes: [NEW_WALLET, null, NEW_WALLET] }));
    const a = applyAction(s, { type: 'checkIn' }, OWNER, 50n, false);
    expect(a?.alive).toBe(true);
    expect(a?.next.lastAlive).toBe(50n);
    expect(a?.next.inhVotes).toBe(0);
    expect(a?.next.recVotes).toEqual([null, null, null]);
    expect(applyAction(s, { type: 'checkIn' }, HEIR_A, 50n, false)).toBeNull();
    expect(applyAction(s, { type: 'attestDeath', on: true }, HEIR_A, 50n, false)).toBeNull();
    expect(applyAction(s, { type: 'revokeAll' }, OWNER, 50n, false)).toBeNull();
    expect(applyAction(s, { type: 'poke' }, OWNER, 50n, false)).toMatchObject({
      alive: true,
      next: { lastAlive: 50n, inhVotes: 0 },
    });
    expect(applyAction(s, { type: 'distribute' }, HEIR_A, 50n, false)).toEqual({
      next: s,
      alive: false,
      candidate: null,
    });
    const g = applyAction(
      s,
      { type: 'setGuardians', guardians: [G2], k: 1, recoveryEnabled: false },
      OWNER,
      50n,
      false,
    );
    expect(g?.next.guardians).toEqual([G2]);
    expect(g?.next.recVotes).toEqual([null]);
  });

  it('guardian votes only touch their own bit; a zero-address recovery target withdraws the vote', () => {
    const s = evalStateOf(makeSnapshot({ inhVotes: 0b001, recVotes: [NEW_WALLET, null, null] }));
    const on = applyAction(s, { type: 'attestDeath', on: true }, G3, 50n, false);
    expect(on).toMatchObject({ alive: false, candidate: null, next: { inhVotes: 0b101 } });
    const off = applyAction(s, { type: 'attestDeath', on: false }, G1, 50n, false);
    expect(off?.next.inhVotes).toBe(0);
    const vote = applyAction(s, { type: 'voteRecovery', target: NEW_WALLET.toLowerCase() }, G2, 50n, false);
    expect(vote).toMatchObject({ candidate: NEW_WALLET, next: { recVotes: [NEW_WALLET, NEW_WALLET, null] } });
    const withdraw = applyAction(s, { type: 'voteRecovery', target: ZERO }, G1, 50n, false);
    expect(withdraw).toMatchObject({ candidate: null, next: { recVotes: [null, null, null] } });
    expect(applyAction(s, { type: 'voteRecovery', target: NEW_WALLET }, HEIR_A, 50n, false)).toBeNull();
    const off2 = { ...s, recoveryEnabled: false };
    expect(applyAction(off2, { type: 'voteRecovery', target: NEW_WALLET }, G1, 50n, false)).toBeNull();
  });

  it('setTiming is a check-in under the new timing; a malformed target names its path', () => {
    const s = evalStateOf(makeSnapshot({ lastAlive: 5n }));
    const t = applyAction(s, { type: 'setTiming', timing: 'drill' }, OWNER, 50n, true);
    expect(t).toMatchObject({
      alive: true,
      next: { lastAlive: 50n, timing: { period: 60, threshold: 2, window: 120 } },
    });
    expect(() => applyAction(s, { type: 'voteRecovery', target: 'nope' }, G1, 50n, false)).toThrow(
      expect.objectContaining({ code: 'INVALID_ADDRESS', details: expect.objectContaining({ path: 'target' }) }),
    );
  });
});

describe('predictAction', () => {
  it('check-in during grace cancels the alarm', () => {
    const snap = makeSnapshot({ state: 'grace', lastAlive: 0n, alarmAt: 3n * DAY, now: 4n * DAY });
    const r = predictAction(engine, snap, { type: 'checkIn' }, OWNER, 4n * DAY);
    expect(r).toMatchObject({
      from: 'grace',
      next: 'active',
      cancel: true,
      alarm: false,
      release: false,
      recoveryTarget: null,
    });
  });

  it('poke and distribute signed by the owner are check-ins', () => {
    const snap = makeSnapshot({ state: 'grace', lastAlive: 0n, alarmAt: 3n * DAY, now: 4n * DAY });
    for (const type of ['poke', 'distribute'] as const) {
      expect(predictAction(engine, snap, { type }, OWNER, 4n * DAY)).toMatchObject({
        from: 'grace',
        next: 'active',
        cancel: true,
        recipients: [],
      });
      expect(predictAction(engine, snap, { type }, HEIR_A, 4n * DAY)).toMatchObject({
        from: 'grace',
        next: 'grace',
        cancel: false,
      });
    }
  });

  it('the k-th attestation after the window releases to heirs with the on-chain split', () => {
    const snap = makeSnapshot({ state: 'grace', alarmAt: 3n * DAY, inhVotes: 0b001, now: 7n * DAY });
    const r = predictAction(engine, snap, { type: 'attestDeath', on: true }, G2, 7n * DAY);
    expect(r).toMatchObject({ next: 'releasedInherit', release: true });
    expect(r?.recipients).toEqual([
      { assetIndex: 0, kind: 'erc20', token: TOKEN, to: HEIR_A, amount: 600_000n },
      { assetIndex: 0, kind: 'erc20', token: TOKEN, to: HEIR_B, amount: 400_001n },
      { assetIndex: 1, kind: 'erc721', token: NFT, to: HEIR_B, amount: 1n },
    ]);
  });

  it('k recovery votes raise a recovery alarm with the target', () => {
    const snap = makeSnapshot({ recVotes: [NEW_WALLET, null, null] });
    const r = predictAction(engine, snap, { type: 'voteRecovery', target: NEW_WALLET }, G3, 10n);
    expect(r).toMatchObject({ from: 'active', next: 'recovery', alarm: true, recoveryTarget: NEW_WALLET });
  });

  it('recovery release sends everything to the target', () => {
    const snap = makeSnapshot({
      state: 'recovery',
      alarmAt: 0n + 10n,
      recoveryTarget: NEW_WALLET,
      recVotes: [NEW_WALLET, NEW_WALLET, null],
      now: 10n + 3n * DAY,
    });
    const r = predictAction(engine, snap, { type: 'poke' }, G1, 10n + 3n * DAY);
    expect(r?.next).toBe('releasedRecover');
    expect(r?.recipients.map((x) => x.to)).toEqual([NEW_WALLET, NEW_WALLET]);
    expect(r?.recipients[0].amount).toBe(1_000_001n);
  });

  it('expired drill: nothing can change', () => {
    const snap = makeSnapshot({
      drill: true,
      expiresAt: 100n,
      now: 100n,
      lastAlive: 0n,
      timing: { period: 60, threshold: 2, window: 120 },
    });
    const r = predictAction(engine, snap, { type: 'poke' }, G1, 100n);
    expect(r).toMatchObject({ from: 'active', next: 'active', alarm: false, release: false, drillExpired: true });
    // An owner-signed poke would be a check-in, but the vault reverts DrillExpired before it gets that far.
    expect(predictAction(engine, snap, { type: 'poke' }, OWNER, 100n)).toMatchObject({
      next: 'active',
      cancel: false,
      drillExpired: true,
    });
  });

  it('a drill that has not expired yet still reaches the policy', () => {
    const snap = makeSnapshot({
      drill: true,
      expiresAt: 200n,
      now: 130n,
      timing: { period: 60, threshold: 2, window: 120 },
    });
    expect(predictAction(engine, snap, { type: 'poke' }, G1, 130n)).toMatchObject({
      next: 'grace',
      alarm: true,
      drillExpired: false,
    });
    expect(predictAction(engine, snap, { type: 'poke' }, G1, 200n)).toMatchObject({
      next: 'active',
      alarm: false,
      drillExpired: true,
    });
  });

  it('expired drill that was already released: distribute pays nobody', () => {
    const snap = makeSnapshot({ state: 'releasedInherit', drill: true, expiresAt: 100n, now: 100n });
    expect(predictAction(engine, snap, { type: 'distribute' }, HEIR_A, 100n)).toMatchObject({
      next: 'releasedInherit',
      recipients: [],
      drillExpired: true,
    });
  });

  it('recovery targets the vault refuses: owner, the vault itself, a guardian', () => {
    const snap = makeSnapshot();
    for (const target of [OWNER, VAULT, G2, ` ${OWNER.toLowerCase()} `, `${VAULT} `]) {
      expect(predictAction(engine, snap, { type: 'voteRecovery', target }, G1, 10n)).toBeNull();
    }
    expect(predictAction(engine, snap, { type: 'voteRecovery', target: null }, G1, 10n)).toMatchObject({
      next: 'active',
    });
    expect(predictAction(engine, snap, { type: 'voteRecovery', target: ZERO }, G1, 10n)).toMatchObject({
      next: 'active',
    });
  });

  it('non-guardians and released vaults', () => {
    expect(predictAction(engine, makeSnapshot(), { type: 'attestDeath', on: true }, HEIR_A, 10n)).toBeNull();
    const done = makeSnapshot({ state: 'releasedInherit' });
    expect(predictAction(engine, done, { type: 'distribute' }, HEIR_A, 10n)).toMatchObject({
      next: 'releasedInherit',
      release: false,
      drillExpired: false,
    });
  });

  it('a released vault lists recipients only for distribute', () => {
    const done = makeSnapshot({ state: 'releasedRecover', recoveryTarget: NEW_WALLET });
    expect(predictAction(engine, done, { type: 'distribute' }, HEIR_A, 10n)?.recipients).toHaveLength(2);
    expect(predictAction(engine, done, { type: 'poke' }, HEIR_A, 10n)?.recipients).toEqual([]);
  });
});
