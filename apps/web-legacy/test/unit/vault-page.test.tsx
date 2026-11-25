// @vitest-environment happy-dom
import { AtropyleError, type PreparedTx, type TxPlan, type VaultSnapshot } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultPage } from '../../src/pages/vault';
import { AppContext } from '../../src/ui/app-context';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

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
const twoSteps: TxPlan = { ...plan, steps: [step, { ...step, summary: 'Approve' }] };

type Send = (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<unknown>;

function mount(
  first: VaultSnapshot,
  account: string | null,
  lang: 'en' | 'vi' = 'en',
  o: { prepare?: () => Promise<TxPlan>; send?: Send; registered?: boolean } = {},
) {
  let snap = first;
  const prepare = vi.fn(o.prepare ?? (async () => plan));
  const registered = vi.fn(async (_o?: { blockNumber?: bigint }) => o.registered ?? true);
  const sdk = {
    atro: {
      chain: { id: 31337 },
      vault: () => ({ snapshot: async () => snap, prepare, registered }),
      engineFor: async () => ({}),
      send: o.send ?? (() => new Promise(() => {})),
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: { ...fixtureDeployment({ chainId: 31337, explorerUrl: null }), factory: first.binding.factory },
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
  return {
    prepare,
    registered,
    setSnap: (next: VaultSnapshot) => {
      snap = next;
    },
  };
}

const click = (id: string) => fireEvent.click(screen.getByTestId(id));

describe('vault page', () => {
  it('refuses a contract the factory did not create: a hard error, no role panel and no action', async () => {
    // It answers every vault read, names the real factory and lists the owner's half-covered token.
    const { registered, prepare } = mount(fixtureSnapshot(), PEOPLE.owner, 'en', { registered: false });
    const banner = await screen.findByTestId('vault-not-registered');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('not a vault created by the Atropyle factory');
    expect(banner.textContent).toContain('Do not approve anything');
    expect(registered).toHaveBeenCalledWith({ blockNumber: 100n });
    for (const id of ['owner-panel', 'guardian-panel', 'heir-panel', 'vault-status', 'vault-assets', 'vault-roles']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(prepare).not.toHaveBeenCalled();
    cleanup();
    mount(fixtureSnapshot(), PEOPLE.owner, 'vi', { registered: false });
    expect((await screen.findByTestId('vault-not-registered')).textContent).toContain('Đừng approve');
  });

  it('shows the owner panel of a vault the factory created', async () => {
    const { registered } = mount(fixtureSnapshot(), PEOPLE.owner);
    expect(await screen.findByTestId('owner-panel')).toBeTruthy();
    expect(registered).toHaveBeenCalledWith({ blockNumber: 100n });
    expect(screen.queryByTestId('vault-not-registered')).toBeNull();
  });

  it('states the power of recovery with k of n and the window, in words that fit the viewer, in both languages', async () => {
    const power =
      'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose.';
    for (const viewer of [null, PEOPLE.stranger, PEOPLE.g1]) {
      mount(fixtureSnapshot(), viewer);
      const banner = await screen.findByTestId('vault-recovery-power');
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.textContent).toBe(
        `${power} The owner can stop it only by checking in before the 2m alarm window ends.`,
      );
      expect(screen.getByTestId('vault-status').contains(banner)).toBe(true);
      cleanup();
    }
    mount(fixtureSnapshot(), PEOPLE.owner);
    expect((await screen.findByTestId('vault-recovery-power')).textContent).toBe(
      `${power} You can stop it only by checking in before the 2m alarm window ends.`,
    );
    cleanup();
    mount(fixtureSnapshot(), null, 'vi');
    expect((await screen.findByTestId('vault-recovery-power')).textContent).toBe(
      'Đã bật khôi phục ví: 2 trên 3 người giám hộ cùng hành động thì có thể chuyển 100% tài sản vault đang phủ sang bất kỳ ví nào họ chọn. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động 2m.',
    );
    cleanup();
    mount(fixtureSnapshot(), PEOPLE.owner, 'vi');
    expect((await screen.findByTestId('vault-recovery-power')).textContent).toContain(
      'Bạn chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động 2m.',
    );
  });

  it('drops the recovery power warning once the vault is released, and with k = 0', async () => {
    const released = fixtureSnapshot();
    released.status.state = 'releasedInherit';
    mount(released, null);
    await screen.findByTestId('vault-status');
    expect(screen.queryByTestId('vault-recovery-power')).toBeNull();
    cleanup();
    const noK = fixtureSnapshot();
    noK.config.k = 0;
    mount(noK, null);
    await screen.findByTestId('vault-status');
    expect(screen.queryByTestId('vault-recovery-power')).toBeNull();
  });

  it('warns every viewer about a pending recovery, with its wallet and the time left', async () => {
    const pending = () => {
      const snap = fixtureSnapshot();
      snap.status.state = 'recovery';
      snap.status.recoveryTarget = PEOPLE.stranger;
      snap.status.alarmAt = 900n;
      snap.status.windowEndsAt = 4_600n;
      return snap;
    };
    for (const viewer of [null, PEOPLE.heirA, PEOPLE.g1]) {
      mount(pending(), viewer);
      const banner = await screen.findByTestId('vault-recovery');
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.textContent).toContain('A recovery is pending');
      expect(banner.textContent).toContain(PEOPLE.stranger);
      // The card's clock ticks every second.
      expect(banner.textContent).toMatch(/Time left: (1h|59m 5\ds)\./);
      expect(banner.textContent).toContain('The owner can stop it by checking in before the window ends.');
      expect(banner.textContent).not.toContain('You can stop it');
      cleanup();
    }
    mount(pending(), PEOPLE.owner);
    const own = await screen.findByTestId('vault-recovery');
    expect(own.textContent).toContain('You can stop it by checking in before the window ends.');
    expect(own.textContent).not.toContain('The owner can stop it');
    cleanup();
    mount(pending(), PEOPLE.owner, 'vi');
    const vi = (await screen.findByTestId('vault-recovery')).textContent;
    expect(vi).toContain('Đang chờ khôi phục');
    expect(vi).toContain('Bạn có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động.');
    cleanup();
    // Past the window there is no "before the window ends" left to offer.
    const late = pending();
    late.status.windowEndsAt = 400n;
    mount(late, null);
    const ended = (await screen.findByTestId('vault-recovery')).textContent;
    expect(ended).toMatch(/The window ended 10m( \ds)? ago\./);
    expect(ended).not.toContain('can stop it');
    cleanup();
    // No banner outside the recovery state.
    mount(fixtureSnapshot(), null);
    await screen.findByTestId('vault-status');
    expect(screen.queryByTestId('vault-recovery')).toBeNull();
  });

  it('says nothing about recovery when it is off and shows no owner panel to a stranger', async () => {
    const snap = fixtureSnapshot();
    snap.config.recoveryEnabled = false;
    mount(snap, PEOPLE.stranger);
    const status = await screen.findByTestId('vault-status');
    expect(status.textContent).not.toContain('recovery is on');
    expect(screen.queryByTestId('vault-recovery-power')).toBeNull();
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

  it('makes the editors and tabs read-only while a plan is held', async () => {
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
    expect((screen.getByTestId('owner-edit-timing') as HTMLButtonElement).disabled).toBe(true);
    click('owner-save-tx-send');
    await waitFor(() => expect(screen.queryByTestId('owner-save-reset')).toBeNull());
    expect(field().disabled).toBe(true);
  });

  it('unlocks the editors when the plan is dropped with Start over', async () => {
    mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    click('owner-edit-timing');
    click('owner-save');
    await screen.findByTestId('owner-save-tx-send');
    await waitFor(() => expect((screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement).disabled).toBe(true));
    click('owner-save-reset');
    await waitFor(() => expect((screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement).disabled).toBe(false));
  });

  it('locks the editors and tabs while the plan is still preparing', async () => {
    let resolve: (p: TxPlan) => void = () => {};
    mount(fixtureSnapshot(), PEOPLE.owner, 'en', {
      prepare: () =>
        new Promise<TxPlan>((r) => {
          resolve = r;
        }),
    });
    await screen.findByTestId('owner-panel');
    click('owner-edit-heirs');
    click('owner-save');
    await waitFor(() => expect((screen.getByTestId('owner-edit-fields') as HTMLFieldSetElement).disabled).toBe(true));
    expect((screen.getByTestId('owner-edit-timing') as HTMLButtonElement).disabled).toBe(true);
    resolve(plan);
    await screen.findByTestId('owner-save-tx-send');
  });

  it('keeps a half-sent multi-step save through a refresh that changes the config', async () => {
    const send: Send = async (p, _w, o) => {
      o.onStep?.({ index: 0, total: 2, step: p.steps[0], phase: 'confirmed', hash: `0x${'12'.repeat(32)}` });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    const { setSnap } = mount(fixtureSnapshot(), PEOPLE.owner, 'en', { prepare: async () => twoSteps, send });
    await screen.findByTestId('owner-panel');
    click('owner-edit-assets');
    click('owner-save');
    const sendButton = await screen.findByTestId('owner-save-tx-send');
    fireEvent.click(sendButton);
    await waitFor(() => expect(screen.getByTestId('owner-save-tx-send').textContent).toContain('Resume from step 2'));
    expect(screen.getByTestId('owner-save-tx-step-0').getAttribute('data-phase')).toBe('confirmed');

    const changed = fixtureSnapshot();
    changed.config.assets = [changed.config.assets[0]];
    changed.status.blockNumber = 101n;
    setSnap(changed);
    click('vault-refresh');
    await waitFor(() => expect(screen.getByTestId('vault-status').textContent).toContain('As of block 101'));
    expect(screen.getByTestId('owner-save-tx-send').textContent).toContain('Resume from step 2');
    expect((screen.getByTestId('owner-edit-assets') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('owner-save-reset')).toBeNull();
  });

  it('keeps a half-sent Fix coverage through a refresh that shows full coverage', async () => {
    const send: Send = async (p, _w, o) => {
      o.onStep?.({ index: 0, total: 2, step: p.steps[0], phase: 'confirmed', hash: `0x${'34'.repeat(32)}` });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    const { setSnap } = mount(fixtureSnapshot(), PEOPLE.owner, 'en', { prepare: async () => twoSteps, send });
    await screen.findByTestId('owner-panel');
    click('owner-fix-coverage');
    fireEvent.click(await screen.findByTestId('owner-fix-coverage-tx-send'));
    await waitFor(() =>
      expect(screen.getByTestId('owner-fix-coverage-tx-send').textContent).toContain('Resume from step 2'),
    );

    // Step 1 already approved the ERC-20 in full: the refreshed snapshot has no low coverage left.
    const covered = fixtureSnapshot();
    covered.status.assets[0].coverage = covered.status.assets[0].held;
    covered.status.blockNumber = 101n;
    setSnap(covered);
    click('vault-refresh');
    await waitFor(() => expect(screen.getByTestId('vault-status').textContent).toContain('As of block 101'));
    expect(screen.queryByTestId('coverage-low')).toBeNull();
    expect(screen.getByTestId('owner-fix-coverage-tx-send').textContent).toContain('Resume from step 2');
    expect(screen.getByTestId('owner-fix-coverage-tx-step-0').getAttribute('data-phase')).toBe('confirmed');
  });

  it('shows which heir each NFT goes to', async () => {
    mount(fixtureSnapshot(), null);
    const nft = await screen.findByTestId('asset-1-heir');
    expect(nft.textContent).toBe(`Goes to ${PEOPLE.heirB}`);
    expect(screen.queryByTestId('asset-0-heir')).toBeNull();
    cleanup();
    mount(fixtureSnapshot(), null, 'vi');
    expect((await screen.findByTestId('asset-1-heir')).textContent).toBe(`Thuộc về ${PEOPLE.heirB}`);
  });

  it('warns when a heir edit hands an NFT to someone else, and saves only after the owner acknowledges it', async () => {
    const { prepare } = mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    click('owner-edit-heirs');
    const save = () => screen.getByTestId('owner-save') as HTMLButtonElement;
    expect(screen.queryByTestId('owner-nft-remap')).toBeNull();
    expect(save().disabled).toBe(false);

    // Removing heir A shifts heir B to position 0; the NFT names position 1, which disappears.
    click('owner-remove-heir-0');
    const warning = screen.getByTestId('owner-nft-remap');
    expect(warning.getAttribute('role')).toBe('alert');
    const row = screen.getByTestId('owner-nft-remap-1');
    expect(row.textContent).toContain('Asset 2');
    expect(row.textContent).toContain('MNFT');
    expect(row.textContent).toContain('id 2');
    expect(row.textContent).toContain(PEOPLE.heirB);
    expect(row.textContent).toContain('no heir');
    expect(row.querySelectorAll('.untrusted').length).toBeGreaterThan(0);
    expect(warning.textContent).toContain('Assets tab');
    expect(save().disabled).toBe(true);
    click('owner-save');
    expect(prepare).not.toHaveBeenCalled();

    click('owner-nft-remap-ack');
    expect(save().disabled).toBe(false);
    // A change to who receives the NFT asks again.
    click('owner-add-heir');
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(screen.getByTestId('owner-nft-remap-1').textContent).toContain('an empty address field');
    fireEvent.input(screen.getByTestId('owner-heir-1-account'), { target: { value: PEOPLE.stranger } });
    await waitFor(() => expect(screen.getByTestId('owner-nft-remap-1').textContent).toContain(PEOPLE.stranger));
    expect(save().disabled).toBe(true);
    expect((screen.getByTestId('owner-nft-remap-ack') as HTMLInputElement).checked).toBe(false);
    click('owner-nft-remap-ack');
    click('owner-save');
    await screen.findByTestId('owner-save-tx-send');
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('names the new recipient of an NFT when two heirs swap places, in both languages', async () => {
    for (const lang of ['en', 'vi'] as const) {
      mount(fixtureSnapshot(), PEOPLE.owner, lang);
      await screen.findByTestId('owner-panel');
      click('owner-edit-heirs');
      fireEvent.input(screen.getByTestId('owner-heir-0-account'), { target: { value: PEOPLE.heirB } });
      fireEvent.input(screen.getByTestId('owner-heir-1-account'), { target: { value: PEOPLE.heirA } });
      const row = await screen.findByTestId('owner-nft-remap-1');
      expect(row.textContent).toContain(PEOPLE.heirB);
      expect(row.textContent).toContain(PEOPLE.heirA);
      expect(screen.getByTestId('owner-nft-remap').textContent).toContain(lang === 'en' ? 'Assets tab' : 'thẻ Tài sản');
      cleanup();
    }
  });

  it('asks nothing when a heir edit changes only the shares', async () => {
    mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    click('owner-edit-heirs');
    fireEvent.input(screen.getByTestId('owner-heir-0-percent'), { target: { value: '60' } });
    fireEvent.input(screen.getByTestId('owner-heir-1-percent'), { target: { value: '40' } });
    expect(screen.queryByTestId('owner-nft-remap')).toBeNull();
    expect((screen.getByTestId('owner-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the guardian panel by role, Raise alarm to every other wallet, and neither to the owner', async () => {
    mount(fixtureSnapshot(), PEOPLE.owner);
    await screen.findByTestId('owner-panel');
    expect(screen.queryByTestId('guardian-panel')).toBeNull();
    expect(screen.queryByTestId('heir-panel')).toBeNull();
    expect(screen.queryByTestId('heir-poke')).toBeNull();
    cleanup();
    mount(fixtureSnapshot(), PEOPLE.g1);
    expect(await screen.findByTestId('guardian-panel')).toBeTruthy();
    expect(screen.getByTestId('heir-panel').getAttribute('data-heir')).toBe('false');
    expect(screen.getByTestId('heir-poke')).toBeTruthy();
    expect(screen.queryByTestId('owner-panel')).toBeNull();
    cleanup();
    mount(fixtureSnapshot(), PEOPLE.heirB);
    expect(await screen.findByTestId('guardian-panel')).toBeTruthy();
    expect(screen.getByTestId('heir-panel').getAttribute('data-heir')).toBe('true');
    cleanup();
    // Spec §16.4: anyone can poke. A wallet with no role gets the same button, in neutral words, and no guardian panel.
    mount(fixtureSnapshot(), PEOPLE.stranger);
    expect((await screen.findByTestId('heir-panel')).getAttribute('data-heir')).toBe('false');
    expect(screen.getByTestId('heir-anyone').textContent).toContain('not to you');
    expect(screen.getByTestId('heir-poke')).toBeTruthy();
    expect(screen.queryByTestId('guardian-panel')).toBeNull();
    cleanup();
    // Nothing for a page without a wallet.
    mount(fixtureSnapshot(), null);
    await screen.findByTestId('vault-status');
    expect(screen.queryByTestId('heir-panel')).toBeNull();
  });

  it('gives an owner who is also an heir the check-in only', async () => {
    const snap = fixtureSnapshot();
    snap.config.heirs[0] = { account: PEOPLE.owner, bps: 7000 };
    mount(snap, PEOPLE.owner);
    expect((await screen.findByTestId('owner-panel')).textContent).toContain('Check in');
    expect(screen.queryByTestId('heir-panel')).toBeNull();
    expect(screen.queryByTestId('heir-poke')).toBeNull();
  });

  it('gives the heir panel the recovery target of a pending recovery', async () => {
    const snap = fixtureSnapshot();
    snap.status.state = 'recovery';
    snap.status.recoveryTarget = PEOPLE.stranger;
    mount(snap, PEOPLE.stranger);
    const text = (await screen.findByTestId('heir-recovery')).textContent ?? '';
    expect(text).toContain(PEOPLE.stranger);
  });
});
