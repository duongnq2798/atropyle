import { AtropyleError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { exitCodeFor, UsageError } from '../../src/exit';

const code = (c: string, command = 'status') => exitCodeFor(new AtropyleError(c as never), command);

describe('exit codes', () => {
  it('maps error codes to 1, 2, 3 and 4', () => {
    expect(exitCodeFor(new UsageError('bad'), 'status')).toBe(2);
    expect(code('INVALID_ADDRESS')).toBe(2);
    expect(code('INVALID_OPTIONS')).toBe(2);
    for (const c of ['RPC_RATE_LIMITED', 'RPC_UNAVAILABLE', 'RPC_DISAGREEMENT', 'QUORUM_UNAVAILABLE', 'WRONG_CHAIN'])
      expect(code(c)).toBe(4);
    expect(code('POLICY_MISMATCH')).toBe(3);
    expect(code('PLAN_INVALID')).toBe(1);
    expect(code('NOT_VAULT')).toBe(1);
    expect(exitCodeFor(new Error('boom'), 'status')).toBe(1);
  });

  it('treats a vault or policy that cannot be checked as a failed verification inside verify', () => {
    expect(code('NOT_VAULT', 'verify')).toBe(3);
    expect(code('POLICY_UNAVAILABLE', 'verify')).toBe(3);
    expect(code('POLICY_UNAVAILABLE', 'status')).toBe(1);
  });
});
