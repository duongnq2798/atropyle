import type { Timeline, VaultConfig, VaultStatus } from '@atropyle/sdk';
import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';
import { explainStatus, iso } from '../../src/ops/index';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const status: VaultStatus = {
  vault: A(1),
  chainId: 31337,
  blockNumber: 10n,
  blockTimestamp: 1_000n,
  state: 'active',
  stateCode: 0,
  pending: 'active',
  pendingCode: 0,
  idle: 0,
  lastAlive: 1_000n,
  lateAt: 1_120n,
  alarmAt: null,
  windowEndsAt: null,
  releasedAt: null,
  expiresAt: 605_800n,
  expired: false,
  inhVotes: 0,
  inhVoters: [],
  recoveryTarget: null,
  recVotes: [],
  assets: [],
};
const config: VaultConfig = {
  owner: A(2),
  drill: true,
  heirs: [{ account: A(3), bps: 10_000 }],
  guardians: [A(4), A(5)],
  k: 1,
  recoveryEnabled: false,
  timing: { period: 60, threshold: 2, window: 120 },
  assets: [],
};
const timeline: Timeline = {
  now: 1_000n,
  engine: 'model',
  milestones: { lateAt: 1_120n, maxedAt: 1_900n, windowEndsAt: null, expiresAt: 605_800n },
  events: [],
  earliestRelease: 1_240n,
  nextCheckAt: 1_120n,
};

describe('explainStatus', () => {
  it('formats unix seconds as ISO 8601 without milliseconds', () => {
    expect(iso(1_240n)).toBe('1970-01-01T00:20:40Z');
    expect(iso(null)).toBeNull();
  });

  it('says how long the owner has to cancel an alarm', () => {
    const lines = explainStatus({ ...status, state: 'grace', alarmAt: 1_120n, windowEndsAt: 1_240n }, config, timeline);
    expect(lines[0]).toBe(
      'Grace. The alarm went off at 1970-01-01T00:18:40Z. The owner can cancel it by checking in before 1970-01-01T00:20:40Z.',
    );
    expect(lines).toContain('0 of 2 guardians have attested death; the vault needs 1.');
    expect(lines).toContain('If nobody acts, the earliest release is 1970-01-01T00:20:40Z.');
  });

  it('points out a transition that anyone but the owner can record', () => {
    const lines = explainStatus({ ...status, pending: 'grace', pendingCode: 1 }, config, timeline);
    expect(lines).toContain(
      'The policy already allows a move to grace. A poke from anyone but the owner records it; from the owner it is a check-in.',
    );
  });

  it('drops guardian counts and release forecasts once released, and flags an expired Drill', () => {
    const lines = explainStatus(
      { ...status, state: 'releasedInherit', releasedAt: 1_240n, expired: true },
      config,
      timeline,
    );
    expect(lines.join(' ')).not.toMatch(/guardians have attested|earliest release/);
    expect(lines).toContain('This Drill has expired and accepts no more actions.');
  });
});
