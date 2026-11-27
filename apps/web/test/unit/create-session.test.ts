import { describe, expect, it } from 'vitest';
import * as impl from '../../src/flows/impl';
import { PEOPLE } from './fixtures';

const salt = `0x${'ab'.repeat(32)}` as const;
const good = (patch: Record<string, unknown> = {}) => ({
  v: 1,
  ...impl.freshState(impl.initialForm(true), salt),
  ...patch,
});

describe('wizard session', () => {
  it('revives what it wrote', () => {
    const { v: _, ...s } = good({ step: 'timing' });
    expect(impl.reviveSession(JSON.parse(JSON.stringify({ v: 1, ...s })))).toEqual(s);
  });

  it('rejects anything off: another version, a bad salt, a done step without a vault', () => {
    expect(impl.reviveSession(good({ v: 2 }))).toBeNull();
    expect(impl.reviveSession(good({ salt: '0x12' }))).toBeNull();
    expect(impl.reviveSession(good({ step: 'done', vault: null }))).toBeNull();
    expect(impl.reviveSession(good({ step: 'done', vault: PEOPLE.vault }))?.step).toBe('done');
    expect(impl.reviveSession(good({ step: 'nope' }))).toBeNull();
    expect(impl.reviveSession(good({ form: { ...impl.initialForm(true), heirs: [] } }))).toBeNull();
    expect(impl.reviveSession(good({ createStep: -2 }))).toBeNull();
    expect(impl.reviveSession('x')).toBeNull();
  });

  it('newSalt gives 32 bytes of hex', () => {
    expect(impl.newSalt(() => new Uint8Array(32).fill(1))).toBe(`0x${'01'.repeat(32)}`);
    expect(impl.newSalt()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("withKind keeps the people and takes the new kind's guardians and timing", () => {
    const drill = { ...impl.initialForm(true), heirs: [{ account: PEOPLE.heirA, percent: '100' }] };
    const real = impl.withKind(drill, false);
    expect(real.heirs).toEqual(drill.heirs);
    expect(real).toMatchObject({ drill: false, template: 'guarded', timing: { preset: 'sixMonths' } });
    expect(real.guardians.length).toBeGreaterThan(0);
    expect(impl.withKind(real, true)).toMatchObject({ drill: true, template: 'simple', timing: { preset: 'drill' } });
  });

  it('withKind changes only the kind, the template, the timing and the guardians', () => {
    const drill = {
      ...impl.initialForm(true),
      heirs: [{ account: PEOPLE.heirA, percent: '100' }],
      k: '2',
      recoveryEnabled: true,
      assets: [{ kind: 'erc20' as const, token: PEOPLE.vault, id: '', heir: '0' }],
    };
    const strip = ({ drill: _d, template: _t, timing: _ti, guardians: _g, ...rest }: impl.CreateForm) => rest;
    expect(strip(impl.withKind(drill, false))).toEqual(strip(drill));
    expect(impl.withKind(drill, true)).toBe(drill);
  });

  it('savedPlan keeps the payload, the vault and where createVault is', () => {
    const plan = {
      vault: PEOPLE.vault,
      steps: [{ action: 'approve' }, { action: 'createVault' }],
    } as unknown as Parameters<typeof impl.savedPlan>[0];
    // Not a real plan: toPayload throws, so the session keeps no payload (no resume) but still the vault.
    expect(impl.savedPlan(plan)).toEqual({ payload: null, vault: PEOPLE.vault, createStep: 1, offset: 0 });
  });
});
