// @vitest-environment happy-dom
import { AtropyleError, GUARDIAN_WARNING, type PreparedTx, type TxPlan, type VaultSnapshot } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vaultView } from '../../src/lib/vault-view';
import { GuardianPanel } from '../../src/pages/guardian-panel';
import { AppContext } from '../../src/ui/app-context';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const step: PreparedTx = {
  chainId: 31337,
  from: PEOPLE.g1,
  to: PEOPLE.vault,
  data: '0x',
  value: 0n,
  action: 'voteRecovery',
  summary: 'Vote',
  warnings: [GUARDIAN_WARNING],
  simulation: { ok: true, gas: 50_000n },
};
const plan: TxPlan = {
  chainId: 31337,
  from: PEOPLE.g1,
  vault: PEOPLE.vault,
  steps: [step],
  summary: 'Plan',
  warnings: [GUARDIAN_WARNING],
};

function mount(snap: VaultSnapshot, lang: 'en' | 'vi' = 'en', o: { prepare?: () => Promise<TxPlan> } = {}) {
  const account = PEOPLE.g1;
  const prepare = vi.fn(o.prepare ?? (async () => plan));
  const sdk = {
    atro: {
      chain: { id: 31337 },
      vault: () => ({ prepare }),
      send: () => new Promise(() => {}),
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: fixtureDeployment({ chainId: 31337, explorerUrl: null }),
  };
  const value = {
    lang,
    env: { docsPath: null, telegramBot: null },
    sdk,
    wallet: { account, chainId: 31337 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  const ui = (next: VaultSnapshot) => (
    <AppContext.Provider value={value}>
      <GuardianPanel
        sdk={sdk as never}
        snap={next}
        view={vaultView(next, fixtureTimeline(), account)}
        account={account}
        onChanged={() => {}}
      />
    </AppContext.Provider>
  );
  const { rerender } = render(ui(snap));
  return { prepare, rerender: (next: VaultSnapshot) => rerender(ui(next)) };
}

const input = (id: string, value: string) => fireEvent.input(screen.getByTestId(id), { target: { value } });

describe('guardian panel', () => {
  it('states the recovery power with k above the vote form, in both languages', () => {
    mount(fixtureSnapshot());
    const power = screen.getByTestId('guardian-power');
    expect(power.textContent).toBe(
      "2 guardians who agree, you included, can move everything in the vault to a wallet you choose. It is meant for the owner's new wallet if they lose their key. The owner can stop it only by checking in before the window ends.",
    );
    // The power comes before the first field of the vote form.
    expect(
      power.compareDocumentPosition(screen.getByTestId('guardian-target')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('guardian-vote-title').textContent).toBe(
      'Vote to move everything in the vault to a new wallet',
    );
    cleanup();
    mount(fixtureSnapshot(), 'vi');
    expect(screen.getByTestId('guardian-power').textContent).toBe(
      '2 người giám hộ cùng đồng ý, trong đó có bạn, thì có thể chuyển toàn bộ tài sản trong vault sang một ví do bạn chọn. Tính năng này dành cho ví mới của chủ vault nếu họ mất khoá. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động.',
    );
  });

  it('always shows the out-of-band warning with plain advice, even when the vote form is hidden', () => {
    const snap = fixtureSnapshot();
    snap.config.recoveryEnabled = false;
    mount(snap);
    const warning = screen.getByTestId('guardian-warning');
    expect(warning.textContent).toContain(GUARDIAN_WARNING.message);
    expect(warning.textContent).toContain('never vote because of a message');
    expect(screen.queryByTestId('guardian-target')).toBeNull();
    expect(screen.queryByTestId('guardian-power')).toBeNull();
  });

  it('never fills the vote from the URL', () => {
    window.location.hash = `#/v/${PEOPLE.vault}?target=${PEOPLE.stranger}&to=${PEOPLE.stranger}`;
    mount(fixtureSnapshot());
    expect((screen.getByTestId('guardian-target') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('guardian-target-again') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('guardian-vote') as HTMLButtonElement).disabled).toBe(true);
  });

  it('needs the same valid address twice before the vote can be prepared', async () => {
    const { prepare } = mount(fixtureSnapshot());
    input('guardian-target', PEOPLE.stranger);
    input('guardian-target-again', PEOPLE.owner);
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('mismatch');
    expect((screen.getByTestId('guardian-vote') as HTMLButtonElement).disabled).toBe(true);
    input('guardian-target-again', '0x1234');
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('invalid');
    input('guardian-target-again', PEOPLE.stranger.toLowerCase());
    expect(screen.queryByTestId('guardian-target-error')).toBeNull();
    fireEvent.click(screen.getByTestId('guardian-vote'));
    await screen.findByTestId('guardian-vote-tx-send');
    expect(prepare).toHaveBeenCalledWith({ type: 'voteRecovery', target: PEOPLE.stranger }, { as: PEOPLE.g1 });
  });

  it("shows every guardian's confirmation and vote, and the tally", () => {
    const snap = fixtureSnapshot();
    snap.status.inhVoters = [PEOPLE.g2];
    snap.status.recVotes = [
      { guardian: PEOPLE.g1, target: PEOPLE.stranger },
      { guardian: PEOPLE.g2, target: null },
      { guardian: PEOPLE.heirB, target: PEOPLE.stranger },
    ];
    mount(snap);
    const row = (g: string) => screen.getByTestId(`guardian-row-${g.toLowerCase()}`);
    expect(row(PEOPLE.g1).getAttribute('data-target')).toBe(PEOPLE.stranger);
    expect(row(PEOPLE.g2).getAttribute('data-attested')).toBe('true');
    expect(row(PEOPLE.g2).getAttribute('data-target')).toBe('');
    expect(row(PEOPLE.heirB).getAttribute('data-target')).toBe(PEOPLE.stranger);
    expect(screen.getByTestId(`guardian-tally-${PEOPLE.stranger.toLowerCase()}`).textContent).toContain('2 of 2 votes');
    expect(screen.getByTestId('guardian-withdraw')).toBeTruthy();
  });

  it('prepares attestDeath from the confirmation button', async () => {
    const { prepare } = mount(fixtureSnapshot());
    fireEvent.click(screen.getByTestId('guardian-attest'));
    await waitFor(() => expect(prepare).toHaveBeenCalledWith({ type: 'attestDeath', on: true }, { as: PEOPLE.g1 }));
  });

  it('keeps a committed vote mounted and the target fields read-only while the plan is held', async () => {
    const { prepare, rerender } = mount(fixtureSnapshot());
    input('guardian-target', PEOPLE.stranger);
    input('guardian-target-again', PEOPLE.stranger);
    const first = screen.getByTestId('guardian-target') as HTMLInputElement;
    const again = screen.getByTestId('guardian-target-again') as HTMLInputElement;
    expect(first.readOnly).toBe(false);
    fireEvent.click(screen.getByTestId('guardian-vote'));
    fireEvent.click(await screen.findByTestId('guardian-vote-tx-send'));
    await waitFor(() => expect(first.readOnly && again.readOnly).toBe(true));
    // A keystroke that reaches the field anyway must not unmount the vote that was sent.
    input('guardian-target', PEOPLE.owner);
    expect(screen.getByTestId('guardian-vote-tx')).toBeTruthy();
    const voted = fixtureSnapshot();
    voted.status.recVotes = [{ guardian: PEOPLE.g1, target: PEOPLE.stranger }];
    rerender(voted);
    expect(screen.getByTestId('guardian-vote-tx')).toBeTruthy();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('keeps Withdraw mounted after the vote it clears is gone, and prepares a null target', async () => {
    const snap = fixtureSnapshot();
    snap.status.recVotes = [{ guardian: PEOPLE.g1, target: PEOPLE.stranger }];
    const { prepare, rerender } = mount(snap);
    fireEvent.click(screen.getByTestId('guardian-withdraw'));
    await screen.findByTestId('guardian-withdraw-tx-send');
    expect(prepare).toHaveBeenCalledWith({ type: 'voteRecovery', target: null }, { as: PEOPLE.g1 });
    rerender(fixtureSnapshot());
    expect(screen.getByTestId('guardian-withdraw-tx')).toBeTruthy();
  });

  it('hides the vote and attest sections once the vault is released', () => {
    const snap = fixtureSnapshot();
    snap.status.state = 'releasedInherit';
    mount(snap);
    expect(screen.getByTestId('guardian-warning')).toBeTruthy();
    expect(screen.queryByTestId('guardian-attest')).toBeNull();
    expect(screen.queryByTestId('guardian-target')).toBeNull();
    expect(screen.queryByTestId('guardian-vote')).toBeNull();
  });

  it('shows the decoded failure and disables Send for a target the contract refuses', async () => {
    const refused: TxPlan = {
      ...plan,
      steps: [{ ...step, simulation: { ok: false, error: new AtropyleError('INVALID_TARGET').toJSON() } }],
    };
    mount(fixtureSnapshot(), 'en', { prepare: async () => refused });
    input('guardian-target', PEOPLE.owner);
    input('guardian-target-again', PEOPLE.owner);
    fireEvent.click(screen.getByTestId('guardian-vote'));
    const send = (await screen.findByTestId('guardian-vote-tx-send')) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByTestId('error').getAttribute('data-code')).toBe('INVALID_TARGET');
  });
});
