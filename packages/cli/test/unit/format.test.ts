import type { SimulateOutput } from '@atropyle/mcp/ops';
import { describe, expect, it } from 'vitest';
import { formatSimulate } from '../../src/format';
import { PLAIN } from '../../src/style';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

const output = (effect: Record<string, unknown>) =>
  ({
    mode: 'action',
    summary: 'poke by someone.',
    effect: {
      at: '1800000000',
      engine: 'model',
      from: 'active',
      next: 'active',
      drillExpired: false,
      recipients: [],
      ...effect,
    },
    simulation: { ok: 'skipped', reason: 'FUTURE_TIME' },
    warnings: [],
    untrusted: { notice: '', texts: [] },
  }) as unknown as SimulateOutput;

describe('formatSimulate', () => {
  it('says when the Drill will have expired by then', () => {
    expect(formatSimulate(output({ drillExpired: true }), PLAIN)).toContain('The Drill will have expired by then');
    expect(formatSimulate(output({}), PLAIN)).not.toContain('expired');
  });

  it('labels recipient amounts as base units', () => {
    const recipients = [{ assetIndex: 0, kind: 'erc20', token: A(9), to: A(2), amount: '1000000' }];
    expect(formatSimulate(output({ recipients }), PLAIN)).toContain(`pays 1000000 (base units) of erc20 ${A(9)}`);
  });
});
