// @vitest-environment happy-dom
import { AtropyleError, deploymentToJson, type PreparedTx, type TxPlan, untrusted } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEnv } from '../../src/env';
import { initialForm } from '../../src/lib/create-form';
import { CreatePage, Review } from '../../src/pages/create';
import { AppContext } from '../../src/ui/app-context';
import { fixtureDeployment } from './fixtures';

afterEach(cleanup);

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const HEIR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const G = [
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
] as const;
const VAULT = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const T1 = '0x5555555555555555555555555555555555555555' as `0x${string}`;
const T2 = '0x6666666666666666666666666666666666666666' as `0x${string}`;
const H = `0x${'12'.repeat(32)}` as const;

const d = fixtureDeployment({ name: 'local', chainId: 31337, explorerUrl: null });
const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });

function step(summary: string): PreparedTx {
  return {
    chainId: 31337,
    from: OWNER,
    to: VAULT,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const plan: TxPlan = {
  chainId: 31337,
  from: OWNER,
  vault: VAULT,
  steps: [step('one'), step('two')],
  summary: 'Plan',
  warnings: [],
};

const fee = (token: typeof T1, symbol: string) => ({
  token,
  symbol: untrusted(symbol, 16),
  decimals: 6,
  fee: 5_000_000n,
  early: 1_000_000n,
  full: 5_000_000n,
});

type Send = (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<unknown>;

function stubs(send: Send = async () => ({ vault: VAULT, steps: [] })) {
  const checkPlan = vi.fn(async () => ({
    ok: true,
    issues: [],
    warnings: [],
    config: null,
    tokens: [],
    fees: { tokens: [fee(T1, '<b>x</b>'), fee(T2, 'USDC')] },
    contractHeirs: [],
  }));
  const createVault = vi.fn(async (..._args: unknown[]) => plan);
  const sdk = {
    atro: {
      chain: { id: 31337 },
      checkPlan,
      prepare: { createVault },
      send,
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: d,
  };
  const value = {
    lang: 'en',
    env,
    sdk,
    wallet: { account: OWNER, chainId: 31337 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return { sdk, value, checkPlan, createVault };
}

const id = (s: string) => screen.getByTestId(s) as HTMLInputElement;
const click = (s: string) => fireEvent.click(screen.getByTestId(s));
const inFieldset = (s: string) => !!screen.getByTestId(s).closest('fieldset[disabled]');

const realForm = { ...initialForm(false), heirs: [{ account: HEIR, percent: '' }], guardians: [...G] };

describe('Review with two fee tokens', () => {
  it('lists the fee tokens from checkPlan, renders markup as text and prepares with the picked token', async () => {
    const { sdk, value, createVault } = stubs();
    render(
      <AppContext.Provider value={value}>
        <Review
          sdk={sdk as never}
          form={realForm}
          owner={OWNER}
          plan={null}
          onPlan={() => {}}
          onProgress={() => {}}
          onIssues={() => {}}
          onCreated={() => {}}
        />
      </AppContext.Provider>,
    );
    click('create-check');
    await screen.findByTestId('create-checked');
    expect(id(`create-fee-${T1}`).checked).toBe(true);
    expect(screen.getByTestId(`create-fee-${T2}`)).toBeTruthy();
    const checked = screen.getByTestId('create-checked');
    expect(checked.textContent).toContain('<b>x</b>');
    expect(checked.querySelector('b')).toBeNull();
    fireEvent.click(screen.getByTestId(`create-fee-${T2}`));
    click('create-prepare');
    await waitFor(() => expect(createVault).toHaveBeenCalled());
    expect(createVault.mock.calls[0][1]).toMatchObject({ owner: OWNER, feeToken: T2 });
  });

  it('disables the fee radios once a plan exists', async () => {
    const { sdk, value } = stubs();
    const props = {
      sdk: sdk as never,
      form: realForm,
      owner: OWNER,
      onProgress: () => {},
      onIssues: () => {},
      onCreated: () => {},
    };
    const { rerender } = render(
      <AppContext.Provider value={value}>
        <Review {...props} plan={null} onPlan={() => {}} />
      </AppContext.Provider>,
    );
    click('create-check');
    await screen.findByTestId('create-checked');
    expect(id(`create-fee-${T2}`).disabled).toBe(false);
    rerender(
      <AppContext.Provider value={value}>
        <Review {...props} plan={plan} onPlan={() => {}} />
      </AppContext.Provider>,
    );
    expect(id(`create-fee-${T1}`).disabled).toBe(true);
    expect(id(`create-fee-${T2}`).disabled).toBe(true);
  });
});

async function toAssets(send?: Send) {
  const { value } = stubs(send);
  render(
    <AppContext.Provider value={value}>
      <CreatePage sdk={value.sdk as never} drill={true} />
    </AppContext.Provider>,
  );
  click('create-next');
  fireEvent.input(id('create-heir-0-account'), { target: { value: HEIR } });
  click('create-next');
  click('create-next');
  click('create-add-token');
  click('create-check');
  await screen.findByTestId('create-checked');
  click('create-prepare');
  await screen.findByTestId('create-tx');
}

describe('the wizard around a prepared plan', () => {
  it('hides Back and locks the editors while a plan exists; Change the plan brings them back', async () => {
    await toAssets();
    expect(screen.queryByTestId('create-back')).toBeNull();
    expect(inFieldset('create-add-token')).toBe(true);
    expect(inFieldset('create-asset-0-token')).toBe(true);
    click('create-change-plan');
    expect(screen.queryByTestId('create-tx')).toBeNull();
    expect(screen.getByTestId('create-back')).toBeTruthy();
    expect(inFieldset('create-add-token')).toBe(false);
    expect(screen.queryByTestId('create-change-plan')).toBeNull();
  });

  it('after a partial send the plan can no longer be discarded', async () => {
    const send: Send = async (p, _w, o) => {
      o.onStep?.({ index: 0, total: p.steps.length, step: p.steps[0], phase: 'confirmed', hash: H });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    await toAssets(send);
    click('create-tx-send');
    await waitFor(() => expect(screen.getByTestId('create-tx-step-1').getAttribute('data-phase')).toBe('failed'));
    expect(screen.queryByTestId('create-change-plan')).toBeNull();
    expect(screen.queryByTestId('create-back')).toBeNull();
    expect(screen.getByTestId('create-plan-locked').textContent).toBe(
      'Some steps are already confirmed. Finish the remaining steps here.',
    );
    expect(screen.getByTestId('create-tx-send').textContent).toBe('Resume from step 2');
  });
});
