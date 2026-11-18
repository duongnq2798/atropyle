import { describe, expect, it } from 'vitest';
import { OUT, packInputs, S, type PolicyInputs } from '../src/model';
import { buildAll, buildPolicy, patchRefs, PLACEHOLDER_REFS } from '../src/policy';
import { stepBytes, type Program } from '../src/sim';
import { verifyPolicy } from '../src/verify';

const base: PolicyInputs = { idle: 0, threshold: 3, inhVotes: 0, recVotes: 0, k: 2, alive: false, windowDone: false };

function run(p: Program, s: number, patch: Partial<PolicyInputs>) {
  const w = packInputs({ ...base, ...patch });
  const r = stepBytes(p, Uint8Array.of(s), Uint8Array.of(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff));
  return { next: r.next[0], out: r.out[0] };
}

describe('AtropylePolicy v1', () => {
  const { policy, program } = buildAll();

  it('has the spec shape', () => {
    expect(program).toMatchObject({ nIn: 23, nOut: 3, nState: 3 });
    expect(program.gateCount).toBeLessThanOrEqual(230);
    expect(policy.latch).toBe(3);
    expect(policy.refs.map((r) => r.target)).toEqual(['KofN5', 'KofN5', 'Ge4']);
  });

  it('spot-checks key transitions', () => {
    expect(run(program, S.ACTIVE, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(run(program, S.GRACE, { windowDone: true, inhVotes: 0b11 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(run(program, S.RECOVERY, { windowDone: true, recVotes: 0b11 })).toEqual({ next: S.RELEASED_RECOVER, out: OUT.RELEASE });
    expect(run(program, S.GRACE, { alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
    expect(run(program, S.RELEASED_INHERIT, { alive: true })).toEqual({ next: S.RELEASED_INHERIT, out: 0 });
  });

  // T = 3 and k = 2: idle 3 makes late true, and votes 0b11 (two of k = 2) make recQ true.
  it('gives recQ priority over late (§3.4)', () => {
    expect(run(program, S.ACTIVE, { idle: 3, recVotes: 0b1 })).toEqual({ next: S.GRACE, out: OUT.ALARM }); // late alone
    expect(run(program, S.ACTIVE, { idle: 3, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(run(program, S.RECOVERY, { idle: 3, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: 0 });
    expect(run(program, S.RECOVERY, { idle: 15, recVotes: 0b11, windowDone: true })).toEqual({
      next: S.RELEASED_RECOVER,
      out: OUT.RELEASE,
    });
  });

  it('proves P1–P8 over all 2^26 combinations', () => {
    const r = verifyPolicy(program);
    expect(r.combos).toBe(2 ** 26);
    expect(r.firstFailures).toEqual([]);
    expect(r.mismatches).toBe(0);
    expect(r.violations).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }, 300_000);

  it('catches a broken circuit', () => {
    const swapped: Program = {
      ...program,
      outIdx: Int32Array.of(program.outIdx[1], program.outIdx[0], program.outIdx[2]),
    };
    const r = verifyPolicy(swapped, { blocks: 1 << 12 });
    expect(r.mismatches).toBeGreaterThan(0);
    expect(r.violations[6]).toBeGreaterThan(0);
    expect(r.firstFailures.length).toBe(16);
  });

  it('patching placeholder REFs equals building with real REFs', () => {
    const cpu = '0x' + '5a'.repeat(20);
    const real = buildPolicy({
      kofn: { ...PLACEHOLDER_REFS.kofn, cpu, id: 10n },
      ge4: { ...PLACEHOLDER_REFS.ge4, cpu, id: 11n },
    });
    expect(patchRefs(policy.bytes, policy.refs, cpu, [10n, 11n])).toEqual(real.bytes);
  });
});
