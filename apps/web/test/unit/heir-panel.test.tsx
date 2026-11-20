// @vitest-environment happy-dom
import type { PreparedTx, SendResult, StateName, TxPlan, VaultEvent } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import type { Address } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vaultView } from '../../src/lib/vault-view';
import { HeirPanel } from '../../src/pages/heir-panel';
import { AppContext } from '../../src/ui/app-context';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

afterEach(cleanup);

const H = `0x${'ab'.repeat(32)}` as const;
const step: PreparedTx = {
  chainId: 31337,
  from: PEOPLE.heirA,
  to: PEOPLE.vault,
  data: '0x',
  value: 0n,
  action: 'distribute',
  summary: 'Claim',
  warnings: [],
  simulation: { ok: true, gas: 50_000n },
};
const plan: TxPlan = {
  chainId: 31337,
  from: PEOPLE.heirA,
  vault: PEOPLE.vault,
  steps: [step],
  summary: 'Plan',
  warnings: [],
};
const ev = (name: string, args: Record<string, unknown>, logIndex: number): VaultEvent => ({
  address: PEOPLE.vault,
  name,
  args,
  blockNumber: 100n,
  logIndex,
  transactionHash: H,
});

interface Opts {
  state?: StateName;
  recoveryTarget?: Address | null;
  lang?: 'en' | 'vi';
  events?: () => Promise<VaultEvent[]>;
  send?: () => Promise<SendResult>;
  blockNumber?: bigint;
  factoryBlock?: bigint;
}

function mount(o: Opts = {}) {
  const snap = fixtureSnapshot();
  snap.status.state = o.state ?? 'grace';
  snap.status.blockNumber = o.blockNumber ?? 50_000n;
  snap.status.recoveryTarget = o.recoveryTarget ?? null;
  const events = vi.fn(o.events ?? (async () => []));
  const sdk = {
    atro: {
      chain: { id: 31337 },
      vault: () => ({ prepare: async () => plan, events }),
      send: o.send ?? (() => new Promise(() => {})),
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: fixtureDeployment({ chainId: 31337, explorerUrl: null, factoryBlock: o.factoryBlock ?? 1n }),
  };
  const value = {
    lang: o.lang ?? 'en',
    env: { docsPath: null, telegramBot: null },
    sdk,
    wallet: { account: PEOPLE.heirA, chainId: 31337 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  const ui = (state: StateName, vault: Address = PEOPLE.vault) => {
    const next = { ...snap, status: { ...snap.status, state, vault } };
    return (
      <AppContext.Provider value={value}>
        <HeirPanel
          sdk={sdk as never}
          view={vaultView(next, fixtureTimeline(), PEOPLE.heirA)}
          recoveryTarget={snap.status.recoveryTarget}
          account={PEOPLE.heirA}
          onChanged={() => {}}
        />
      </AppContext.Provider>
    );
  };
  const { rerender } = render(ui(snap.status.state));
  return { events, rerender: (state: StateName, vault?: Address) => rerender(ui(state, vault)) };
}

describe('heir panel', () => {
  it('offers Raise alarm and no Claim before the release', () => {
    mount({ state: 'grace' });
    expect(screen.getByTestId('heir-poke')).toBeTruthy();
    expect(screen.queryByTestId('heir-claim')).toBeNull();
    expect(screen.queryByTestId('heir-recovery')).toBeNull();
  });

  it('says a recovery is pending to the target wallet, with its full address', () => {
    mount({ state: 'recovery', recoveryTarget: PEOPLE.stranger });
    const text = screen.getByTestId('heir-recovery').textContent ?? '';
    expect(text).toContain('A recovery is pending');
    expect(text).toContain(PEOPLE.stranger);
    expect(screen.getByTestId('heir-poke')).toBeTruthy();
  });

  it('says the vault was released to the recovery wallet, with its full address', () => {
    mount({ state: 'releasedRecover', recoveryTarget: PEOPLE.stranger });
    const text = screen.getByTestId('heir-recovery').textContent ?? '';
    expect(text).toContain('released to the recovery wallet');
    const help = screen.getByTestId('heir-claim-help').textContent;
    expect(help).toBe('Claim sends everything in the vault to the recovery wallet above.');
    expect(help).not.toContain('as the vault was set up');
    expect(text).toContain(PEOPLE.stranger);
    expect(screen.getByTestId('heir-claim')).toBeTruthy();
    expect(screen.queryByTestId('heir-poke')).toBeNull();
  });

  it('keeps the recovery text in Vietnamese too', () => {
    mount({ state: 'recovery', recoveryTarget: PEOPLE.stranger, lang: 'vi' });
    expect(screen.getByTestId('heir-recovery').textContent).toContain('Đang chờ khôi phục');
  });

  it('shows each transfer after Claim, from the events of the transaction', async () => {
    const send = async (): Promise<SendResult> => ({
      vault: PEOPLE.vault,
      steps: [
        {
          index: 0,
          action: 'distribute',
          hash: H,
          blockNumber: 101n,
          gasUsed: 1n,
          events: [
            ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA, amountOrId: 700_000n }, 0),
            ev('TransferFailed', { assetIndex: 1n, to: PEOPLE.heirB }, 1),
          ],
        },
      ],
    });
    mount({ state: 'releasedInherit', send });
    fireEvent.click(screen.getByTestId('heir-claim'));
    fireEvent.click(await screen.findByTestId('heir-claim-tx-send'));
    await screen.findByTestId('heir-results-0');
    expect(screen.getByTestId('heir-results-0').getAttribute('data-ok')).toBe('true');
    expect(screen.getByTestId('heir-results-1').getAttribute('data-ok')).toBe('false');
  });

  it('reads a bounded history window, and the button is disabled while it loads', async () => {
    let resolve: (e: VaultEvent[]) => void = () => {};
    const { events } = mount({
      state: 'releasedInherit',
      blockNumber: 50_000n,
      events: () =>
        new Promise<VaultEvent[]>((r) => {
          resolve = r;
        }),
    });
    const button = screen.getByTestId('heir-history') as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(events).toHaveBeenCalledWith({ fromBlock: 40_000n });
    resolve([ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA, amountOrId: 5n }, 0)]);
    await screen.findByTestId('heir-history-list-0');
    expect(button.disabled).toBe(false);
  });

  it('says the history covers the last few hours when it is empty', async () => {
    mount({ state: 'releasedInherit' });
    fireEvent.click(screen.getByTestId('heir-history'));
    expect((await screen.findByTestId('heir-history-list')).textContent).toContain('last few hours');
  });

  it('keeps the inheritance wording for Claim when the vault is released to the heirs', () => {
    mount({ state: 'releasedInherit' });
    expect(screen.getByTestId('heir-claim-help').textContent).toContain('as the vault was set up');
  });

  it('keeps Raise alarm mounted after the alarm releases the vault', async () => {
    const { rerender } = mount({ state: 'grace' });
    fireEvent.click(screen.getByTestId('heir-poke'));
    await screen.findByTestId('heir-poke-tx-send');
    rerender('releasedInherit');
    expect(screen.getByTestId('heir-poke-tx')).toBeTruthy();
  });

  it('never reads history from before the factory existed', async () => {
    const { events } = mount({ state: 'releasedInherit', blockNumber: 5_000n, factoryBlock: 4_000n });
    fireEvent.click(screen.getByTestId('heir-history'));
    await waitFor(() => expect(events).toHaveBeenCalledWith({ fromBlock: 4_000n }));
  });

  it('ignores a history response that arrives after the vault changed', async () => {
    let resolve: (e: VaultEvent[]) => void = () => {};
    const { rerender } = mount({
      state: 'releasedInherit',
      events: () =>
        new Promise<VaultEvent[]>((r) => {
          resolve = r;
        }),
    });
    fireEvent.click(screen.getByTestId('heir-history'));
    rerender('releasedInherit', PEOPLE.token);
    resolve([ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA, amountOrId: 5n }, 0)]);
    await waitFor(() => expect((screen.getByTestId('heir-history') as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId('heir-history-list-0')).toBeNull();
    expect(screen.queryByTestId('heir-history-list')).toBeNull();
  });
});
