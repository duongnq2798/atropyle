// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  dueOf,
  editAction,
  FACE_EDGE,
  faceRemaining,
  formatSeconds,
  formsOf,
  IDLE_PROGRESS,
  ownerTokens,
  ritualPhase,
} from '../../src/app/vault/owner-view';
import * as flows from '../../src/flows/impl';
import { jsonStringify } from '../../src/lib/store';
import { fixtureSnapshot } from './fixtures';

const P = IDLE_PROGRESS;

describe('ritualPhase', () => {
  it('follows the runner, never ahead of it', () => {
    expect(ritualPhase('off', P)).toBe('idle');
    expect(ritualPhase('on', P)).toBe('holding');
    expect(ritualPhase('armed', P)).toBe('holding');
    expect(ritualPhase('on', { ...P, busy: true })).toBe('wallet');
    expect(ritualPhase('off', { ...P, committed: true })).toBe('wallet');
    expect(ritualPhase('off', { ...P, committed: true, busy: true, sent: true })).toBe('sent');
    expect(ritualPhase('off', { ...P, committed: true, finished: true })).toBe('tied');
  });

  it('is tied only with a receipt (finished)', () => {
    for (const hold of ['off', 'on', 'armed'] as const)
      for (const busy of [false, true])
        for (const committed of [false, true])
          for (const sent of [false, true])
            expect(ritualPhase(hold, { busy, committed, sent, finished: false })).not.toBe('tied');
  });
});

describe('faceRemaining', () => {
  it('keeps "now" a step in from both ends of the face, where the Thread would cut it in half', () => {
    expect(FACE_EDGE).toBe(0.05);
    // Just checked in: "now" stands where a fresh knot ties, not on the face's left edge.
    expect(faceRemaining(1)).toBe(0.95);
    expect(faceRemaining(0.999)).toBe(0.95);
    expect(faceRemaining(0.5)).toBe(0.5);
    // Nearly late: a step in from the right edge.
    expect(faceRemaining(0.001)).toBe(0.05);
    // Late: none left stays none, so the face draws no "now" (geometry.ts).
    expect(faceRemaining(0)).toBe(0);
  });
});

describe('formatSeconds', () => {
  it('one decimal, the language separator, a no-break space', () => {
    expect(formatSeconds(812, 'en')).toBe('0.8\u00a0s');
    expect(formatSeconds(1290, 'vi')).toBe('1,3\u00a0s');
    expect(formatSeconds(-5, 'en')).toBe('0.0\u00a0s');
  });
});

describe('dueOf', () => {
  const s = fixtureSnapshot().status;
  it('active: the late moment', () => {
    expect(dueOf({ ...s, state: 'active', pending: 'active' })).toEqual({ kind: 'dueActive', at: s.lateAt });
  });
  it('grace and recovery: the end of the window', () => {
    const w = { ...s, windowEndsAt: 1200n };
    expect(dueOf({ ...w, state: 'grace', pending: 'grace' })).toEqual({ kind: 'dueGrace', at: 1200n });
    expect(dueOf({ ...w, state: 'recovery', pending: 'recovery' })).toEqual({ kind: 'dueRecovery', at: 1200n });
  });
  it('late once the rules move it on, but not when they would end an alarm', () => {
    expect(dueOf({ ...s, state: 'active', pending: 'grace' })).toEqual({ kind: 'dueLate', at: null });
    expect(dueOf({ ...s, state: 'grace', pending: 'releasedInherit', windowEndsAt: 1200n })?.kind).toBe('dueLate');
    expect(dueOf({ ...s, state: 'grace', pending: 'active', windowEndsAt: 1200n })?.kind).toBe('dueGrace');
  });
  it('nothing once released or expired', () => {
    expect(dueOf({ ...s, state: 'releasedInherit', pending: 'releasedInherit' })).toBeNull();
    expect(dueOf({ ...s, expired: true })).toBeNull();
  });
});

describe('ownerTokens', () => {
  it("names the vault's assets as read, then adds typed tokens unnamed, once each", () => {
    const snap = fixtureSnapshot();
    const known = snap.status.assets[0].asset.token;
    const typed = '0x1111111111111111111111111111111111111111';
    const out = ownerTokens(snap, [
      { kind: 'erc20', token: known.toLowerCase(), id: '', heir: '0' },
      { kind: 'erc20', token: typed, id: '', heir: '0' },
    ]);
    expect(out.filter((t) => t.address.toLowerCase() === known.toLowerCase())).toHaveLength(1);
    expect(out.find((t) => t.address.toLowerCase() === known.toLowerCase())?.symbol).toEqual(
      snap.status.assets[0].token.symbol,
    );
    expect(out.find((t) => t.address.toLowerCase() === typed)?.symbol).toBeNull();
  });
});

describe('formsOf and editAction', () => {
  it('a form as the vault stands saves the same action as the vault holds (nothing changed)', () => {
    const c = fixtureSnapshot().config;
    const f = formsOf(flows, c, true);
    for (const part of ['heirs', 'guardians', 'timing', 'assets'] as const) {
      expect(jsonStringify(editAction(flows, part, f))).toBe(
        jsonStringify(editAction(flows, part, formsOf(flows, c, true))),
      );
    }
    expect(editAction(flows, 'guardians', f)).toEqual({
      type: 'setGuardians',
      guardians: c.guardians,
      k: c.k,
      recoveryEnabled: c.recoveryEnabled,
    });
    expect(editAction(flows, 'heirs', f)).toMatchObject({ type: 'setHeirs' });
    expect(editAction(flows, 'timing', f)).toMatchObject({ type: 'setTiming' });
    expect(jsonStringify(editAction(flows, 'assets', f))).toBe(jsonStringify(flows.fixCoverageAction(c)));
  });

  it('a vault without guardians edits to none', () => {
    const c = { ...fixtureSnapshot().config, guardians: [], k: 0, recoveryEnabled: false };
    expect(editAction(flows, 'guardians', formsOf(flows, c, true))).toEqual({
      type: 'setGuardians',
      guardians: [],
      k: 0,
      recoveryEnabled: false,
    });
  });
});
