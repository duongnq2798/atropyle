import { AtropyleError, type PreparedTx, type TxPlan, vaultAbi } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { explorerTx } from '../../src/lib/links';
import { mirrorPlan } from '../../src/tx/impl/mirror';
import type { MirrorContext } from '../../src/tx/mirror';
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
    mode: null,
    mirror: null,
    unsettled: null,
    bundle: null,
    rechecking: false,
    loadFailed: false,
    receipt: null,
    receiptReading: false,
    stale: false,
    send: () => undefined,
    connect: () => undefined,
    reload: () => undefined,
    recheck: () => undefined,
    adopt: () => undefined,
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
    await waitFor(() => expect(screen.getByTestId('tx-blocked-error').getAttribute('data-code')).toBe('NOT_OWNER'));
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

  it('passes the hold words to the HoldButton: no "Confirmed" and no knot before the receipt', () => {
    const send = vi.fn();
    const single: TxPlan = { ...PLAN, steps: [step('distribute')] };
    renderWithProviders(
      <TxCard
        runner={runnerOf(single, { send })}
        label="Receive"
        confirm="hold"
        hold={{ hint: 'Hold to receive, or press Enter', doneLabel: 'Now confirm in your wallet', showKnot: false }}
      />,
    );
    expect(screen.getByText('Hold to receive, or press Enter')).toBeTruthy();
    expect(sendButton().querySelector('[data-part="knot"]')).toBeNull();
    fireEvent.keyDown(sendButton(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Confirmed')).toBeNull();
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

  it('a disabled card does not send, on a click or on a hold', () => {
    const send = vi.fn();
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { send })} label="Send" disabled />);
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    expect(send).not.toHaveBeenCalled();
  });

  it('tone danger sends through a danger button', () => {
    renderWithProviders(<TxCard runner={runnerOf(PLAN)} label="Hand over" tone="danger" />);
    expect(sendButton().className).toContain('bg-danger');
  });

  it('shows the raw hash when there is no explorer', () => {
    const view = applyStep(txView(PLAN), { index: 0, phase: 'pending', hash: H });
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { view, busy: true })} label="Send" />);
    expect(within(screen.getByTestId('tx-step-0')).getByText(H)).toBeTruthy();
    expect(within(screen.getByTestId('tx-step-0')).queryByRole('link')).toBeNull();
  });

  it('titles each step in plain words, with the SDK summary under it in English, also on a Vietnamese page', () => {
    renderWithProviders(<TxCard runner={runnerOf(PLAN)} label="Gửi" />, { lang: 'vi' });
    const first = within(screen.getByTestId('tx-step-0'));
    expect(first.getByText('Điểm danh')).toBeTruthy();
    expect(first.getByText('one').getAttribute('lang')).toBe('en');
  });

  it('labels what cannot be undone: a vault, a payout, a vote for a wallet, not a vote taken back', () => {
    const vote = (target: `0x${string}`) =>
      encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target] });
    const p: TxPlan = {
      ...PLAN,
      steps: [
        { ...step('a'), action: 'createVault' },
        { ...step('b'), action: 'distribute' },
        { ...step('c'), action: 'voteRecovery', data: vote(A) },
        { ...step('d'), action: 'voteRecovery', data: vote('0x0000000000000000000000000000000000000000') },
      ],
    };
    const { unmount } = renderWithProviders(<TxCard runner={runnerOf(p)} label="Send" />);
    expect(screen.getByTestId('tx-irreversible-0').textContent).toBe('Cannot be undone');
    expect(screen.getByTestId('tx-irreversible-1')).toBeTruthy();
    expect(screen.getByTestId('tx-irreversible-2')).toBeTruthy();
    expect(screen.queryByTestId('tx-irreversible-3')).toBeNull();
    expect(within(screen.getByTestId('tx-step-3')).getByText('Take back your vote')).toBeTruthy();
    unmount();
    // The label warns before the step is sent; on a confirmed step a red label would read as an error.
    const view = applyStep(txView(p), { index: 0, phase: 'confirmed', hash: H });
    renderWithProviders(<TxCard runner={runnerOf(p, { view, confirmed: 1, committed: true })} label="Send" />);
    expect(screen.queryByTestId('tx-irreversible-0')).toBeNull();
    expect(screen.getByTestId('tx-irreversible-1')).toBeTruthy();
  });

  it('mirrors the next step from its calldata, even when the summary says otherwise; a bundle mirrors every call', () => {
    const USDG = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
    const lying: TxPlan = {
      ...PLAN,
      steps: [
        {
          ...step('Check in on your vault.'),
          to: USDG,
          action: 'approve',
          data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [V, maxUint256] }),
        },
        step('two'),
      ],
    };
    const ctx: MirrorContext = { factory: '0x1111111111111111111111111111111111111111', feeTokens: [USDG], tokens: [] };
    const mirror = mirrorPlan(lying, ctx);
    const { unmount } = renderWithProviders(
      <TxCard runner={runnerOf(lying, { mirror, mode: 'steps' })} label="Send" />,
    );
    const box = screen.getByTestId('tx-mirror-0');
    expect(within(box).getByText('approve')).toBeTruthy();
    expect(within(box).getByText('Unlimited')).toBeTruthy();
    expect(within(screen.getByTestId('tx-step-0')).getByText('Let the vault move this token')).toBeTruthy();
    expect(screen.queryByTestId('tx-mirror-1')).toBeNull();
    unmount();
    renderWithProviders(<TxCard runner={runnerOf(lying, { mirror, mode: 'bundle' })} label="Send" />);
    const bundle = screen.getByTestId('tx-mirror-bundle');
    expect(within(bundle).getByTestId('tx-mirror-0')).toBeTruthy();
    expect(within(bundle).getByTestId('tx-mirror-1')).toBeTruthy();
  });

  it('writes the addresses of an SDK summary in groups of four, in the Ledger voice, and breaks only between them', () => {
    const p: TxPlan = { ...PLAN, steps: [step(`Check in as the owner of vault ${V}: this resets the timer.`)] };
    renderWithProviders(<TxCard runner={runnerOf(p)} label="Send" />);
    const summary = screen.getByTestId('tx-step-0').querySelector('p[lang="en"]');
    if (!summary) throw new Error('no summary');
    expect(summary.className).not.toContain('wrap-anywhere');
    const address = summary.querySelector(`[data-address="${V}"]`);
    expect(address?.classList.contains('voice-ledger')).toBe(true);
    const drawn = address?.querySelector('[aria-hidden="true"]');
    expect(drawn?.textContent).toBe(V);
    // Nine break points, one before each group from the second on; never inside a group, never after "0x".
    expect(drawn?.querySelectorAll('wbr')).toHaveLength(9);
    expect([...(drawn?.children ?? [])].filter((e) => e.tagName === 'SPAN').map((e) => e.textContent)).toEqual([
      '0x',
      '3C44',
      'CdDd',
      'B6a9',
      '00fa',
      '2b58',
      '5dd2',
      '99e0',
      '3d12',
      'FA42',
      '93BC',
    ]);
    // A screen reader reads the sentence with the address once, whole.
    expect(summary.textContent).toBe(`Check in as the owner of vault ${V}${V}: this resets the timer.`);
  });

  it('becomes the receipt once every step is confirmed: each fact once, nothing left of the review', () => {
    const done: TxPlan = {
      ...PLAN,
      steps: [{ ...step('one'), action: 'createVault' }, step('two'), step('three')],
      warnings: [{ code: 'RECOVERY_POWER', message: 'x', params: { k: 2, guardians: 3, window: 86_400 } }],
    };
    const view = done.steps.reduce(
      (v, _s, index) => applyStep(v, { index, phase: 'confirmed', hash: H }),
      txView(done),
    );
    const runner = runnerOf(done, {
      view,
      confirmed: 3,
      committed: true,
      explorer: EXPLORER,
      result: { vault: V, steps: [] },
      receipt: done.steps.map((s, index) => ({
        index,
        action: s.action,
        hash: H,
        blockNumber: 7n,
        time: null,
        events: [],
      })),
    });
    const { unmount } = renderWithProviders(<TxCard runner={runner} label="Send" />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe('Signed and recorded');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(screen.queryAllByRole('heading')).toHaveLength(1);
    // The three steps went in one transaction: the header counts what the chain recorded.
    expect(screen.getByText('One transaction')).toBeTruthy();
    // No progress bar, no warning, no list of steps to review: the Receipt says it, each step once.
    expect(screen.queryByTestId('tx-progress')).toBeNull();
    expect(screen.queryByTestId('warning-RECOVERY_POWER')).toBeNull();
    expect(screen.queryByRole('list', { name: 'What this does' })).toBeNull();
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.queryByText('Recorded on chain')).toBeNull();
    expect(screen.queryByText('Technical details')).toBeNull();
    expect(screen.queryByTestId('tx-irreversible-0')).toBeNull();
    expect(screen.getAllByText('Create the vault')).toHaveLength(1);
    const first = within(screen.getByTestId('tx-done')).getByTestId('tx-step-0');
    expect(first.getAttribute('data-phase')).toBe('confirmed');
    expect(first.textContent).toBe('Create the vault');
    // One link per transaction, in the receipt.
    expect(screen.getAllByRole('link', { name: /OKLink/ })).toHaveLength(1);
    unmount();
    renderWithProviders(<TxCard runner={runner} label="Gửi" title="Tạo vault" />, { lang: 'vi' });
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Tạo vault');
  });

  it("says RECOVERY_POWER in the reader's words", () => {
    const warned: TxPlan = {
      ...PLAN,
      warnings: [{ code: 'RECOVERY_POWER', message: 'x', params: { k: 2, guardians: 3, window: 86_400 } }],
    };
    renderWithProviders(<TxCard runner={runnerOf(warned)} label="Gửi" />, { lang: 'vi' });
    expect(screen.getByTestId('warning-RECOVERY_POWER').textContent).toContain('2 trên 3 người giám hộ');
  });

  it('an unsettled bundle shows its id as text and offers Check again, not Send', () => {
    const recheck = vi.fn();
    const unsettled = {
      kind: 'bundle' as const,
      base: 0,
      calls: { id: '<b>id</b>', status: 'pending' as const, hashes: [], ok: false },
    };
    renderWithProviders(
      <TxCard runner={runnerOf(PLAN, { blocker: 'unsettled', unsettled, committed: true, recheck })} label="Send" />,
    );
    const banner = screen.getByTestId('tx-unsettled');
    expect(banner.querySelector('[data-untrusted]')?.textContent).toBe('<b>id</b>');
    expect(banner.querySelector('b')).toBeNull();
    expect(screen.queryByTestId('tx-send')).toBeNull();
    fireEvent.click(screen.getByTestId('tx-recheck'));
    expect(recheck).toHaveBeenCalledTimes(1);
  });
});
