import { AtropyleError, type PreparedTx, type TxPlan } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { explorerTx } from '../../src/lib/links';
import { TxCard } from '../../src/tx/tx-card';
import { applyStep, txView } from '../../src/tx/tx-view';
import type { TxRunner } from '../../src/tx/use-tx-runner';
import { renderWithProviders } from '../helpers/render';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const H = `0x${'12'.repeat(32)}` as const;
const EXPLORER = 'https://www.oklink.com/xlayer';

function step(summary: string): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const PLAN: TxPlan = {
  chainId: 196,
  from: A,
  vault: V,
  steps: [step('one'), step('two'), step('three')],
  summary: 'Plan',
  warnings: [],
};

function runnerOf(plan: TxPlan, over: Partial<TxRunner> = {}): TxRunner {
  return {
    plan,
    view: txView(plan),
    busy: false,
    error: null,
    result: null,
    offset: 0,
    confirmed: 0,
    committed: false,
    blocker: null,
    switchFirst: false,
    handoffLink: null,
    explorer: null,
    send: () => undefined,
    connect: () => undefined,
    reload: () => undefined,
    ...over,
  };
}

const sendButton = () => screen.getByTestId('tx-send') as HTMLButtonElement;

describe('TxCard', () => {
  it('asks for a wallet first, and opens the wallet sheet', () => {
    const connect = vi.fn();
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { blocker: 'connect', connect })} label="Send" />);
    expect(screen.queryByTestId('tx-send')).toBeNull();
    expect(screen.getByText('Connect a wallet to sign.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tx-connect'));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('names the account that must sign when another one is connected', () => {
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { blocker: 'wrongAccount' })} label="Send" />);
    const banner = screen.getByTestId('tx-wrong-account');
    expect(banner.querySelector(`[data-address="${A}"]`)).not.toBeNull();
    expect(screen.queryByTestId('tx-send')).toBeNull();
  });

  it('a step that would fail blocks the plan and says why', async () => {
    const blocked: TxPlan = {
      ...PLAN,
      steps: [
        step('one'),
        { ...step('two'), simulation: { ok: false, error: new AtropyleError('NOT_OWNER').toJSON() } },
      ],
    };
    renderWithProviders(<TxCard runner={runnerOf(blocked, { blocker: 'blocked' })} label="Send" />);
    expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('blocked');
    expect(sendButton().disabled).toBe(true);
    await waitFor(() => expect(screen.getByTestId('error').getAttribute('data-code')).toBe('NOT_OWNER'));
  });

  it('hold to confirm: Enter sends at once, a plain mouse click does not', () => {
    const send = vi.fn();
    const single: TxPlan = { ...PLAN, steps: [step('check in')] };
    renderWithProviders(<TxCard runner={runnerOf(single, { send })} label="Check in" confirm="hold" />);
    fireEvent.click(sendButton(), { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(sendButton(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    // One step needs no progress bar.
    expect(screen.queryByTestId('tx-progress')).toBeNull();
  });

  it('shows each step in plain words, its status, its transaction and its technical details', () => {
    const view = applyStep(applyStep(txView(PLAN), { index: 0, phase: 'confirmed', hash: H }), {
      index: 1,
      phase: 'signing',
    });
    renderWithProviders(
      <TxCard
        runner={runnerOf(PLAN, { view, busy: true, confirmed: 1, committed: true, explorer: EXPLORER })}
        label="Send"
      />,
    );
    const first = within(screen.getByTestId('tx-step-0'));
    expect(first.getByText('one')).toBeTruthy();
    expect(first.getByText('Confirmed')).toBeTruthy();
    expect(first.getByRole('link', { name: /View transaction/ }).getAttribute('href')).toBe(explorerTx(EXPLORER, H));
    expect(within(screen.getByTestId('tx-step-1')).getByText('Confirm in your wallet')).toBeTruthy();
    expect(screen.getAllByText('Technical details')).toHaveLength(3);
    expect(screen.getByTestId('tx-progress').getAttribute('value')).toBe('1');
    expect(screen.getByText('Step 2 of 3: Confirm in your wallet')).toBeTruthy();
    // Busy but still focusable (aria-disabled), so a keyboard user who pressed Send keeps their place.
    expect(sendButton().getAttribute('aria-disabled')).toBe('true');
    expect(sendButton().disabled).toBe(false);
    expect(sendButton()).toHaveAccessibleName('Loading… Sending…');
  });

  it('shows the hand-off link to copy by hand when the browser refuses to copy it', async () => {
    const link = 'https://atropyle.test/sign/#p=abc';
    const writeText = vi.fn(async (_t: string) => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { handoffLink: link })} label="Send" />);
    expect(screen.queryByTestId('tx-link')).toBeNull();
    const button = screen.getByTestId('tx-copy-link').querySelector('button');
    if (!button) throw new Error('no copy button');
    fireEvent.click(button);
    const field = (await screen.findByTestId('tx-link')) as HTMLInputElement;
    expect(writeText).toHaveBeenCalledWith(link);
    expect(field.value).toBe(link);
    expect(field.readOnly).toBe(true);
    expect(field).toHaveAccessibleName('Copy this link yourself: your browser did not let this page copy it.');
  });

  it('shows warnings from the chain as text only', () => {
    const warned: TxPlan = {
      ...PLAN,
      warnings: [{ code: 'TOKEN_NOT_HELD', message: '<img src=x onerror=alert(1)> Claim at evil.example‮' }],
    };
    renderWithProviders(<TxCard runner={runnerOf(warned)} label="Send" />);
    const banner = screen.getByTestId('warning-TOKEN_NOT_HELD');
    expect(banner.querySelector('[data-untrusted]')?.textContent).toBe(
      '<img src=x onerror=alert(1)> Claim at evil.example',
    );
    expect(banner.querySelector('img')).toBeNull();
    expect(within(banner).queryByRole('link')).toBeNull();
  });
});
