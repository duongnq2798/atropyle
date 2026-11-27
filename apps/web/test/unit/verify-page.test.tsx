import { AtropyleError } from '@atropyle/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyPage, VerifyScreen } from '../../src/app/verify/verify-page';
import type { VerifySite } from '../../src/app/verify/verify-report';
import type { PolicyVerification, VaultVerification } from '../../src/verify/types';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({ runProof: vi.fn(), runVaultVerify: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/verify/', useRouter: () => ({ push: vi.fn() }) }));

const V = PEOPLE.vault as Address;
const CPU: Address = '0x3333333333333333333333333333333333333333';
// A trailing slash, as a deployment file may write it: every link still has one slash before its path.
const SITE: VerifySite = { version: '0.1.0', explorer: 'https://www.oklink.com/xlayer/', cpu: CPU, quorumGroups: 2 };
const ALL_OK = [
  'factory.isVault',
  'vault.proxy',
  'vault.factory',
  'vault.cpu',
  'vault.policyId',
  'vaultImpl.codehash',
].map((name) => ({ name, ok: true }));
const P9_OK = {
  ok: true,
  seed: 20_261_125n,
  vectors: 64,
  operators: [1, 2].map((operator) => ({ operator, blockNumber: 5n, multicall: true, calls: 4, matched: 64 })),
  mismatches: [],
  ms: 900,
};

function proof(over: Record<string, unknown> = {}): PolicyVerification {
  return {
    ok: true,
    properties: Object.fromEntries(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
    ),
    combos: 67_108_864,
    ms: 41_300,
    netlists: [],
    cpu: CPU,
    policyId: 1n,
    beaconFrozen: null,
    cpuCheck: null,
    p9: null,
    chainId: 196,
    blockNumber: 5n,
    rpcs: 2,
    issues: [],
    firstFailures: [],
    warnings: [],
    ...over,
  } as unknown as PolicyVerification;
}

function verification(over: Partial<VaultVerification> = {}): VaultVerification {
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

const verified = (result: PolicyVerification) =>
  verification({ ok: result.ok, policy: { status: 'verified', result, unchanged: true } });

/** The cheap read answers at once; the proof waits until the test finishes it. */
function deferProof(quick: VaultVerification = verification()): (v: VaultVerification) => void {
  let finish: (v: VaultVerification) => void = () => undefined;
  impl.runVaultVerify.mockImplementation((_s: unknown, _v: string, o: { policy: boolean }) =>
    o.policy
      ? new Promise<VaultVerification>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(quick),
  );
  return (v) => finish(v);
}

const show = (o: { lang?: 'en' | 'vi'; site?: VerifySite } = {}) =>
  renderWithProviders(<VerifyScreen vault={V} site={o.site ?? SITE} />, { lang: o.lang ?? 'en' });
const link = (id: string) => screen.getByTestId(`verify-line-${id}-link`).querySelector('a');

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('/verify/', () => {
  it('says the rules are being checked, not that they failed, while the proof runs', async () => {
    const finish = deferProof();
    show();
    await waitFor(() => expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'pending'));
    expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-ok', 'pending');
    expect(screen.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'pass');
    expect(screen.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'checking');
    expect(screen.getByTestId('verify-line-operators')).toHaveAttribute('data-state', 'pass');
    expect(screen.getByTestId('verify-overall').querySelector('[role="alert"]')).toBeNull();
    expect(screen.queryByTestId('verify-next')).toBeNull();
    // Nothing is announced before there is an answer.
    expect(screen.getByTestId('verify-live')).toHaveTextContent(/^$/);
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));

    finish(verified(proof()));
    await waitFor(() => expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'pass'));
    expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-ok', 'true');
    expect(screen.getByTestId('verify-live')).toHaveTextContent('This vault is what Atropyle says it is.');
    for (const id of ['real', 'rules', 'operators']) {
      expect(screen.getByTestId(`verify-line-${id}`)).toHaveAttribute('data-state', 'pass');
    }
    // Measured, never typed: the count of rules and of inputs come from the proof itself.
    expect(screen.getByTestId('verify-proof')).toHaveTextContent(
      'All 8 rules hold for every one of the 67,108,864 inputs, checked in 41.3 s at block 5.',
    );
    // Each line points at the page on OKLink that shows the same fact.
    expect(link('real')).toHaveAttribute('href', `https://www.oklink.com/xlayer/address/${V}`);
    expect(link('rules')).toHaveAttribute('href', `https://www.oklink.com/xlayer/address/${CPU}`);
    expect(link('operators')).toHaveAttribute('href', 'https://www.oklink.com/xlayer/block/5');
    expect(screen.getByTestId('verify-next')).toHaveAttribute('href', `/vault/#${V}`);
    expect(screen.queryByTestId('verify-open-vault')).toBeNull();
  });

  it('reports a failed check at once, without waiting for the proof, and offers no way into the vault', async () => {
    const checks = ALL_OK.map((c) => (c.name === 'factory.isVault' ? { name: c.name, ok: false } : c));
    // The proof never finishes: a failed factory row must not hide behind "checking".
    impl.runVaultVerify.mockImplementation((_s: unknown, _v: string, o: { policy: boolean }) =>
      o.policy ? new Promise(() => undefined) : Promise.resolve(verification({ ok: false, checks })),
    );
    show();
    await waitFor(() => expect(screen.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'fail'));
    expect(screen.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'checking');
    const overall = screen.getByTestId('verify-overall');
    expect(overall).toHaveAttribute('data-ok', 'false');
    expect(overall).toHaveAttribute('data-overall', 'fail');
    expect(overall.querySelector('[role="alert"]')).not.toBeNull();
    // A failure speaks through the banner's role="alert"; the polite region stays empty, so it is not read twice.
    expect(screen.getByTestId('verify-live')).toHaveTextContent(/^$/);
    expect(screen.getByTestId('verify-row-factory')).toHaveAttribute('data-state', 'fail');
    expect(screen.queryByTestId('verify-next')).toBeNull();
    expect(screen.queryByTestId('verify-open-vault')).toBeNull();
  });

  it('bounds the detail of a failing row built from a 20 KB runtime bytecode', async () => {
    const actual = `0x${'ab'.repeat(10_000)}`;
    const checks = ALL_OK.map((c) =>
      c.name === 'vault.proxy' ? { name: c.name, ok: false, expected: `0x${'cd'.repeat(45)}`, actual } : c,
    );
    impl.runVaultVerify.mockResolvedValue(verification({ checks }));
    show();
    const row = await screen.findByTestId('verify-row-proxy');
    expect(row).toHaveAttribute('data-state', 'fail');
    expect((row.textContent ?? '').length).toBeLessThan(400);
    // 7A rule 20: the self-hosted fonts have no U+2192. Expected and actual are joined by an icon and a hidden word.
    expect(row.textContent).not.toContain('→');
    expect(row.querySelector('svg')).not.toBeNull();
    expect(row).toHaveTextContent(' to ');
  });

  it('measures every number it shows: other inputs, another time, one operator', async () => {
    const finish = deferProof();
    show();
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));
    finish(verified(proof({ combos: 1024, ms: 2_000, p9: { ...P9_OK, vectors: 7, operators: [P9_OK.operators[0]] } })));
    await waitFor(() =>
      expect(screen.getByTestId('verify-proof')).toHaveTextContent('every one of the 1,024 inputs, checked in 2.0 s'),
    );
    expect(screen.getByTestId('verify-proof-p9')).toHaveTextContent('7 random inputs, on one RPC operator.');
  });

  it('copies the plain command, seed included, with nothing of its markup', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const finish = deferProof();
    show();
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));
    finish(verified(proof({ p9: P9_OK })));
    await waitFor(() => expect(screen.getByTestId('verify-cli')).toHaveTextContent('--p9-seed 20261125'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the command' }));
    });
    expect(writeText).toHaveBeenCalledWith(`npx -y atropyle@0.1.0 verify --vault ${V} --p9-seed 20261125`);
  });

  it('pins the command to this release, then to the P9 seed the page drew', async () => {
    const finish = deferProof();
    show();
    await waitFor(() =>
      expect(screen.getByTestId('verify-cli')).toHaveTextContent(`npx -y atropyle@0.1.0 verify --vault ${V}`),
    );
    expect(screen.getByTestId('verify-cli').textContent).not.toContain('--p9-seed');
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));

    finish(verified(proof({ p9: P9_OK, cpuCheck: { ok: true, code: { matches: true } } })));
    await waitFor(() =>
      expect(screen.getByTestId('verify-cli')).toHaveTextContent(
        `npx -y atropyle@0.1.0 verify --vault ${V} --p9-seed 20261125`,
      ),
    );
    expect(screen.getByTestId('verify-proof-P9')).toHaveAttribute('data-ok', 'true');
    expect(screen.getByTestId('verify-proof-p9')).toHaveTextContent('64 random inputs, on each of 2 RPC operators');
    expect(screen.getByTestId('verify-proof-code')).toHaveAttribute('data-ok', 'true');
    // The help names the flag as code, so it never breaks at a hyphen.
    expect(screen.getByText('--p9-seed', { selector: 'code' })).toHaveClass('whitespace-nowrap');
  });

  it('turns the rules line red when the processor answers otherwise than this device (P9)', async () => {
    const finish = deferProof();
    show();
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));
    const p9 = { ...P9_OK, ok: false, operators: [{ ...P9_OK.operators[0], matched: 63 }, P9_OK.operators[1]] };
    finish(
      verified(
        proof({
          ok: false,
          p9,
          issues: ['P9: 1 of 64 vectors differ between the simulator and step() on RPC operator #1'],
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'fail'));
    expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'fail');
    expect(screen.getByTestId('verify-proof-P9')).toHaveAttribute('data-ok', 'false');
    expect(screen.getByTestId('verify-proof-issues')).toHaveTextContent('RPC operator #1');
    expect(screen.queryByTestId('verify-next')).toBeNull();
  });

  it('speaks Vietnamese, numbers included', async () => {
    const finish = deferProof();
    show({ lang: 'vi' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vault này có thật không?'),
    );
    await waitFor(() => expect(impl.runVaultVerify).toHaveBeenCalledTimes(2));
    finish(verified(proof()));
    await waitFor(() => expect(screen.getByTestId('verify-proof')).toHaveTextContent('67.108.864'));
    expect(screen.getByTestId('verify-proof')).toHaveTextContent('41,3 giây');
    expect(screen.getByTestId('verify-next')).toHaveTextContent('Tiếp theo: xem vault này để lại gì cho bạn');
  });

  it('says why the providers line is not checked, and where to turn on the cross-check', async () => {
    impl.runVaultVerify.mockResolvedValue(verification({ rpcs: 1 }));
    const first = show();
    const hint = await screen.findByTestId('verify-line-operators-hint');
    expect(hint).toHaveTextContent('Turn on the cross-check on the Status page');
    expect(hint.querySelector('a')).toHaveAttribute('href', '/status/');
    // The hint shows from the cheap read; the answer is partial once the second run (no policy here) is in too.
    await waitFor(() => expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'partial'));
    expect(screen.getByTestId('verify-open-vault')).toHaveAttribute('href', `/vault/#${V}`);
    first.unmount();

    show({ site: { ...SITE, quorumGroups: 1 } });
    expect(await screen.findByTestId('verify-line-operators-hint')).toHaveTextContent(
      'This deployment lists only one RPC operator, so nothing was cross-checked.',
    );
  });

  it('says on the rules line why it is not checked, without an alarm', async () => {
    const error = new AtropyleError('POLICY_UNAVAILABLE').toJSON();
    impl.runVaultVerify.mockResolvedValue(verification({ policy: { status: 'unavailable', error } }));
    show();
    await waitFor(() => expect(screen.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'partial'));
    const rules = screen.getByTestId('verify-line-rules');
    expect(rules).toHaveAttribute('data-state', 'unknown');
    await waitFor(() => expect(within(rules).getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE'));
    expect(within(rules).getByTestId('error')).toHaveTextContent(error.message);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks for the address in the words of the letter', async () => {
    renderWithProviders(<VerifyPage site={SITE} />, { lang: 'en' });
    expect(await screen.findByTestId('verify-missing')).toHaveTextContent(
      'Paste the vault address from your letter or invitation.',
    );
    // What the check will say, before there is anything to check: the three lines, in order.
    const what = [...screen.getByTestId('verify-what').querySelectorAll('li')];
    expect(what).toHaveLength(3);
    expect(what[0]).toHaveTextContent('This is a real Atropyle vault');
    expect(what[1]).toHaveTextContent('Its rules are the circuit that was proven');
    expect(what[2]).toHaveTextContent('Two independent providers agree');
  });

  it('keeps a hash that is not an address in the field, marked wrong', async () => {
    window.history.replaceState(null, '', '/verify/#nope');
    renderWithProviders(<VerifyPage site={SITE} />, { lang: 'en' });
    const input = await screen.findByTestId('verify-open-input');
    expect(input).toHaveValue('nope');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('checks the vault named in the hash', async () => {
    impl.runVaultVerify.mockResolvedValue(verification());
    window.history.replaceState(null, '', `/verify/#${V}`);
    renderWithProviders(<VerifyPage site={SITE} />, { lang: 'en' });
    await waitFor(() => expect(screen.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'pass'));
  });
});
