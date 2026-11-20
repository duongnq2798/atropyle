// @vitest-environment happy-dom
import type { PreparedTx, TxPlan, VaultSnapshot } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultPage } from '../../src/pages/vault';
import { AppContext } from '../../src/ui/app-context';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('@atropyle/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atropyle/sdk')>()),
  timelineOf: () => fixtureTimeline(),
}));

afterEach(cleanup);

const step: PreparedTx = {
  chainId: 31337,
  from: PEOPLE.owner,
  to: PEOPLE.vault,
  data: '0x',
  value: 0n,
  action: 'checkIn',
  summary: 'Save',
  warnings: [],
  simulation: { ok: true, gas: 50_000n },
};
const plan: TxPlan = {
  chainId: 31337,
  from: PEOPLE.owner,
  vault: PEOPLE.vault,
  steps: [step],
  summary: 'Plan',
  warnings: [],
};

function mount(snap: VaultSnapshot, account: string | null, lang: 'en' | 'vi' = 'en') {
  const prepare = vi.fn(async () => plan);
  const sdk = {
    atro: {
      chain: { id: 31337 },
      vault: () => ({ snapshot: async () => snap, prepare }),
      engineFor: async () => ({}),
      send: () => new Promise(() => {}),
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: { factory: snap.binding.factory, explorerUrl: null },
  };
  const value = {
    lang,
    env: { docsPath: null, telegramBot: null },
    sdk,
    wallet: account ? { account, chainId: 31337 } : null,
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  render(
    <AppContext.Provider value={value}>
      <VaultPage sdk={sdk as never} vault={PEOPLE.vault} />
    </AppContext.Provider>,
  );
  return { prepare };
}

const click = (id: string) => fireEvent.click(screen.getByTestId(id));

describe('vault page', () => {
  it('states the power of recovery with k, in both languages', async () => {
    mount(fixtureSnapshot(), null);
    const status = await screen.findByTestId('vault-status');
    expect(status.textContent).toContain(
      'Recovery is on: 2 guardians who agree can move everything in the vault to a wallet they choose. You can stop it only by checking in before the window ends.',
    );
    cleanup();
    mount(fixtureSnapshot(), null, 'vi');
    expect((await screen.findByTestId('vault-status')).textContent).toContain(
      'Đã bật khôi phục: 2 người giám hộ cùng đồng ý thì có thể chuyển toàn bộ tài sản trong vault sang một ví do họ chọn.',
    );
  });

  it('says nothing about recovery when it is off and shows no owner panel to a stranger', async () => {
    const snap = fixtureSnapshot();
    snap.config.recoveryEnabled = false;
    mount(snap, PEOPLE.stranger);
    const status = await screen.findByTestId('vault-status');
    expect(status.textContent).not.toContain('Recovery is on');
    expect(screen.getByTestId('vault-state').getAttribute('data-state')).toBe('active');
    expect(screen.queryByTestId('owner-panel')).toBeNull();
    expect(screen.getByTestId('vault-roles').textContent).toContain('no role');
  });

  it('says in the owner panel that a check-in also stops a pending recovery', async () => {
    mount(fixtureSnapshot(), PEOPLE.owner);
    const panel = await screen.findByTestId('owner-panel');
    expect(panel.textContent).toContain('stops a pending recovery');
  });

  it('loads the guardian editor from the on-chain config, including recoveryEnabled', async () => {
    for (const on of [true, false]) {
      const snap = fixtureSnapshot();
      snap.config.recoveryEnabled = on;
      mount(snap, PEOPLE.owner);
      await screen.findByTestId('owner-panel');
      click('owner-edit-guardians');
      expect((screen.getByTestId('owner-recovery') as HTMLInputElement).checked).toBe(on);
      expect((screen.getByTestId('owner-k') as HTMLInputElement).value).toBe('2');
      cleanup();
    }
  });

  it('makes the editors read-only while a plan is held and editable again after Start over', async () => {
    const { prepare } = mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    click('owner-edit-heirs');
    const field = () => screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement;
    expect(field().disabled).toBe(false);
    fireEvent.input(screen.getByTestId('owner-heir-0-percent'), { target: { value: '60' } });
    click('owner-save');
    await screen.findByTestId('owner-save-tx-send');
    expect(prepare).toHaveBeenCalledOnce();
    await waitFor(() => expect(field().disabled).toBe(true));
    click('owner-save-tx-send');
    await waitFor(() => expect(screen.queryByTestId('owner-save-reset')).toBeNull());
    expect(field().disabled).toBe(true);
  });

  it('unlocks the editors when the plan is dropped', async () => {
    mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    click('owner-edit-timing');
    click('owner-save');
    await screen.findByTestId('owner-save-tx-send');
    await waitFor(() => expect((screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement).disabled).toBe(true));
    click('owner-save-reset');
    await waitFor(() => expect((screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement).disabled).toBe(false));
  });
});
