import { type AtropyleClient, AtropyleError, type IntegrityReport, type PolicyVerification } from '@atropyle/sdk';
import { describe, expect, it, vi } from 'vitest';
import { integrityOutput, throttleProgress, VerifyOutputSchema, verify } from '../../src/ops/index';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const props = Object.fromEntries(
  ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
);
const POLICY = {
  ok: true,
  properties: props,
  combos: 67_108_864,
  ms: 54_200,
  netlists: [],
  cpu: A(3),
  policyId: 1n,
  beaconFrozen: true,
  cpuCheck: null,
  chainId: 196,
  blockNumber: 123n,
  rpcs: 2,
  issues: [],
  firstFailures: [],
  warnings: [],
} as unknown as PolicyVerification;

function stub(verifyPolicy: (o: { onProgress?: (d: number, t: number) => void }) => Promise<PolicyVerification>) {
  return {
    deployment: {
      chainId: 196,
      quorumRpcUrls: [['https://rpc.xlayer.tech/key-abc123'], ['https://xlayer.drpc.org']],
    },
    verifyPolicy,
    vault: () => {
      throw new Error('this test has no vault');
    },
  } as unknown as AtropyleClient;
}

describe('verify', () => {
  it('reports a proven policy, forwards progress and shows operator hosts only', async () => {
    const seen: number[] = [];
    const atro = stub(async (o) => {
      o.onProgress?.(50, 100);
      return POLICY;
    });
    const out = await verify(atro, {}, { onProgress: (d) => seen.push(d) });
    expect(VerifyOutputSchema.parse(out)).toEqual(out);
    expect(out).toMatchObject({ ok: true, target: 'policy', policyStatus: 'verified', rpcs: 2, blockNumber: '123' });
    expect(seen).toEqual([50]);
    expect(out.operators).toEqual([['rpc.xlayer.tech'], ['xlayer.drpc.org']]);
    expect(JSON.stringify(out)).not.toContain('key-abc123');
    expect(out.summary).toContain('P1-P8 hold on all 67,108,864 combinations');
  });

  it('an unreadable policy is a failed verification, not an error', async () => {
    const out = await verify(
      stub(async () => Promise.reject(new AtropyleError('POLICY_UNAVAILABLE'))),
      {},
    );
    expect(out).toMatchObject({
      ok: false,
      policyStatus: 'unavailable',
      policy: null,
      policyError: { code: 'POLICY_UNAVAILABLE' },
    });
  });

  it('a failed property makes the result fail and names the property', async () => {
    const bad = {
      ...POLICY,
      ok: false,
      properties: { ...props, P3: { ok: false, violations: 4 } },
    } as PolicyVerification;
    const out = await verify(
      stub(async () => bad),
      {},
    );
    expect(out.ok).toBe(false);
    expect(out.summary).toContain('P3 do not hold');
  });

  it('a proof that never ran does not blame P1-P8', async () => {
    // The SDK leaves every property at { ok: false, violations: 0 } when the netlist or an RPC failed before the proof.
    const never = Object.fromEntries(Object.keys(props).map((p) => [p, { ok: false, violations: 0 }]));
    const broken = {
      ...POLICY,
      ok: false,
      combos: 0,
      properties: never,
      issues: ['the policy could not be checked: RPC failed'],
    } as unknown as PolicyVerification;
    const out = await verify(
      stub(async () => broken),
      {},
    );
    expect(out.ok).toBe(false);
    expect(out.summary).not.toMatch(/P\d/);
    expect(out.summary).not.toContain('do not hold');
    expect(out.summary).toContain('1 issue found');
  });

  it('network errors are thrown with their own code', async () => {
    await expect(
      verify(
        stub(async () => Promise.reject(new AtropyleError('QUORUM_UNAVAILABLE'))),
        {},
      ),
    ).rejects.toMatchObject({
      code: 'QUORUM_UNAVAILABLE',
    });
  });

  it('refuses to verify nothing', async () => {
    await expect(
      verify(
        stub(async () => POLICY),
        { policy: false },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });
});

describe('throttleProgress', () => {
  it('passes about one call per percent and always the last one', () => {
    const cb = vi.fn();
    const p = throttleProgress(cb);
    for (let i = 1; i <= 1000; i++) p(i, 1000);
    expect(cb.mock.calls.length).toBeLessThanOrEqual(101);
    expect(cb).toHaveBeenLastCalledWith(1000, 1000);
  });
});

describe('integrityOutput', () => {
  it('without a report, points to the local verify command', () => {
    const out = integrityOutput(null);
    expect(out).toMatchObject({ checkedAt: null, report: null, verifyCommand: 'npx -y atropyle verify' });
    expect(out.summary).toContain('npx -y atropyle verify');
  });

  it('with a report, says when and where it was checked', () => {
    const report = {
      ok: true,
      chainId: 196,
      blockNumber: 9n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [{ name: 'vaultImplCodehash', ok: true }],
      warnings: [],
    } as IntegrityReport;
    const out = integrityOutput({ report, checkedAt: '2026-12-01T00:00:00Z' });
    expect(out.report?.blockNumber).toBe('9');
    expect(out.summary).toContain('2026-12-01T00:00:00Z');
  });
});
