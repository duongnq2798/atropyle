import { AtropyleError, type PolicyVerification } from '@atropyle/sdk';
import type { IntegrityCheck, VaultVerification } from '@atropyle/sdk/verify';
import { describe, expect, it } from 'vitest';
import { PROPERTY_ORDER, proofSummary, vaultVerifyRows } from '../../src/verify/verify-view';

const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ok = (name: string): IntegrityCheck => ({ name, ok: true });
const ALL_OK = [
  'factory.isVault',
  'vault.proxy',
  'vault.factory',
  'vault.cpu',
  'vault.policyId',
  'vaultImpl.codehash',
].map(ok);

const props = Object.fromEntries(PROPERTY_ORDER.map((p) => [p, { ok: true, violations: 0 }]));
const proof = {
  ok: true,
  properties: props,
  combos: 67_108_864,
  ms: 12_345,
  netlists: [],
  cpu: '0x3333333333333333333333333333333333333333',
  policyId: 1n,
  beaconFrozen: true,
  cpuCheck: null,
  chainId: 196,
  blockNumber: 5n,
  rpcs: 2,
  issues: [],
  firstFailures: [],
  warnings: [],
} as unknown as PolicyVerification;

function verification(over: Partial<VaultVerification>): VaultVerification {
  return {
    ok: true,
    vault: V,
    chainId: 196,
    blockNumber: 5n,
    rpcs: 2,
    checks: ALL_OK,
    policy: { status: 'verified', result: proof, unchanged: true },
    warnings: [],
    ...over,
  } as VaultVerification;
}

const states = (v: VaultVerification) => Object.fromEntries(vaultVerifyRows(v).map((r) => [r.id, r.state]));

describe('vaultVerifyRows', () => {
  it('passes every row with two operators and a verified policy', () => {
    expect(states(verification({}))).toEqual({
      factory: 'pass',
      proxy: 'pass',
      binding: 'pass',
      code: 'pass',
      policy: 'pass',
      operators: 'pass',
    });
  });

  it('fails the code row with the expected and actual values', () => {
    const checks = ALL_OK.map((c) =>
      c.name === 'vaultImpl.codehash' ? { name: c.name, ok: false, expected: '0xaa', actual: '0xbb' } : c,
    );
    const row = vaultVerifyRows(verification({ checks })).find((r) => r.id === 'code');
    expect(row).toEqual({ id: 'code', state: 'fail', detail: '0xaa → 0xbb' });
  });

  it('marks an unavailable policy and a single operator as unknown', () => {
    const error = new AtropyleError('POLICY_UNAVAILABLE').toJSON();
    const s = states(verification({ rpcs: 1, policy: { status: 'unavailable', error } }));
    expect(s.policy).toBe('unknown');
    expect(s.operators).toBe('unknown');
  });

  it('fails a policy that changed and marks missing checks as unknown', () => {
    const s = states(
      verification({ checks: ALL_OK.slice(1), policy: { status: 'verified', result: proof, unchanged: false } }),
    );
    expect(s.factory).toBe('unknown');
    expect(s.policy).toBe('fail');
    expect(states(verification({ policy: { status: 'skipped' } })).policy).toBe('unknown');
  });
});

describe('proofSummary', () => {
  it('lists P1 to P8 in order with the time in seconds', () => {
    const s = proofSummary(proof);
    expect(s.properties.map((p) => p.name)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    expect(s).toMatchObject({ ok: true, combos: 67_108_864, seconds: 12.3, rpcs: 2, blockNumber: 5n });
  });
});

describe('vaultVerifyRows detail', () => {
  it('keeps the head and the tail of a 20 KB value', () => {
    const actual = `0x${'ab'.repeat(10_000)}`;
    const checks = ALL_OK.map((c) =>
      c.name === 'vault.proxy' ? { name: c.name, ok: false, expected: '0xaa', actual } : c,
    );
    const row = vaultVerifyRows(verification({ checks })).find((r) => r.id === 'proxy');
    expect(row?.detail?.length).toBeLessThan(100);
    expect(row?.detail).toContain('\u2026');
    expect(row?.detail?.startsWith('0xaa \u2192 0xabab')).toBe(true);
  });
});
