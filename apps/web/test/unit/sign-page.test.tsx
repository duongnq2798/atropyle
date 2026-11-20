// @vitest-environment happy-dom
import { GUARDIAN_WARNING, type InspectedStep, type SignRequestCheck } from '@atropyle/sdk';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import type { Address } from 'viem';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sdk } from '../../src/lib/sdk';
import { SignPage } from '../../src/pages/sign';
import { AppContext } from '../../src/ui/app-context';

afterEach(cleanup);

const A: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function step(over: Partial<InspectedStep> = {}): InspectedStep {
  return {
    index: 0,
    to: V,
    value: 0n,
    action: 'checkIn',
    summary: 'Check in.',
    warnings: [],
    allowed: true,
    reason: null,
    builderCodes: null,
    simulation: { ok: true, gas: 50_000n },
    ...over,
  };
}

function page(steps: InspectedStep[], over: Partial<SignRequestCheck> = {}) {
  const check: SignRequestCheck = {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false),
    chainId: 196,
    from: A,
    vault: V,
    steps,
    ...over,
  };
  const sdk = {
    atro: {
      chain: { id: 196 },
      handoff: {
        parse: () => ({ chainId: 196, from: A, steps: [] }),
        inspect: async () => check,
      },
    },
    deployment: { explorerUrl: null },
  } as unknown as Sdk;
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk,
    wallet: { account: A, chainId: 196, option: { provider: {} } },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return (
    <AppContext.Provider value={value}>
      <SignPage sdk={sdk} />
    </AppContext.Provider>
  );
}

describe('SignPage', () => {
  it('shows the unlimited approval warning that inspect rebuilt', async () => {
    const w = { code: 'UNLIMITED_APPROVAL', message: 'This approval has no limit.' } as const;
    render(page([step({ action: 'approve', warnings: [w] })]));
    await waitFor(() => expect(screen.getByTestId('warning-UNLIMITED_APPROVAL')).toBeTruthy());
    expect(screen.getByTestId('warning-UNLIMITED_APPROVAL').textContent).toContain('no limit');
    expect(screen.getByTestId('sign-send')).toBeTruthy();
  });

  it('shows the guardian warning once, in its own banner', async () => {
    render(page([step({ action: 'voteRecovery', warnings: [GUARDIAN_WARNING] })]));
    await waitFor(() => expect(screen.getByTestId('sign-guardian')).toBeTruthy());
    expect(screen.queryByTestId(`warning-${GUARDIAN_WARNING.code}`)).toBeNull();
  });

  it('offers no sign button for a refused step', async () => {
    const bad = step({
      action: null,
      summary: null,
      allowed: false,
      reason: 'unknown call',
      simulation: { ok: 'skipped', reason: 'NOT_ALLOWED' },
    });
    render(page([bad]));
    await waitFor(() => expect(screen.getByTestId('sign-refused')).toBeTruthy());
    expect(screen.queryByTestId('sign-send')).toBeNull();
  });
});
