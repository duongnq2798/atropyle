import { describe, expect, it } from 'vitest';
import { planOwner } from '../../src/ops/index';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const issues = (e: unknown) => (e as { details?: { issues?: unknown } }).details?.issues;

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('planOwner', () => {
  it('prefers the explicit owner and reads the plan owner otherwise', () => {
    expect(planOwner({ owner: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }, OWNER)).toBe(OWNER);
    expect(planOwner({ owner: OWNER })).toBe(OWNER);
  });

  it.each(['not-an-address', 42])('blames the plan for a bad owner field (%s), in the SDK issue form', (owner) => {
    expect(() => planOwner({ owner })).toThrowError(expect.objectContaining({ code: 'PLAN_INVALID' }));
    const e = thrown(() => planOwner({ owner }));
    expect(issues(e)).toEqual([{ path: 'owner', code: 'INVALID_ADDRESS', message: 'owner: not a valid address' }]);
    expect((e as Error).cause).toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('blames the argument for a bad owner argument', () => {
    expect(() => planOwner({ owner: OWNER }, 'nope')).toThrowError(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
  });

  it('asks for an owner without naming a CLI flag', () => {
    expect(() => planOwner({})).toThrowError(expect.objectContaining({ code: 'PLAN_INVALID' }));
    const e = thrown(() => planOwner({})) as { hint: string };
    expect(issues(e)).toMatchObject([{ path: 'owner', code: 'REQUIRED' }]);
    expect(e.hint).not.toMatch(/--/);
  });
});
