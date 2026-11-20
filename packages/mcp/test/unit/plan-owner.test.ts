import { describe, expect, it } from 'vitest';
import { planOwner } from '../../src/ops/index';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('planOwner', () => {
  it('prefers the explicit owner and reads the plan owner otherwise', () => {
    expect(planOwner({ owner: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }, OWNER)).toBe(OWNER);
    expect(planOwner({ owner: OWNER })).toBe(OWNER);
  });

  it('reports a bad owner in the plan file as PLAN_INVALID at /owner (the file is wrong)', () => {
    for (const owner of ['not-an-address', 42]) {
      try {
        planOwner({ owner });
        expect.unreachable();
      } catch (e) {
        expect(e).toMatchObject({ code: 'PLAN_INVALID' });
        expect(JSON.stringify((e as { details?: unknown }).details)).toContain('"/owner"');
      }
    }
  });

  it('reports a bad owner argument as INVALID_ADDRESS (the command line is wrong)', () => {
    expect(() => planOwner({ owner: OWNER }, 'nope')).toThrowError(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
  });

  it('asks for an owner when neither the plan nor the argument has one', () => {
    expect(() => planOwner({})).toThrowError(expect.objectContaining({ code: 'PLAN_INVALID' }));
  });
});
