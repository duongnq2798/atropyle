// @vitest-environment happy-dom
import type { PolicyVerification } from '@atropyle/sdk';
import type { VaultVerification } from '@atropyle/sdk/verify';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import type { ComponentChild, ContextType } from 'preact';
import type { Address } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sdk } from '../../src/lib/sdk';
import { ProofResult } from '../../src/pages/proof';
import { VerifyPage } from '../../src/pages/verify';
import { AppContext } from '../../src/ui/app-context';
import { fixtureDeployment } from './fixtures';

const mocks = vi.hoisted(() => ({ runVaultVerify: vi.fn() }));
vi.mock('../../src/lib/verify-client', () => ({ runVaultVerify: mocks.runVaultVerify, runProof: vi.fn() }));

afterEach(cleanup);

const V: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const sdk = { deployment: fixtureDeployment() } as unknown as Sdk;
const ok = (name: string) => ({ name, ok: true });
const ALL_OK = [
  'factory.isVault',
  'vault.proxy',
  'vault.factory',
  'vault.cpu',
  'vault.policyId',
  'vaultImpl.codehash',
].map(ok);

const proof = (over: Partial<PolicyVerification> = {}) =>
  ({
    ok: true,
    properties: Object.fromEntries(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
    ),
    combos: 1,
    ms: 1,
    netlists: [],
    cpu: '0x3333333333333333333333333333333333333333',
    blockNumber: 5n,
    rpcs: 2,
    issues: [],
    warnings: [],
    ...over,
  }) as unknown as PolicyVerification;

function verification(over: Partial<VaultVerification>): VaultVerification {
  return {
    ok: true,
    vault: V,
    chainId: 196,
    blockNumber: 5n,
    rpcs: 2,
    checks: ALL_OK,
    policy: { status: 'skipped' },
    warnings: [],
    ...over,
  } as VaultVerification;
}

function wrap(node: ComponentChild, target: 'pages' | 'deweb' = 'pages') {
  const value = { lang: 'en', env: { docsPath: null, target } } as unknown as NonNullable<
    ContextType<typeof AppContext>
  >;
  return <AppContext.Provider value={value}>{node}</AppContext.Provider>;
}

describe('VerifyPage', () => {
  it('shows a neutral state, not a failure, while the policy proof runs', async () => {
    mocks.runVaultVerify.mockReset();
    let finish: (v: VaultVerification) => void = () => {};
    mocks.runVaultVerify.mockImplementation((_s, _v, o: { policy: boolean }) =>
      o.policy ? new Promise((r) => (finish = r)) : Promise.resolve(verification({})),
    );
    render(wrap(<VerifyPage sdk={sdk} vault={V} />));
    await waitFor(() => expect(screen.getByTestId('verify-overall').getAttribute('data-ok')).toBe('pending'));
    expect(screen.getByTestId('verify-overall').textContent).toContain('Checking the policy');
    expect(screen.getByTestId('verify-overall').querySelector('[role="alert"]')).toBeNull();
    await waitFor(() => expect(mocks.runVaultVerify).toHaveBeenCalledTimes(2));
    finish(verification({ policy: { status: 'verified', result: proof(), unchanged: true } }));
    await waitFor(() => expect(screen.getByTestId('verify-overall').getAttribute('data-ok')).toBe('true'));
  });

  it('reports a failing quick check at once, without waiting for the policy proof', async () => {
    mocks.runVaultVerify.mockReset();
    const checks = ALL_OK.map((c) => (c.name === 'factory.isVault' ? { name: c.name, ok: false } : c));
    // The proof never finishes: a failed factory row must not hide behind "Checking the policy".
    mocks.runVaultVerify.mockImplementation((_s, _v, o: { policy: boolean }) =>
      o.policy ? new Promise(() => {}) : Promise.resolve(verification({ ok: false, checks })),
    );
    render(wrap(<VerifyPage sdk={sdk} vault={V} />));
    await waitFor(() => expect(mocks.runVaultVerify).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('verify-row-factory').getAttribute('data-state')).toBe('fail');
    const overall = screen.getByTestId('verify-overall');
    expect(overall.getAttribute('data-ok')).toBe('false');
    expect(overall.textContent).toContain('could not be fully verified');
    expect(overall.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('says the vault could not be verified once the result is known', async () => {
    mocks.runVaultVerify.mockResolvedValue(verification({ rpcs: 1 }));
    render(wrap(<VerifyPage sdk={sdk} vault={V} />));
    await waitFor(() => expect(screen.getByTestId('verify-overall').getAttribute('data-ok')).toBe('false'));
    expect(screen.getByTestId('verify-overall').textContent).toContain('could not be fully verified');
  });

  it('bounds the detail of a failing row built from a 20 KB runtime bytecode', async () => {
    const actual = `0x${'ab'.repeat(10_000)}`;
    const checks = ALL_OK.map((c) =>
      c.name === 'vault.proxy' ? { name: c.name, ok: false, expected: `0x${'cd'.repeat(45)}`, actual } : c,
    );
    mocks.runVaultVerify.mockResolvedValue(verification({ checks }));
    render(wrap(<VerifyPage sdk={sdk} vault={V} />));
    await waitFor(() => expect(screen.getByTestId('verify-row-proxy')).toBeTruthy());
    const row = screen.getByTestId('verify-row-proxy');
    expect(row.getAttribute('data-state')).toBe('fail');
    expect(row.querySelector('.untrusted')).toBeTruthy();
    expect((row.textContent ?? '').length).toBeLessThan(400);
  });
});

describe('ProofResult', () => {
  const single = proof({ rpcs: 1 });

  it('tells a DeWEB visitor to turn on the cross-check', () => {
    render(wrap(<ProofResult sdk={sdk} result={single} />, 'deweb'));
    expect(screen.getByTestId('proof-single-rpc').textContent).toContain('cross-check on the Status page');
  });

  it('says the deployment lists one operator on Pages', () => {
    render(wrap(<ProofResult sdk={sdk} result={single} />, 'pages'));
    const text = screen.getByTestId('proof-single-rpc').textContent ?? '';
    expect(text).toContain('lists only one RPC operator');
    expect(text).not.toContain('Status page');
  });

  it('shows issues as untrusted text', () => {
    render(wrap(<ProofResult sdk={sdk} result={proof({ ok: false, issues: ['cpu 0xabc said \u{202E}evil'] })} />));
    const el = document.querySelector('.banner-error .untrusted');
    expect(el?.textContent).toBe('cpu 0xabc said evil');
  });
});
